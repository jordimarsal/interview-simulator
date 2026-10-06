# Conventions — VERBATIM · Voice Interview Simulator

> The authoritative style rules are `CONTRACTS.md` §4 (code style) and §3
> (invariants). This file only adds what the harness needs to check.

---

## Language and stack

- Vanilla JS, ES5-ish: `function () {}`, IIFE + `"use strict"`, globals as
  `window.Module`. No ESM, no classes, no transpiler.
- Every module starts with a capsuled header comment (`/* === VERBATIM · … === */`).
- Inline comments only for non-evident *why*s.

## Bilingual copy (hard rule)

- Every user-visible string is a key in `js/i18n.js` with `es` + `en` entries.
- HTML uses `data-i18n`; dynamic strings use `T("key")` (app.js) or
  `Config.i18n("key")`.
- Offer question sets carry `{es, en}` pairs per question — same rule, same file
  format.

## Verification (gates)

```bash
# Gate 1 — syntax (every JS module, every shell script)
for f in js/*.js; do node --check "$f"; done
for f in scripts/*.sh; do bash -n "$f"; done

# Gate 2 — e2e (jsdom loads interview.html, taps the mic, captures console errors)
#   Scene pattern: /tmp/opencode/e2e-interview.js — stub
#   HTMLCanvasElement.getContext (Proxy noop) and matchMedia before parse.
node /tmp/opencode/e2e-interview.js   # when present

# Gate 3 — data
node harness/tools/validate-feature-list.py harness/feature_list.json
python3 -c "import json,glob; [json.load(open(p)) for p in glob.glob('../apply/sets/*.json')] && print('offer sets JSON OK')"
```

- No task is `done` with Gate 1 red. Features touching the interview flow need
  Gate 2. Offer-set data changes need Gate 3.

## Environment gotchas (already paid for, do not re-learn)

- Node ≥ 21: `global.navigator` is a getter-only — stub with
  `Object.defineProperty(global, "navigator", {value, configurable: true})`.
- jsdom + `file://`: opaque origin → `localStorage` throws `SecurityError`;
  stub `Config` or inject localStorage in `beforeParse`.
- jsdom may lack `fetch`: inject `window.fetch` in `beforeParse` to test remote
  paths.
- This machine: `ollama.service` retains ~2 GB VRAM; LLM on GPU `:8080`,
  Whisper on CPU `:8081`.
