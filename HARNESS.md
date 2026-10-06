# Harness — interview-simulator

Installed with [harness-standard](https://github.com/jordimarsal/harness-standard) (`opencode`, `v0.6.0`).

- **Stack detected:** node
- **Architecture:** generic template
- **Workflow:** hybrid — one in-session agent; same human gates; evidence logs in harness/logs/ (see the workflow section of AGENTS.md)
- **Roles:** Leader · Spec Author · Implementer · Reviewer (`.opencode/agent/`)
- **Gates:** `harness/CHECKPOINTS.md` · `docs/verification.md`
- **Process:** `docs/specs.md` — Spec-Driven Development with a human approval gate

## Next

1. Edit `docs/architecture.md` and `docs/conventions.md` for this project.
2. Add features to `harness/feature_list.json`.
3. Start the leader: `opencode`
4. Update later: re-run install.sh with `--update` (keeps specs, progress and settings).

First prompt:

> Read AGENTS.md and start the leader workflow. Pick the first pending feature.
