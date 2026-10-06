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

## 4. Workflow (SDD — mandatory for all features)

```
pending → [spec-author] → spec_ready → ⏈ HUMAN → in_progress → [implementer → reviewer] → done
```

1. The leader detects the first `pending` feature.
2. The leader dispatches `spec-author`, who creates `harness/specs/<name>/{requirements,design,tasks}.md` and marks status as `spec_ready`.
3. **Pause.** The human reads the spec at `harness/specs/<name>/` and approves (or requests changes).
4. Once approved, the leader changes status to `in_progress` and dispatches `implementer`.
5. The implementer executes `tasks.md` **one batch at a time**, marking each task `[x]` (see *Batching* below).
6. The reviewer verifies traceability `R<n>` ↔ test and task completion; approves or rejects.
7. The human reviewer confirms the Completion Gate (`docs/specs.md`). Only after that explicit human approval does the implementer create `harness/specs/<name>/APPROVAL` (human, date, gate), change status to `done`, and move the summary to `harness/progress/history.md`, adding one retro line under it: `retro: <n> dispatches · <s> stalls · <r> restarts` — count what you received for this feature (a stall is a `Nothing was written` re-dispatch; a restart is being re-dispatched in a fresh session).

### Batching (one dispatch = one batch)

The leader never hands a whole feature to a single implementer dispatch:

- A batch = **2–4 consecutive `T<n>` tasks** forming one coherent unit (a change plus its tests). Use 1 task when a single task is large (migration + repository + tests), 4 only when the tasks are small clones, **never 5+**.
- The dispatch names the batch, the first file to create and the gates to reach — nothing else. The protocol itself lives in `.opencode/agent/implementer.md` (or `.claude/agents/implementer.md`).
- After every batch the leader verifies **on disk** before dispatching the next one: tasks marked `[x]`, files really present, and the gates run **by the leader itself**. A subagent's chat claim is not evidence.
- Empty reply or missing files → the batch stalled: re-dispatch the **same** batch opened with `Nothing was written: <missing paths>. Create <first file> now.` Two stalls in a row → start a fresh subagent session; likewise start a fresh session once one approaches ~70% of its context window (a full context stops working silently).

### Parallelism

When `"parallel": true` in `harness/feature_list.json` project config:
- Independent tasks (no `depends_on`) can be dispatched to separate implementer subagents simultaneously.
- Only 1 feature may be `in_progress` at a time.

When `"parallel": false` (default): sequential execution, one task at a time.

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
