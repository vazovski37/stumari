---
name: feedback-docs-first
description: "User wants the whole project planned and documented in-repo before/while building, so future sessions have full context"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b20568f5-8065-4c51-9467-d75999be6137
  modified: 2026-09-24T21:12:25.720Z
---

Before building, plan the whole project and save every planning document in the repo (docs/), plus project knowledge in CLAUDE.md, so later sessions "have strong understanding" of what is being built.

**Why:** User said (2026-09-25): "prepare and organize repo, save knowledge properly... first plan whole project, save every document so you will have strong understanding of what you're building, then proceed and build."

**How to apply:** Specs are the contract — update docs/ when a design decision changes (ADRs in docs/decisions/), keep CLAUDE.md current, and read docs/ at the start of a new session before touching code. See [[project-stumari]].
