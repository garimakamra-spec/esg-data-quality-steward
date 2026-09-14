// src/web/public/app.js
/**
 * Interactive Client Application for ESG Data Quality Steward AI Agent
 * Powers the Exception Review Console, Canvas Charting, Simulation, and Audit Ledger
 */

let allCases = [];
let currentFilter = { status: 'ALL', materiality: 'ALL' };
let selectedCaseId = null;
let currentAuditRecords = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  fetchMetrics();
  fetchCases();
  fetchAuditLedger();
  
  // Auto-refresh metrics and cases periodically
  setInterval(() => {
    fetchMetrics();
  }, 10000);
});

// Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab-btn').forEach((btn) => btn.classList.remove('active'));
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.remove('active'));

  if (tabName === 'review') {
    document.getElementById('tabReview').classList.add('active');
    document.getElementById('viewReview').classList.add('active');
    fetchCases();
  } else if (tabName === 'simulator') {
    document.getElementById('tabSimulator').classList.add('active');
    document.getElementById('viewSimulator').classList.add('active');
  } else if (tabName === 'ledger') {
    document.getElementById('tabLedger').classList.add('active');
    document.getElementById('viewLedger').classList.add('active');
    fetchAuditLedger();
  }
}

// Fetch Metrics & KPIs
async function fetchMetrics() {
  try {
    const res = await fetch('/api/v2/metrics');
    const json = await res.json();
    if (json.success && json.data) {
      const d = json.data;
      document.getElementById('kpiStpRate').textContent = `${d.stp_rate_pct}%`;
      const badge = document.getElementById('kpiStpBadge');
      if (d.stp_rate_pct >= 70) {
        badge.textContent = 'STP Target Achieved (≥70%)';
        badge.style.color = 'var(--emerald-primary)';
      } else {
        badge.textContent = 'STP Calibrating (<70%)';
        badge.style.color = 'var(--amber-warning)';
      }
      document.getElementById('kpiDefensibility').textContent = `${d.defensibility_score_pct}%`;
      document.getElementById('kpiCarbonCorrected').textContent = `-${d.total_carbon_corrected_tco2e} tCO2e`;
      document.getElementById('kpiCasesCounts').textContent = `Total: ${d.total_processed} | Pending HITL: ${d.hitl_count} | STP Auto: ${d.stp_count}`;
    }
  } catch (err) {
    console.error('Error fetching metrics:', err);
  }
}

// Fetch Exception Queue Cases
async function fetchCases() {
  try {
    const params = new URLSearchParams();
    if (currentFilter.status !== 'ALL') params.append('status', currentFilter.status);
    if (currentFilter.materiality !== 'ALL') params.append('materiality', currentFilter.materiality);

    const res = await fetch(`/api/v2/cases?${params.toString()}`);
    const json = await res.json();

    if (json.success) {
      allCases = json.data;
      document.getElementById('queueCount').textContent = allCases.length;
      renderQueueList();

      // If no case is selected, or current selection is not in list, select the first
      if (!selectedCaseId && allCases.length > 0) {
        selectCase(allCases[0].event_id);
      } else if (selectedCaseId) {
        const found = allCases.find((c) => c.event_id === selectedCaseId);
        if (found) renderCaseDetail(found);
      }
    }
  } catch (err) {
    console.error('Error fetching cases:', err);
  }
}

// Set Filter
function setFilter(type, value, element) {
  const container = element.parentElement;
  container.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
  element.classList.add('active');

  currentFilter[type] = value;
  fetchCases();
}

