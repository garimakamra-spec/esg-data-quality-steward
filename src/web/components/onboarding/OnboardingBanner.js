// src/web/components/onboarding/OnboardingBanner.js

export class OnboardingBannerElement {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.userId = options.userId || 'demo-user-1';
    this.apiBaseUrl = options.apiBaseUrl || '/api/v1/onboarding/runbook';
    this.state = null;

    if (this.container) {
      this.init();
    }
  }

  async init() {
    await this.fetchState();
    this.render();
  }

  async fetchState() {
    try {
      const res = await fetch(`${this.apiBaseUrl}?userId=${encodeURIComponent(this.userId)}`);
      if (res.ok) {
        this.state = await res.json();
      } else {
        // Fallback demo mock if backend server is not actively running in standalone mode
        this.state = this.getFallbackMock();
      }
    } catch {
      this.state = this.getFallbackMock();
    }
  }

  getFallbackMock() {
    return {
      userId: this.userId,
      userName: 'Alex Rivera',
      workspaceName: 'Frontend Platform Team',
      roleKey: 'DEVELOPER',
      isDismissed: false,
      progressPercent: 33,
      completedSteps: ['step_connect_git'],
      steps: [
        { id: 'step_connect_git', label: 'Connect Git repository & SSH keys', actionRoute: '/settings/git', isCompleted: true },
        { id: 'step_first_board', label: 'Inspect the Sprint Backlog starter board', actionRoute: '/boards/sprint', isCompleted: false },
        { id: 'step_sample_query', label: 'Execute your first saved issue query', actionRoute: '/issues?q=starter', isCompleted: false }
      ]
    };
  }

  render() {
    if (!this.container || !this.state || this.state.isDismissed) {
      if (this.container) this.container.innerHTML = '';
      return;
    }

    const { userName, workspaceName, roleKey, progressPercent, steps } = this.state;
    const completedCount = steps.filter(s => s.isCompleted).length;

    this.container.innerHTML = `
      <section class="onboarding-banner" id="enterprise-onboarding-banner" aria-label="Day-0 Role Onboarding Runbook">
        <div class="banner-glow-strip"></div>
        <div class="banner-content">
          <header class="banner-header">
            <div class="banner-title-group">
              <span class="role-badge" id="banner-role-badge">${roleKey}</span>
              <div>
                <h1 class="banner-heading" id="banner-greeting">
                  Welcome to ${workspaceName}, ${userName}
                </h1>
                <p class="banner-subtitle" id="banner-subtitle">
                  Your workspace is pre-configured. Complete these quick Day-0 setup actions to get started:
                </p>
              </div>
            </div>
            <div class="banner-actions">
              <button class="btn-icon" id="btn-minimize-banner" title="Minimize runbook" aria-label="Minimize runbook">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              <button class="btn-icon" id="btn-dismiss-banner" title="Dismiss runbook" aria-label="Dismiss runbook">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </header>

          <div class="progress-row">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="runbook-progress-fill" style="width: ${progressPercent}%;"></div>
            </div>
            <span class="progress-label" id="runbook-progress-label">
              ${completedCount} / ${steps.length} Completed (${progressPercent}%)
            </span>
          </div>

          <div class="steps-grid" id="runbook-steps-grid">
            ${steps.map((step, idx) => `
              <div class="step-card ${step.isCompleted ? 'completed' : ''}" 
                   id="step-card-${step.id}" 
                   data-step-id="${step.id}" 
                   tabindex="0" 
                   role="button" 
                   aria-pressed="${step.isCompleted}">
                <div class="step-checkbox" id="checkbox-${step.id}">
                  <span class="step-checkbox-icon">&#10003;</span>
                </div>
                <div class="step-body">
                  <div class="step-title">${step.label}</div>
                  <div class="step-meta">
                    <span>${step.isCompleted ? 'Completed' : `Action ${idx + 1}`}</span>
                    &rarr; ${step.actionRoute}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Step completion toggle
    const stepCards = this.container.querySelectorAll('.step-card');
    stepCards.forEach(card => {
      card.addEventListener('click', async () => {
        const stepId = card.getAttribute('data-step-id');
        await this.toggleStep(stepId);
      });
      card.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const stepId = card.getAttribute('data-step-id');
          await this.toggleStep(stepId);
        }
      });
    });

    // Dismiss button
    const dismissBtn = this.container.querySelector('#btn-dismiss-banner');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', async () => {
        await this.dismiss();
      });
    }

    // Minimize button
    const minBtn = this.container.querySelector('#btn-minimize-banner');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        const grid = this.container.querySelector('#runbook-steps-grid');
        if (grid) {
          grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
        }
      });
    }
  }

  async toggleStep(stepId) {
    const step = this.state.steps.find(s => s.id === stepId);
    if (!step) return;

    step.isCompleted = !step.isCompleted;
    if (step.isCompleted) {
      if (!this.state.completedSteps.includes(stepId)) {
        this.state.completedSteps.push(stepId);
      }
    } else {
      this.state.completedSteps = this.state.completedSteps.filter(id => id !== stepId);
    }

    const total = this.state.steps.length;
    const completed = this.state.steps.filter(s => s.isCompleted).length;
    this.state.progressPercent = Math.round((completed / total) * 100);

    // Optimistic re-render
    this.render();

    // Background sync to API
    try {
      await fetch(`${this.apiBaseUrl}/complete-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId, stepId }),
      });
    } catch {
      // Ignored for standalone mode
    }
  }

  async dismiss() {
    const banner = this.container.querySelector('#enterprise-onboarding-banner');
    if (banner) {
      banner.classList.add('dismissed');
    }
    this.state.isDismissed = true;

    try {
      await fetch(`${this.apiBaseUrl}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.userId }),
      });
    } catch {
      // Ignored
    }
  }
}
