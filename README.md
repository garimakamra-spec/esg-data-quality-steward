# 🌿 ESG Data Quality Steward AI Agent
**Autonomous Multi-Agent Utility Anomaly Triage, Continuous Audit Defensibility & HITL Review System**

[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Passing-emerald)](tests/esg-steward-agent.test.ts)
[![Compliance](https://img.shields.io/badge/Compliance-CSRD%20(ESRS%20E1)%20%7C%20GHG%20Protocol%20Scope%201%262%20%7C%20EU%20Taxonomy-blue)](#-regulatory-compliance--auditability)
[![STP Rate](https://img.shields.io/badge/STP%20Rate-%E2%89%A5%2070%25%20Target-success)](#-executive-summary)
[![License](https://img.shields.io/badge/License-MIT-purple)](#license)

---

## 📋 Executive Summary

The **ESG Data Quality Steward AI Agent** is an enterprise-grade, autonomous multi-agent system designed to eliminate manual utility anomaly triage, enforce continuous audit defensibility, and accelerate carbon and energy accounting cycles.

By shifting from reactive, error-prone spreadsheets to an agentic architecture, this system:
- **Achieves a $\ge 70\%$ Straight-Through Processing (STP) rate** for routine utility discrepancies.
- **Collapses turnaround times from 8–12 business days to under 15 minutes**.
- **Enforces non-negotiable regulatory guardrails** ($|\Delta \text{tCO}_2\text{e}| \ge 50\text{ tCO}_2\text{e}$, EU Taxonomy Article 9, SFDR Article 8/9).
- **Generates an immutable, cryptographically chained (SHA-256) audit ledger** satisfying limited and reasonable assurance requirements under **CSRD (ESRS E1)**, **GHG Protocol Scope 1 & 2**, and **EU Taxonomy**.

---

## 🏛️ System Architecture

```
                                    +-----------------------------------------+
                                    |    Central Data Aggregator API Layer    |
                                    |  - 24-Month Meter Interval History      |
                                    |  - Localized Weather Degree Days (HDD/CDD)
                                    |  - Peer Building Clusters (Per Sq Ft)   |
                                    |  - Idempotency Cache & Rollback API     |
                                    +--------------------+--------------------+
                                                         |
                                               Flagged Anomaly Webhook
                                                         v
                                    +-----------------------------------------+
                                    |         STATEGRAPH ORCHESTRATOR         |
                                    |       (Typed AnomalyState Context)      |
                                    +--------------------+--------------------+
                                                         |
                   +-------------------------------------+-------------------------------------+
                   |                                     |                                     |
                   v                                     v                                     v
      +-------------------------+           +-------------------------+           +-------------------------+
      |  Context Retriever &    |           |  Root-Cause Diagnostic  |           |   Remediation & Action  |
      |  Peer Baseline Agent    |           |  Agent (Neuro-Symbolic) |           |   Agent                 |
      +-------------------------+           +-------------------------+           +-------------------------+
      | - 24-mo Historical Mean |           | - Multiplier Tool (10x) |           | - Scalar Correction     |
      | - Degree Days (CDD/HDD) |           | - Weather Regression    |           | - Synthetic GHG Fill    |
      | - Peer Cluster N=18     |           | - Scope 2 Dual-Report   |           | - Dispute Letter Gen    |
      |                         |           | - Composite Score C_tot |           | - Reversion Dispatcher  |
      +-------------------------+           +-------------------------+           +-------------------------+
                   |                                     |                                     |
                   +-------------------------------------+-------------------------------------+
                                                         |
                                                         v
                                    +-----------------------------------------+
                                    | Compliance & Policy Gate (Guardrails)   |
                                    | Rules:                                  |
                                    |  1. Materiality: Loc/Mkt Delta >= 50 t  |
                                    |  2. EU Taxonomy / SFDR Article 8/9      |
                                    |  3. Hardware Meter Rollover/Swap        |
                                    |  4. Confidence Score < 0.85             |
                                    +--------------------+--------------------+
                                                         |
                               +-------------------------+-------------------------+
                               |                                                   |
              [Score >= 0.85 & Low Stakes]                         [Score < 0.85 or High Stakes]
                               v                                                   v
            +------------------------------------+              +------------------------------------+
            |      AUTONOMOUS STP WRITE-BACK     |              |    CUSTOM EXCEPTION REVIEW CONSOLE |
            |  - Idempotent REST PATCH           |              |  - 1-Click HITL Sign-off           |
            |  - Preserves Raw Unadjusted Read   |              |  - 1-Click Reversion / Rollback    |
            |  - Instant SHA-256 Ledger Entry    |              |  - Canvas Chart & Evidence Chain   |
            +-----------------+------------------+              +------------------+-----------------+
                              |                                                    |
                              |                                    [Human 1-Click Approved]
                              +-------------------------+--------------------------+
                                                        |
                                                        v
                                    +-----------------------------------------+
                                    |       IMMUTABLE AUDIT LEDGER LAYER      |
                                    |  - Genesis: "0".repeat(64)              |
                                    |  - SHA-256(prev + id + time + val + sig)|
                                    |  - CSRD (ESRS E1) & GHG Scope 1/2 Pack  |
                                    |  - 100% Defensible to PwC / KPMG / ERM  |
                                    +-----------------------------------------+
```

---

## ⚡ Core Capabilities

### 1. Hybrid Neuro-Symbolic Boundary
- **Deterministic Mathematical Tools (`src/agent/tools/`)**: Run 100% of arithmetic operations, multivariate degree-day regressions, scalar ratio matching, and emission factor conversions with zero floating-point hallucination.
- **Agentic Reasoner (`src/agent/orchestrator.ts`)**: Synthesizes human-readable Chain-of-Thought logs, formal utility dispute letters, and on-site facility technician instructions.

### 2. Composite Confidence Scoring
The system balances three independent dimensions:
$$C_{\text{total}} = 0.35 S_{\text{stat}} + 0.40 S_{\text{cause}} + 0.25 S_{\text{context}}$$
- **$S_{\text{stat}}$**: Statistical plausibility evaluating variance against weather-adjusted and peer distributions.
- **$S_{\text{cause}}$**: Root-cause certainty matching known structural error patterns (e.g. $10\times, 100\times, 1000\times$, therms-to-kWh $29.3\times$).
- **$S_{\text{context}}$**: Quality and completeness of baseline data ($>12$ months depth, weather stations, peer set $N \ge 5$).

### 3. Scope 2 Dual-Reporting Support (GHG Protocol Compliance)
- **Location-Based Method**: Evaluates grid intensity (e.g., $0.207\text{ kg CO}_2\text{e/kWh}$).
- **Market-Based Method**: Evaluates supplier-specific contract factors or zero-carbon PPA/EAC allocations.
- **Dual Materiality Guardrail**: Triggers mandatory human sign-off if **either** method exceeds the $50\text{ tCO}_2\text{e}$ materiality limit.

### 4. Idempotency & Reversion Safety
- **Idempotency Keys**: Derived from `SHA256(event_id + observed_val + interval)` to prevent duplicate write-backs over network retries.
- **Raw Value Preservation**: The original unadjusted utility read is permanently preserved.
- **1-Click Rollback**: Property teams can click **[↺ Rollback to Raw Read]** (or call `/api/v2/cases/:id/revert`) to restore the original value and record a `ROLLBACK_REVERSION` block in the ledger.

### 5. Cryptographic Decision Ledger
- **Genesis Block**: Fixed 64-character zero string (`"0".repeat(64)`).
- **Chaining Contract**:
  $$\text{Block Hash} = \text{SHA-256}(\text{prev\_hash} + \text{event\_id} + \text{timestamp} + \text{remediated\_val} + \text{signer\_id})$$
- **Verification**: Built-in `verifyLedgerIntegrity()` re-verifies every block hash from genesis to tip to ensure zero tampering.

---

## 🚀 Quick Start

### Prerequisites
- Node.js $\ge 18$
- npm $\ge 9$

### Installation
```bash
git clone <your-repo-url>
cd esg-data-quality-steward-agent
npm install
```

### Running Automated Tests
```bash
npm test
```
*Executes all 18 automated tests including unit tools, dual-reporting, idempotency rollback, and a 100-case bulk empirical portfolio simulation.*

### Starting the Live Console Server
```bash
npm start
```
The server will start at:
- **Exception Review Console**: [http://localhost:3000/console](http://localhost:3000/console)
- **API v2 Cases**: [http://localhost:3000/api/v2/cases](http://localhost:3000/api/v2/cases)
- **Immutable Audit Ledger**: [http://localhost:3000/api/v2/audit/ledger](http://localhost:3000/api/v2/audit/ledger)

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v2/metrics` | Returns executive KPIs (STP rate, turnaround time, carbon delta, defensibility score) |
| `GET` | `/api/v2/cases` | Lists all exception cases with status, fuel, and materiality filters |
| `GET` | `/api/v2/cases/:id` | Returns complete case file including timeseries points, evidence chain, and CoT monologue |
| `POST` | `/api/v2/cases/:id/hitl-action` | Executes 1-click HITL actions: `APPROVE`, `EDIT`, `REJECT`, `REVERT` |
| `POST` | `/api/v2/cases/:id/revert` | 1-click rollback restoring the original unadjusted utility read |
| `GET` | `/api/v2/cases/:id/dispute-package` | Generates official utility dispute notice with calculated overcharge rebate |
| `GET` | `/api/v2/cases/:id/inspection-ticket` | Generates facility technician dispatch ticket with field checklist |
| `POST` | `/api/v2/anomalies/simulate` | Ingests canonical test scenarios or custom anomaly payloads |
| `GET` | `/api/v2/audit/ledger` | Returns all committed SHA-256 blocks with chain verification status |
| `GET` | `/api/v2/audit/export/:id?` | Exports audit-ready verification pack for CSRD ESRS E1 & GHG Protocol assurance |

---

## 🧪 Automated Test Coverage (18/18 Passing)

```
✔ Multiplier Anomaly Calculator (Neuro-Symbolic Tool) (4 tests)
  ✔ detects 10x pulse multiplier slip with >99% precision
  ✔ detects 1000x MWh vs kWh billing error
  ✔ detects therms-to-kWh conversion misalignment (29.3x)
  ✔ returns false for non-scalar fluctuations
✔ Weather Imputation Engine (2 tests)
  ✔ identifies freeze anomaly when gas is 0 during high HDD
  ✔ determines when weather variance explains delta
✔ Scope 2 Dual-Reporting (GHG Protocol Compliance) (3 tests)
  ✔ computes both Location-Based and Market-Based emissions deltas
  ✔ triggers high-stakes escalation if EITHER Location OR Market exceeds 50 tCO2e
  ✔ flags EU Taxonomy aligned flagship facility as mandatory high stakes
✔ User Story 1: Autonomous Multiplier Remediation (STP) (1 test)
  ✔ autonomously detects, calculates and writes back low-stakes 10x error
✔ User Story 2: High-Stakes Escalation & 1-Click HITL Sign-off (2 tests)
  ✔ halts autonomous execution and routes to HITL when carbon delta >= 50 tCO2e
  ✔ supports manual edit and carbon recalculation during HITL review
✔ Idempotency & Reversion Safety (Rollback) (2 tests)
  ✔ duplicate write-back calls with identical idempotency key return cached receipt
  ✔ reversion rollback restores original unadjusted value and logs to ledger
✔ Cryptographic Ledger Formula & Genesis Chaining (1 test)
  ✔ strictly enforces SHA-256(prev_hash + event_id + timestamp + remediated_val + signer_id)
✔ Bulk STP Empirical Validation (100-Case Portfolio Run) (1 test)
  ✔ achieves 70% ± 5% STP rate and 100% capture of high-stakes cases in HITL queue
✔ Dispute Package and Field Work Order Tools (2 tests)
  ✔ generates formal utility dispute letter with dollar overcharge estimate
  ✔ generates facility inspection work order with on-site checklist
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