// Render Queue List
function renderQueueList() {
  const container = document.getElementById('queueList');
  if (allCases.length === 0) {
    container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No exception cases matching current filter.<br>
        <span style="font-size: 11px; color: var(--teal-accent); cursor: pointer;" onclick="switchTab('simulator')">
          Go to Simulator to inject sample anomalies →
        </span>
      </div>
    `;
    return;
  }

  container.innerHTML = allCases
    .map((c) => {
      const isSelected = c.event_id === selectedCaseId;
      const statusClass =
        c.workflow_status === 'ESCALATED'
          ? 'escalated'
          : c.workflow_status === 'AUTO_REMEDIATED'
          ? 'auto'
          : c.workflow_status === 'HUMAN_APPROVED'
          ? 'approved'
          : 'rejected';

      const statusLabel =
        c.workflow_status === 'ESCALATED'
          ? '⚠️ PENDING HITL'
          : c.workflow_status === 'AUTO_REMEDIATED'
          ? '⚡ AUTO-RESOLVED'
          : c.workflow_status === 'HUMAN_APPROVED'
          ? '✅ APPROVED'
          : '❌ REJECTED';

      const fuelIcon =
        c.utility_type === 'ELECTRICITY'
          ? '⚡'
          : c.utility_type === 'NATURAL_GAS'
          ? '🔥'
          : c.utility_type === 'STEAM'
          ? '💨'
          : '💧';

      const materialityBadge = c.is_high_stakes
        ? `<span class="materiality-tag high">High Stake (${Math.abs(c.delta_carbon_emissions_tco2e)} t)</span>`
        : `<span class="materiality-tag low">Low Stake (${Math.abs(c.delta_carbon_emissions_tco2e)} t)</span>`;

      return `
        <div class="queue-item ${isSelected ? 'selected' : ''}" id="case-card-${c.event_id}" onclick="selectCase('${c.event_id}')">
          <div class="queue-item-header">
            <span class="case-id-tag">#${c.event_id.replace('case_', '').toUpperCase()}</span>
            <span class="status-pill ${statusClass}">${statusLabel}</span>
          </div>
          <div class="queue-asset-name">${c.asset_name}</div>
          <div class="queue-meta-row">
            <span class="fuel-tag">${fuelIcon} ${c.observed_value.toLocaleString()} ${c.unit_of_measure}</span>
            ${materialityBadge}
          </div>
        </div>
      `;
    })
    .join('');
}

// Select Case
function selectCase(eventId) {
  selectedCaseId = eventId;
  renderQueueList();

  const caseData = allCases.find((c) => c.event_id === eventId);
  if (caseData) {
    renderCaseDetail(caseData);
  }
}

// Render Case Detail Studio
function renderCaseDetail(c) {
  const panel = document.getElementById('detailPanel');
  if (!panel) return;

  const statusClass =
    c.workflow_status === 'ESCALATED'
      ? 'escalated'
      : c.workflow_status === 'AUTO_REMEDIATED'
      ? 'auto'
      : c.workflow_status === 'HUMAN_APPROVED'
      ? 'approved'
      : 'rejected';

  const statusLabel =
    c.workflow_status === 'ESCALATED'
      ? 'PENDING HUMAN CONFIRMATION'
      : c.workflow_status === 'AUTO_REMEDIATED'
      ? 'AUTO-REMEDIATED (STP)'
      : c.workflow_status === 'HUMAN_APPROVED'
      ? 'HUMAN SIGNED-OFF & COMMITTED'
      : 'REJECTED';

  const priorRatio = c.historical_baseline_mean > 0 ? (c.observed_value / c.historical_baseline_mean).toFixed(1) : 'N/A';

  const fuelIcon =
    c.utility_type === 'ELECTRICITY'
      ? '⚡ Electricity (Grid)'
      : c.utility_type === 'NATURAL_GAS'
      ? '🔥 Natural Gas'
      : c.utility_type === 'STEAM'
      ? '💨 District Steam'
      : '💧 Municipal Water';

  const evidenceItemsHtml = c.evidence_chain
    .map(
      (ev) => `
      <div class="evidence-step">
        <span class="evidence-check">✓</span>
        <div class="evidence-body">
          <strong>${ev.rule}</strong>
          <span>${ev.detail}</span>
        </div>
      </div>
    `
    )
    .join('');

  const cotLogsHtml = c.chain_of_thought_logs
    .map((log) => `<div>&gt; ${log}</div>`)
    .join('');

  const isPendingHitl = c.workflow_status === 'ESCALATED';

  panel.innerHTML = `
    <!-- Header -->
    <div class="detail-header-card">
      <div class="detail-title-line">
        <div>
          <h2><span class="case-num">CASE #${c.event_id.replace('case_', '').toUpperCase()}</span> ${c.asset_name}</h2>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            Asset ID: <span style="font-family: var(--font-mono); color: #fff;">${c.asset_id}</span> | Meter: <span style="font-family: var(--font-mono); color: #fff;">${c.meter_id}</span> | Zone: ${c.climate_zone} (${c.floor_area_sqft.toLocaleString()} sq ft)
          </div>
        </div>
        <div class="detail-badges-row">
          <span class="status-pill ${statusClass}" style="font-size: 11px; padding: 4px 10px;">${statusLabel}</span>
          ${
            c.is_high_stakes
              ? `<span class="status-pill escalated" style="font-size: 11px; padding: 4px 10px;">⚠️ HIGH STAKES: ${Math.abs(c.delta_carbon_emissions_tco2e)} tCO2e</span>`
              : `<span class="status-pill auto" style="font-size: 11px; padding: 4px 10px;">LOW STAKE: ${Math.abs(c.delta_carbon_emissions_tco2e)} tCO2e</span>`
          }
          ${
            c.regulatory_class === 'EU_TAXONOMY_ALIGNED'
              ? '<span class="status-pill" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #a855f7;">EU TAXONOMY ALIGNED</span>'
              : ''
          }
        </div>
      </div>
    </div>

    <!-- Scrollable Body -->
    <div class="detail-content-scroll">
      
      <!-- Diagnostic Summary Card -->
      <div class="studio-card">
        <div class="studio-card-title">
          <span>Diagnostic Summary & Cognitive Assessment</span>
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--teal-accent);">
            Confidence: ${(c.composite_confidence_score * 100).toFixed(1)}% [C_total]
          </span>
        </div>

        <div class="diag-grid">
          <div class="diag-item">
            <span class="diag-label">Flagged Interval Consumption</span>
            <span class="diag-val-highlight alert">
              ${c.observed_value.toLocaleString()} ${c.unit_of_measure}
              <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">
                (Prior: ${c.prior_month_value.toLocaleString()} ${c.unit_of_measure} | ${priorRatio}x Spike)
              </span>
            </span>
          </div>

          <div class="diag-item">
            <span class="diag-label">Agent Classified Root Cause</span>
            <span class="diag-val-highlight" style="color: var(--teal-accent);">
              ${c.classified_root_cause || 'DETECTING'}
            </span>
          </div>

          <div class="diag-item">
            <span class="diag-label">Fuel & Accounting Scope</span>
            <span class="diag-val-highlight">${fuelIcon}</span>
          </div>

          <div class="diag-item">
            <span class="diag-label">Routing Reason</span>
            <span class="diag-val-highlight" style="font-size: 12px; font-weight: 500; color: ${c.is_high_stakes ? 'var(--amber-warning)' : 'var(--emerald-primary)'};">
              ${c.routing_reason || 'Autonomous Straight-Through Processing Approved'}
            </span>
          </div>
        </div>

        <!-- Confidence Score Breakdown (Section 4.1) -->
        <div class="confidence-breakdown">
          <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">
            Composite Formula: <code style="font-family: var(--font-mono); color: #a5f3fc;">C_total = 0.35·S_stat + 0.40·S_cause + 0.25·S_context</code>
          </div>
          
          <div class="score-row">
            <span>Statistical Score (S_stat - Residual Z-score vs Weather & Peers):</span>
            <div class="score-bar-bg">
              <div class="score-bar-fill" style="width: ${c.confidence_components.s_stat * 100}%"></div>
            </div>
            <strong style="font-family: var(--font-mono);">${c.confidence_components.s_stat.toFixed(2)}</strong>
          </div>

          <div class="score-row">
            <span>Root-Cause Match (S_cause - Scalar Multiplier / Flatline Pattern):</span>
            <div class="score-bar-bg">
              <div class="score-bar-fill" style="width: ${c.confidence_components.s_cause * 100}%"></div>
            </div>
            <strong style="font-family: var(--font-mono);">${c.confidence_components.s_cause.toFixed(2)}</strong>
          </div>

          <div class="score-row">
            <span>Context Completeness (S_context - 24-mo History & Peer Set N≥5):</span>
            <div class="score-bar-bg">
              <div class="score-bar-fill" style="width: ${c.confidence_components.s_context * 100}%"></div>
            </div>
            <strong style="font-family: var(--font-mono);">${c.confidence_components.s_context.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      <!-- Context Visualization: Timeseries Chart -->
      <div class="studio-card">
        <div class="studio-card-title">
          <span>Context Visualization (Observed vs Synthetic Peer Mean vs Weather Baseline)</span>
          <span style="font-size: 11px; color: var(--text-muted);">6-Month Interval Trendline</span>
        </div>
        <div class="chart-container">
          <canvas id="timeseriesChart"></canvas>
        </div>
        <div class="chart-legend">
          <div class="legend-item">
            <div class="legend-color" style="background: #f43f5e;"></div>
            <span>Observed Interval (${c.observed_value.toLocaleString()} ${c.unit_of_measure})</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #06b6d4;"></div>
            <span>Synthetic Peer Mean (${Math.round(c.peer_cluster_mean).toLocaleString()} ${c.unit_of_measure})</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #10b981;"></div>
            <span>Weather-Normalized Baseline (${Math.round(c.historical_baseline_mean).toLocaleString()} ${c.unit_of_measure})</span>
          </div>
        </div>
      </div>

      <!-- Evidence Chain & Agent Inner Monologue -->
      <div class="studio-card">
        <div class="studio-card-title">
          <span>Evidence Chain & Cognitive Reasoning Chain-of-Thought</span>
          <span style="font-size: 11px; color: var(--emerald-primary);">3 Independent Verifications</span>
        </div>
        <div class="evidence-list" style="margin-bottom: 14px;">
          ${evidenceItemsHtml}
        </div>
        <details>
          <summary style="font-size: 12px; color: var(--teal-accent); cursor: pointer; margin-bottom: 8px;">
            ▸ View Agent Cognitive Monologue (Chain-of-Thought Hypotheses)
          </summary>
          <div class="cot-box">
            ${cotLogsHtml}
          </div>
        </details>
      </div>

      <!-- Proposed Remediation Card -->
      <div class="remediation-hero-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.04em;">
            Proposed Remediation & GHG Dual-Reporting
          </div>
          <span style="font-size: 11px; color: var(--emerald-primary); background: rgba(16,185,129,0.15); padding: 2px 8px; border-radius: var(--radius-full); font-weight: 600;">
            GHG Protocol Scope 2 Dual-Reporting (Location + Market)
          </span>
        </div>

        <div class="remediation-numbers-grid">
          <div class="rem-num-item">
            <div class="rem-label">Action Proposed</div>
            <div class="rem-val" style="font-size: 13px; color: var(--teal-accent);">
              ${c.proposed_remediation_action || 'SCALAR CORRECTION'}
            </div>
          </div>
          <div class="rem-num-item">
            <div class="rem-label">Revised Read</div>
            <div class="rem-val">
              ${c.proposed_remediated_value?.toLocaleString()} <span style="font-size: 12px; color: var(--text-muted);">${c.unit_of_measure}</span>
            </div>
          </div>
          <div class="rem-num-item">
            <div class="rem-label">Location-Based Delta</div>
            <div class="rem-val savings">
              ${(c.delta_carbon_emissions_tco2e_location ?? c.delta_carbon_emissions_tco2e) > 0 ? '+' : ''}${c.delta_carbon_emissions_tco2e_location ?? c.delta_carbon_emissions_tco2e} t
            </div>
          </div>
          <div class="rem-num-item">
            <div class="rem-label">Market-Based Delta</div>
            <div class="rem-val savings" style="color: var(--teal-accent);">
              ${(c.delta_carbon_emissions_tco2e_market ?? c.delta_carbon_emissions_tco2e) > 0 ? '+' : ''}${c.delta_carbon_emissions_tco2e_market ?? c.delta_carbon_emissions_tco2e} t
            </div>
          </div>
          <div class="rem-num-item">
            <div class="rem-label">Audit Block Hash</div>
            <div class="rem-val" style="font-size: 11px; font-family: var(--font-mono); color: var(--teal-accent); word-break: break-all;">
              ${c.audit_hash ? c.audit_hash.slice(0, 16) + '...' : 'Pending Commit'}
            </div>
          </div>
        </div>

        <!-- 1-Click Action Buttons -->
        <div class="action-buttons-bar">
          ${
            isPendingHitl
              ? `
            <button class="btn btn-primary-action" onclick="executeOneClickApproval('${c.event_id}')">
              <span>⚡</span> Confirm & Execute Write-Back (1-Click)
            </button>
            <button class="btn btn-secondary" onclick="openEditRemediationModal('${c.event_id}')">
              <span>✏️</span> Edit Remediation
            </button>
            <button class="btn btn-danger" onclick="rejectCase('${c.event_id}')">
              <span>✕</span> Reject Proposal
            </button>
          `
              : c.workflow_status === 'REVERTED'
              ? `
            <button class="btn btn-secondary" disabled style="opacity: 0.8; cursor: default; border-color: var(--rose-danger); color: var(--rose-danger);">
              <span>↺</span> Reverted to Original Unadjusted Read
            </button>
          `
              : `
            <button class="btn btn-secondary" disabled style="opacity: 0.8; cursor: default;">
              <span>✓</span> Write-Back Successfully Executed & Hashed
            </button>
            <button class="btn btn-danger" onclick="revertCase('${c.event_id}')">
              <span>↺</span> Rollback to Raw Read
            </button>
          `
          }
          
          <button class="btn btn-secondary" onclick="openDisputePackage('${c.event_id}')">
            <span>📄</span> Utility Dispute Package
          </button>
          <button class="btn btn-secondary" onclick="openInspectionTicket('${c.event_id}')">
            <span>📋</span> Field Work Order
          </button>
          ${
            c.audit_hash
              ? `<button class="btn btn-secondary" onclick="viewAuditJson('${c.event_id}')"><span>🔍</span> Inspect Audit JSON</button>`
              : ''
          }
        </div>
      </div>

    </div>
  `;

  // Render Canvas Chart
  setTimeout(() => {
    drawTimeseriesChart(c);
  }, 50);
}

// Draw Canvas Timeseries Chart (Observed vs Synthetic Peer Mean vs Weather Baseline)
function drawTimeseriesChart(caseData) {
  const canvas = document.getElementById('timeseriesChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  const pts = caseData.timeseries_context || [];
  if (pts.length === 0) return;

  const padding = { top: 30, right: 40, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Find max value across series
  const allVals = [];
  pts.forEach((p) => {
    allVals.push(p.observed, p.peer_mean, p.weather_baseline);
  });
  const maxVal = Math.max(...allVals) * 1.15;
  const minVal = 0;

  const getX = (idx) => padding.left + (idx / (pts.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yVal = minVal + (i / 4) * maxVal;
    const y = getY(yVal);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    const label = yVal >= 1000 ? `${(yVal / 1000).toFixed(0)}k` : `${Math.round(yVal)}`;
    ctx.fillText(label, padding.left - 10, y + 3);
  }

  // Draw X axis labels
  ctx.textAlign = 'center';
  pts.forEach((p, idx) => {
    const x = getX(idx);
    ctx.fillStyle = idx === pts.length - 1 ? '#f43f5e' : '#94a3b8';
    ctx.font = idx === pts.length - 1 ? 'bold 11px Inter' : '10px Inter';
    ctx.fillText(p.date, x, height - 14);
  });

  // Series 1: Weather Baseline (Emerald Line)
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = getX(idx);
    const y = getY(p.weather_baseline);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Series 2: Synthetic Peer Mean (Cyan Line with fill)
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = getX(idx);
    const y = getY(p.peer_mean);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Series 3: Observed Value Line (Rose / Amber line with spike dot)
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = getX(idx);
    const y = getY(p.observed);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw point dots
  pts.forEach((p, idx) => {
    const x = getX(idx);
    const isSpike = idx === pts.length - 1;

    // Weather dot
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(x, getY(p.weather_baseline), 3, 0, Math.PI * 2);
    ctx.fill();

    // Peer dot
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(x, getY(p.peer_mean), 3, 0, Math.PI * 2);
    ctx.fill();

    // Observed dot
    ctx.fillStyle = isSpike ? '#f43f5e' : '#fb7185';
    ctx.beginPath();
    ctx.arc(x, getY(p.observed), isSpike ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (isSpike) {
      // Glow circle around spike point
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, getY(p.observed), 10, 0, Math.PI * 2);
      ctx.stroke();

      // Spike Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter';
      ctx.textAlign = 'center';
      const spikeLabel = p.observed >= 1000 ? `${(p.observed / 1000).toFixed(1)}k (Flagged)` : `${p.observed}`;
      ctx.fillText(spikeLabel, x, getY(p.observed) - 14);
    }
  });
}

// 1-Click HITL Confirmation
async function executeOneClickApproval(eventId) {
  try {
    showToast('Executing authenticated write-back PATCH to Aggregator API...');
    const res = await fetch(`/api/v2/cases/${eventId}/hitl-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVE',
        approverEmail: 'user_esg_lead_04@company.com',
      }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('✅ 1-Click Approval Committed! Audit Ledger block hashed.');
      await fetchMetrics();
      await fetchCases();
      await fetchAuditLedger();
    } else {
      showToast(`Error: ${json.error}`, true);
    }
  } catch (err) {
    showToast(`Approval failed: ${err.message}`, true);
  }
}

