// src/queue/provisioning-queue.ts
import { AccountLifecycleService, ProvisionUserParams } from '../services/lifecycle-service.js';
import { createHash } from 'crypto';

export type JobType = 'PROVISION_USER' | 'DEACTIVATE_USER' | 'SYNC_GROUP_MEMBERS' | 'RENAME_GROUP';

export interface ProvisioningJob {
  id: string;
  enterpriseId: string;
  jobType: JobType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export class ProvisioningQueue {
  private queue: ProvisioningJob[] = [];
  private processedKeys: Set<string> = new Set();
  private isProcessing = false;

  constructor(private lifecycleService: AccountLifecycleService) {}

  public static generateIdempotencyKey(enterpriseId: string, resourceId: string, operation: string): string {
    return createHash('sha256')
      .update(`${enterpriseId}:${resourceId}:${operation}`)
      .digest('hex');
  }

  /**
   * Enqueues a provisioning job. Returns true if queued, false if duplicate was discarded.
   */
  public enqueue(
    enterpriseId: string,
    jobType: JobType,
    resourceId: string,
    payload: Record<string, unknown>
  ): { queued: boolean; idempotencyKey: string } {
    const idempotencyKey = ProvisioningQueue.generateIdempotencyKey(enterpriseId, resourceId, jobType);

    if (this.processedKeys.has(idempotencyKey)) {
      return { queued: false, idempotencyKey };
    }

    const job: ProvisioningJob = {
      id: Math.random().toString(36).substring(2, 11),
      enterpriseId,
      jobType,
      idempotencyKey,
      payload,
      createdAt: new Date(),
    };

    this.queue.push(job);
    this.processedKeys.add(idempotencyKey);

    // Auto-process queue asynchronously
    setImmediate(() => this.processNext());

    return { queued: true, idempotencyKey };
  }

  /**
   * Executes the next job in the queue.
   */
  public async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift();
    if (!job) {
      this.isProcessing = false;
      return;
    }

    try {
      switch (job.jobType) {
        case 'PROVISION_USER': {
          this.lifecycleService.provisionOrReactivateUser(job.payload as unknown as ProvisionUserParams);
          break;
        }
        case 'DEACTIVATE_USER': {
          this.lifecycleService.deactivateUser(job.payload.userId as string, job.enterpriseId);
          break;
        }
        case 'SYNC_GROUP_MEMBERS': {
          this.lifecycleService.syncGroupMemberships(
            job.payload.groupId as string,
            job.enterpriseId,
            job.payload.userIds as string[],
            job.payload.operation as 'add' | 'remove' | 'replace'
          );
          break;
        }
        case 'RENAME_GROUP': {
          this.lifecycleService.handleGroupRename(
            job.payload.groupId as string,
            job.enterpriseId,
            job.payload.newDisplayName as string
          );
          break;
        }
      }
    } catch (err) {
      // Log failure (can re-queue or push to DLQ)
      console.error(`Error processing job ${job.id}:`, err);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    this.processedKeys.clear();
  }
}
