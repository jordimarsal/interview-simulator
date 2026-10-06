# AGENTS.md — Navigation map for AI agents

> This file is the **entry point** for any agent working in this repository.
> It is NOT a rule bible — it is a **map**. Read only what you need, when you need it (progressive disclosure).

---

## 1. Before you start (mandatory)

1. Read **`CONTRACTS.md`** — the domain contracts of this project (what it is, module roles, invariants that have already broken once, and how to verify). Nothing in this repo may break them.
2. Run `harness/init.sh` and verify it finishes without errors. If it fails, **stop** and fix the environment before touching code.
3. Read `harness/progress/current.md` to understand where the last session left off.
4. Read `harness/feature_list.json`. ALL features follow **Spec Driven Development** — see §4 of this file.
5. Read `docs/specs.md` before touching any spec or feature.

## 2. Repository map

| File / folder               | What it contains                                                           | When to read it                  |
|-----------------------------|-----------------------------------------------------------------------------|----------------------------------|
| `CONTRACTS.md`              | Domain contracts: architecture, module roles, invariants, verification commands | Always, at start                 |
| `harness/feature_list.json`         | Feature list with status (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`) | Always, at start                 |
| `harness/progress/current.md`       | Current session state                                                       | Always, at start                 |
| `harness/progress/history.md`       | Append-only log of previous sessions                                        | When you need historical context |
| `harness/specs/<feature>/`          | `requirements.md` + `design.md` + `tasks.md` (Kiro-style)                  | Before implementing any feature  |
| `docs/architecture.md`      | What "doing a good job" means in this project                               | Before implementing              |
| `docs/conventions.md`       | Style rules, naming, structure, and **Sonar/code-quality rules** (logging, resources, AssertJ, Docker) | Before writing code              |
| `docs/specs.md`             | SDD process: EARS notation, 3 files, human approval gate                   | Before writing or reading a spec |
| `docs/verification.md`      | How to verify your work works (including requirement traceability)          | Before marking a task as `done`  |
| `harness/CHECKPOINTS.md`            | Objective criteria for "correct final state"                                | For self-assessment              |
| `.opencode/agent/`           | Subagent definitions (`leader`, `spec-author`, `implementer`, `reviewer`)   | If you orchestrate work          |
| `index.html` / `interview.html` | Pages (no build, `file://` first-class)     | When touching UI or loading order |
| `js/`                       | Application code (IIFE modules, ES5-ish, `window.Module` globals) | To implement                     |
| `../../apply/`              (outside repo) | Offer dossiers `apply/<empresa>.md` + stage question sets `apply/sets/<empresa>.json` | For the offer-mode feature       |
| `docs/architecture-options.md` | Architecture pattern catalog (module: architecture-catalog) | When filling design.md Architectural Decisions |
| `docs/iteration-protocol.md`   | Adaptive iteration + adversarial review protocol (module: iterative-refinement) | During implementer refinement rounds |
| `docs/log-reader-protocol.md`  | Delegate big-log reading to a cheap read-only subagent + verify evidence (module: log-reader) | When a file under `harness/logs/` is too big to read in session |
| `harness/tools/`               | Module tools: `audit-security.sh`, `bench.sh`, `scan.py` (if present) | On review (audits) or session start (scan) |
| `harness/decisions/`           | ADRs worth remembering beyond a feature (if present) | Before proposing a new architectural decision |
| `harness/wekan.json`           | Wekan ticket-mirror config (if present) | When syncing workflow state to the board |

> Module files are conditional: if a file above exists, its module was installed —
> follow it. If absent, ignore references to it.

## 3. Hard rules (non-negotiable)

- **One feature at a time.** Never pull a task from another feature into the same session; inside a feature, work in batches of 2–4 tasks (§4).
- **Do not mark a task `done` without green tests.** Run `harness/init.sh` and ensure the test block passes 100%.
- **Do not skip the spec phase.** Every feature must go through `spec-author` and obtain human approval before touching code.
- **Do not skip the human approval gate.** The leader stops the flow at `spec_ready` and waits.
- **Document what you do** in `harness/progress/current.md` while working, not at the end.
- **Leave the repository clean** before closing the session (see §5).
- **If you don't know something, look in `docs/`** before inventing it.

<!-- harness:workflow:start -->
## 4. Workflow (SDD — hybrid: one in-session agent, same gates)

Same discipline as the full flow, executed by a single in-session agent. Roles
become modes you play sequentially; evidence replaces dispatches. The two human
gates are NOT negotiable — hybrid changes who executes, never who approves.

```
pending → [spec mode] → spec_ready → ⏈ HUMAN → in_progress → [batch mode → verify]×n → ⏈ HUMAN → done
```

1. **Spec mode.** Write `harness/specs/<name>/{requirements,design,tasks.md}`
   exactly as `spec-author` would — follow `.opencode/agent/spec-author.md` as
   a script. Mark the feature `spec_ready` and STOP for the human Spec Gate.
2. **Batch mode.** After approval, implement one batch at a time (2–4
   consecutive `T<n>` tasks), following `.opencode/agent/implementer.md`.
   Never a whole feature in one sitting.
3. **Evidence rule (the core of hybrid).** After every batch:
   - run the gates yourself (`harness/init.sh` / TEST_CMD) and save the full
     output to `harness/logs/<feature>/batch-<n>.log`;
   - tick tasks `[x]` only with that log in place, referencing it in tasks.md;
   - verify on disk: files present, no task done without green gates.
   A claim without a log is not evidence — the rule the leader applies to
   subagents, applied to yourself.
4. **Review mode.** Before requesting the Completion Gate: run
   `python3 harness/tools/check-traceability.py harness/feature_list.json`,
   save its output to `harness/specs/<name>/review.md`, and walk
   `.opencode/agent/reviewer.md` as a checklist. Reject your own work if any
   `R<n>` lacks evidence.
5. **Escalate to the full dispatch flow when any of these hold:** the feature
   has more than ~12 tasks; it touches files marked critical in
   `docs/conventions.md`; a batch stalls twice; or verification is subjective
   (no mechanical gate covers it). Then act as leader and dispatch a real
   reviewer subagent — fresh context is the value you are trading away for
   speed.

Trade-off, stated plainly: hybrid trades independent-context review for
velocity. The evidence logs and the traceability check are what keep that
trade honest.
<!-- harness:workflow:end -->
## 5. Session lifecycle (closure)

Before finishing:

1. Run `harness/init.sh` — all green.
2. If the task is done: mark `status: "done"` in `harness/feature_list.json`.
3. Move the summary from `harness/progress/current.md` to the end of `harness/progress/history.md`.
4. Clear `harness/progress/current.md` leaving only the template.
5. Do not leave temporary files, debug prints, or context-free TODOs.

## 6. If you get stuck

- Re-read the relevant section of `docs/`.
- If a tool doesn't behave as expected, **do not invent a workaround**: document the block in `harness/progress/current.md` and stop the session.
