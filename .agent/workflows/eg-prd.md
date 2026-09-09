---
description: eg-prd
---

# Workflow: eg-prd

## Goal
Transform a chosen concept into a complete, grounded Product Requirements Document (PRD).

## Procedure
1. **Codebase Grounding (Pass 1):**
   - Inspect existing manifests, routing, controllers, models, and shared components.
   - Output a list of existing conventions, constraints, and identified gaps (G1..Gn).
2. **Structured Gap Resolution:**
   - Present the gaps to the user one at a time.
   - Provide 3–4 plausible solutions plus an option to `[Defer to Open Questions]`.
3. **Research Sweeps (Pass 2):**
   - Run three independent checks on the resolved requirements:
     - **Market/Prior Art:** How do industry standards handle this workflow?
     - **Technical Patterns:** What are the schema and state-management implications?
     - **UX/Edge Cases:** Error handling, empty states, and validation boundaries.
4. **Synthesize PRD:** Produce the final document containing:
   - Executive Summary & Target User
   - In-Scope vs. Out-of-Scope
   - Functional & Technical Requirements (with codebase citations)
   - Success Metrics & Telemetry
   - Explicit Open Questions (items deferred during gap resolution)