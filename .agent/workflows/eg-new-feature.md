---
description: eg-new-feature
---

# Workflow: eg-new-feature

## Goal
Design and implement a feature using a strict no-code gate and cold-reader verification.

## Procedure
1. **Scope Confirmation:** Summarize the target feature in 1–2 sentences and wait for user confirmation.
2. **Draft Design Document (Strict No-Code Gate):**
   - The Elephant drafts the design doc (architecture, schema updates, endpoint signatures, edge cases).
   - **DO NOT WRITE IMPLEMENTATION CODE YET.**
3. **Three-Pass Cold Evaluation (Goldfish):**
   Submit only the raw design document to three independent checks:
   - **Pass A (Comprehension):** Can a cold reader accurately paraphrase what this feature does?
   - **Pass B (Critic):** What architectural edge cases, race conditions, or omissions exist?
   - **Pass C (Readiness):** Can an engineer implement this in one pass without asking follow-up questions?
4. **Gate Resolution:**
   - If gaps are found: Revise the design doc and re-test against Critic and Readiness (up to 3 rounds).
   - Once both Critic and Readiness mark `[Sign-off]`, the no-code gate opens.
5. **Implementation & Review:**
   - Build implementation layer by layer (schema → logic → API → UI).
   - Hand off the final `git diff` to `eg-precommit-review` before signaling completion.