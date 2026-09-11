// src/app.ts
import express, { Express } from 'express';
import { InMemoryStore, globalStore } from './models/store.js';
import { AccountLifecycleService } from './services/lifecycle-service.js';
import { ProvisioningQueue } from './queue/provisioning-queue.js';
import { BlueprintSeeder } from './services/blueprint-seeder.js';
import { ScimController } from './controllers/scim-controller.js';
import { OnboardingController } from './controllers/onboarding-controller.js';
import { createTenantAuthMiddleware } from './middleware/tenant-auth.js';
import * as path from 'path';

export function createApp(store: InMemoryStore = globalStore): {
  app: Express;
  store: InMemoryStore;
  lifecycleService: AccountLifecycleService;
  queue: ProvisioningQueue;
  seeder: BlueprintSeeder;
} {
  const app = express();
  app.use(express.json({ type: ['application/json', 'application/scim+json'] }));

  const lifecycleService = new AccountLifecycleService(store);
  const queue = new ProvisioningQueue(lifecycleService);
  const seeder = new BlueprintSeeder(store);
  const scimController = new ScimController(store, lifecycleService, queue);
  const onboardingController = new OnboardingController(store, seeder);
  const tenantAuth = createTenantAuthMiddleware(store);

  // Serve static UI assets
  const webDir = path.resolve(process.cwd(), 'src', 'web');
  app.use('/static', express.static(webDir));

  // SCIM 2.0 RFC 7644 Endpoints
  const scimRouter = express.Router();
  scimRouter.use(tenantAuth);

  scimRouter.get('/ServiceProviderConfig', (req, res) => scimController.getServiceProviderConfig(req, res));
  scimRouter.get('/ResourceTypes', (req, res) => scimController.getResourceTypes(req, res));
  scimRouter.get('/Schemas', (req, res) => scimController.getSchemas(req, res));

  scimRouter.get('/Users', (req, res) => scimController.getUsers(req, res));
  scimRouter.post('/Users', (req, res) => scimController.postUser(req, res));
  scimRouter.get('/Users/:id', (req, res) => scimController.getUserById(req, res));
  scimRouter.patch('/Users/:id', (req, res) => scimController.patchUser(req, res));
  scimRouter.delete('/Users/:id', (req, res) => scimController.deleteUser(req, res));

  scimRouter.get('/Groups', (req, res) => scimController.getGroups(req, res));
  scimRouter.post('/Groups', (req, res) => scimController.postGroup(req, res));
  scimRouter.patch('/Groups/:id', (req, res) => scimController.patchGroup(req, res));

  app.use('/api/v1/scim/v2', scimRouter);

  // Onboarding Runbook Endpoints
  const onboardingRouter = express.Router();
  onboardingRouter.get('/', (req, res) => onboardingController.getRunbook(req, res));
  onboardingRouter.post('/complete-step', (req, res) => onboardingController.completeStep(req, res));
  onboardingRouter.post('/dismiss', (req, res) => onboardingController.dismiss(req, res));

  app.use('/api/v1/onboarding/runbook', onboardingRouter);

  return { app, store, lifecycleService, queue, seeder };
}