// Reject Case
async function rejectCase(eventId) {
  const reason = prompt('Please specify rejection reason for model learning:', 'Manual inspection required on-site');
  if (!reason) return;

  try {
    const res = await fetch(`/api/v2/cases/${eventId}/hitl-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REJECT',
        approverEmail: 'user_esg_lead_04@company.com',
        reviewerNotes: reason,
      }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('Case proposal rejected.');
      fetchMetrics();
      fetchCases();
    }
  } catch (err) {
    showToast(`Rejection failed: ${err.message}`, true);
  }
}

// Revert / Rollback Case to Original Raw Read
async function revertCase(eventId) {
  const reason = prompt(
    'Please specify rollback reason for audit ledger:',
    'Site technician requested rollback to original raw reading'
  );
  if (!reason) return;

  try {
    const res = await fetch(`/api/v2/cases/${eventId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: 'user_esg_lead_04@company.com',
        reason,
      }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('↺ Case successfully rolled back to original unadjusted read and logged to ledger.');
      await fetchMetrics();
      await fetchCases();
      await fetchAuditLedger();
    } else {
      showToast(`Rollback failed: ${json.error}`, true);
    }
  } catch (err) {
    showToast(`Rollback failed: ${err.message}`, true);
  }
}

// Edit Remediation Modal
function openEditRemediationModal(eventId) {
  const caseData = allCases.find((c) => c.event_id === eventId);
  if (!caseData) return;

  document.getElementById('editModalCaseId').value = caseData.event_id;
  document.getElementById('editModalObservedVal').value = `${caseData.observed_value} ${caseData.unit_of_measure}`;
  document.getElementById('editModalNewVal').value = caseData.proposed_remediated_value || caseData.historical_baseline_mean;
  document.getElementById('editModalNotes').value = '';
  recalculateEditModalPreview();

  openModal('editModal');
}

