# Agent Execution Architecture: Elephant / Goldfish Protocol

This workspace enforces Dave Rensin's Elephant/Goldfish pattern for all feature planning, bug fixing, and reviews.

## Core Roles

### 1. The Elephant (Main Working Session)
- **Role:** Holds conversational memory, project history, requirements context, and repository knowledge.
- **Responsibilities:**
  - Guides ideation, drafts specifications, and synthesizes multi-lens feedback.
  - Generates implementation code once validation gates are cleared.
  - Never reviews its own code or assumes unverified design clarity.

### 2. The Goldfish (Isolated Evaluator / Sub-agent)
- **Role:** A context-free reviewer spawned with zero conversational history.
- **Rules of Engagement:**
  - Receives **only** the target artifact (a PRD section, a raw problem description, or a git diff).
  - Must never receive conversational justifications, prior brainstorming logs, or the Elephant's private hypotheses.
  - The asymmetry is the verification: if a Goldfish cannot implement or understand the task based purely on the document provided, the document is incomplete.

---

## Operating Invariants

1. **Strict No-Code Gate for Features:**
   - When running feature work, the Elephant must draft the design document first.
   - Do not write implementation code until cold-reader validation checks (Comprehension, Critic, Readiness) have explicitly signed off.

2. **Isolated Bug Diagnosis:**
   - For bug triage, provide only the failure symptom and reproduction steps to a clean diagnostic sub-agent.
   - Keep any internal hypotheses hidden until the diagnostic agent reports findings.

3. **Blind Pre-Commit Diff Review:**
   - Any diff must be evaluated by a fresh agent session seeing only `git diff` and project lint/test output.
   - All review findings must be addressed sequentially: either apply the fix or explicitly write a justified rebuttal.

## Registered Workflows

When asked to run any of the following product phases, execute the corresponding procedure in `.agent/workflows/`:
- **`eg-brainstorm <idea>`** -> `.agent/workflows/eg-brainstorm.md`
- **`eg-prd <concept>`** -> `.agent/workflows/eg-prd.md`
- **`eg-new-feature <PRD/spec>`** -> `.agent/workflows/eg-new-feature.md`