function recalculateEditModalPreview() {
  const caseId = document.getElementById('editModalCaseId').value;
  const caseData = allCases.find((c) => c.event_id === caseId);
  if (!caseData) return;

  const newVal = parseFloat(document.getElementById('editModalNewVal').value) || 0;
  const factor = caseData.utility_type === 'ELECTRICITY' ? 0.207 : 2.02;
  const deltaTco2e = ((newVal - caseData.observed_value) * factor) / 1000;

  document.getElementById('editModalImpactPreview').textContent =
    `Revised Reading: ${newVal.toLocaleString()} ${caseData.unit_of_measure} | Adjusted Carbon Delta: ${deltaTco2e.toFixed(2)} tCO2e`;
}

async function submitEditRemediation() {
  const caseId = document.getElementById('editModalCaseId').value;
  const newVal = parseFloat(document.getElementById('editModalNewVal').value);
  const notes = document.getElementById('editModalNotes').value;

  if (isNaN(newVal)) {
    alert('Please enter a valid numeric value');
    return;
  }

  try {
    const res = await fetch(`/api/v2/cases/${caseId}/hitl-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'EDIT',
        overrideValue: newVal,
        approverEmail: 'user_esg_lead_04@company.com',
        reviewerNotes: notes || `Adjusted reading to ${newVal}`,
      }),
    });
    const json = await res.json();
    if (json.success) {
      closeModal('editModal');
      showToast('✅ Edited remediation approved & written back to Central Aggregator');
      fetchMetrics();
      fetchCases();
      fetchAuditLedger();
    }
  } catch (err) {
    showToast(`Edit failed: ${err.message}`, true);
  }
}

// Utility Dispute Package
async function openDisputePackage(eventId) {
  try {
    const res = await fetch(`/api/v2/cases/${eventId}/dispute-package`);
    const json = await res.json();
    if (json.success) {
      const d = json.data;
      document.getElementById('disputeSummaryBox').innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #fff; font-size: 14px;">Ticket #${d.ticket_id}</strong>
          <span style="color: var(--emerald-primary); font-weight: 700;">Est. Rebate: $${d.calculated_rebate_estimate_currency.toLocaleString()}</span>
        </div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 6px;">
          Utility Provider: ${d.utility_provider} | Discrepancy Factor: ${d.discrepancy_factor}x | Account: ${d.account_number}
        </div>
      `;
      document.getElementById('disputeLetterContent').textContent = d.formal_letter_body;
      openModal('disputeModal');
    }
  } catch (err) {
    showToast(`Failed to load dispute package: ${err.message}`, true);
  }
}

function copyDisputeLetter() {
  const content = document.getElementById('disputeLetterContent').textContent;
  navigator.clipboard.writeText(content);
  showToast('📋 Dispute letter copied to clipboard!');
}

// Site Inspection Work Order
async function openInspectionTicket(eventId) {
  try {
    const res = await fetch(`/api/v2/cases/${eventId}/inspection-ticket`);
    const json = await res.json();
    if (json.success) {
      const t = json.data;
      document.getElementById('inspectionModalBody').innerHTML = `
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #fff; font-size: 14px;">Work Order #${t.work_order_id}</strong>
            <span class="status-pill escalated">${t.priority} PRIORITY</span>
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            Target: ${t.asset_name} | Location: ${t.location}
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.25); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px; font-size: 12px; color: #cbd5e1;">
          ${t.instructions}
        </div>

        <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">
          Technician Checklist:
        </div>
        <div class="evidence-list">
          ${t.checklist
            .map(
              (item) => `
            <div class="evidence-step">
              <span style="color: var(--teal-accent);">☐</span>
              <div class="evidence-body"><span>${item}</span></div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
      openModal('inspectionModal');
    }
  } catch (err) {
    showToast(`Failed to load inspection ticket: ${err.message}`, true);
  }
}

// Ingestion Simulator
async function triggerSimulation(scenarioName) {
  try {
    showToast(`Injecting scenario "${scenarioName}" to Multi-Agent Orchestrator...`);
    const res = await fetch('/api/v2/anomalies/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: scenarioName }),
    });
    const json = await res.json();
    if (json.success) {
      const outcome = json.data.workflow_status === 'AUTO_REMEDIATED' ? '⚡ Auto-Remediated (STP)' : '⚠️ Escalated to HITL Console';
      showToast(`Simulation complete: ${outcome}`);
      await fetchMetrics();
      await fetchCases();
      switchTab('review');
      selectCase(json.data.event_id);
    }
  } catch (err) {
    showToast(`Simulation failed: ${err.message}`, true);
  }
}

async function submitCustomSimulation() {
  const assetId = document.getElementById('customAssetId').value;
  const meterId = document.getElementById('customMeterId').value;
  const observedVal = parseFloat(document.getElementById('customObservedVal').value);

  if (!assetId || !meterId || isNaN(observedVal)) {
    alert('Please provide asset, meter, and observed reading');
    return;
  }

  try {
    showToast('Ingesting custom anomaly payload...');
    const res = await fetch('/api/v2/anomalies/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customPayload: {
          asset_id: assetId,
          meter_id: meterId,
          observed_value: observedVal,
        },
      }),
    });
    const json = await res.json();
    if (json.success) {
      showToast('Custom anomaly processed by Multi-Agent StateGraph!');
      await fetchMetrics();
      await fetchCases();
      switchTab('review');
      selectCase(json.data.event_id);
    }
  } catch (err) {
    showToast(`Custom simulation failed: ${err.message}`, true);
  }
}

// Audit Ledger View & Verification
async function fetchAuditLedger() {
  try {
    const res = await fetch('/api/v2/audit/ledger');
    const json = await res.json();
    if (json.success) {
      currentAuditRecords = json.data;
      const integrityBadge = document.getElementById('ledgerIntegrityBadge');
      if (json.integrity.is_valid) {
        integrityBadge.innerHTML = `<span>🔒</span> SHA-256 HASH CHAIN: VERIFIED TAMPER-PROOF (${json.count} Blocks)`;
        integrityBadge.style.color = 'var(--emerald-primary)';
      } else {
        integrityBadge.innerHTML = `<span>⚠️</span> LEDGER INTEGRITY WARNING`;
        integrityBadge.style.color = 'var(--rose-danger)';
      }
      renderAuditTable();
    }
  } catch (err) {
    console.error('Error fetching audit ledger:', err);
  }
}

function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  if (currentAuditRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">
          No audit blocks committed yet. Approve a case or trigger an STP simulation to commit records.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = currentAuditRecords
    .map((r) => {
      const execPill =
        r.remediation_decision.execution_path === 'AUTONOMOUS_STP'
          ? '<span class="status-pill auto">AUTONOMOUS STP</span>'
          : '<span class="status-pill approved">HUMAN SIGN-OFF</span>';

      return `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 11px;">${r.timestamp_utc.replace('T', ' ').slice(0, 19)}</td>
          <td><strong>${r.asset_name}</strong><br><span style="font-family: var(--font-mono); color: var(--text-muted);">${r.asset_id}</span></td>
          <td style="font-family: var(--font-mono);">${r.meter_id}</td>
          <td>${r.anomaly_observation.observed_value.toLocaleString()} ${r.anomaly_observation.reported_uom}</td>
          <td style="color: var(--emerald-primary); font-weight: 600;">${r.remediation_decision.remediated_value.toLocaleString()} ${r.anomaly_observation.reported_uom}</td>
          <td style="color: var(--teal-accent); font-weight: 600;">${r.remediation_decision.delta_emissions_tco2e} t</td>
          <td>${execPill}</td>
          <td style="font-size: 11px;">${r.remediation_decision.approver}</td>
          <td class="hash-cell">${r.block_hash.slice(0, 12)}...</td>
          <td>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="viewBlockJson('${r.audit_event_id}')">
              JSON
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

// View Block JSON
function viewBlockJson(auditEventId) {
  const record = currentAuditRecords.find((r) => r.audit_event_id === auditEventId);
  if (!record) return;

  document.getElementById('jsonModalTitle').textContent = `Audit Block: ${record.audit_event_id}`;
  document.getElementById('jsonModalContent').textContent = JSON.stringify(record, null, 2);
  openModal('jsonModal');
}

// View Case Audit JSON directly from case
function viewAuditJson(eventId) {
  const caseData = allCases.find((c) => c.event_id === eventId);
  if (!caseData) return;

  const record = currentAuditRecords.find((r) => r.meter_id === caseData.meter_id);
  if (record) {
    viewBlockJson(record.audit_event_id);
  } else {
    // If not yet fetched into list, display case state
    document.getElementById('jsonModalTitle').textContent = `Case State Audit Record: ${caseData.event_id}`;
    document.getElementById('jsonModalContent').textContent = JSON.stringify(caseData, null, 2);
    openModal('jsonModal');
  }
}

// Export Verification Pack
async function exportAuditorPackage() {
  try {
    const res = await fetch('/api/v2/audit/export');
    const json = await res.json();
    if (json.success) {
      document.getElementById('jsonModalTitle').textContent = `Auditor Verification Pack: ${json.data.verification_package_id}`;
      document.getElementById('jsonModalContent').textContent = JSON.stringify(json.data, null, 2);
      openModal('jsonModal');
      showToast('📄 Auditor Verification Pack generated with digital manifest checksum.');
    }
  } catch (err) {
    showToast(`Export failed: ${err.message}`, true);
  }
}

// Modal Helpers
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Toast Notifications
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (isError) {
    toast.style.borderColor = 'var(--rose-danger)';
  }
  toast.innerHTML = `
    <span>${isError ? '⚠️' : '⚡'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}
