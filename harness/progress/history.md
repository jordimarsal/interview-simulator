# Historical log (append-only)

> Each time a session closes, its summary is appended here.
> Do not edit previous entries. Only append.

Entry shape — the `retro:` line is the per-feature efficiency record
(inspect it to see where process friction accumulates):

    ## <date> — <feature>

    <3-5 line summary>

    retro: <n> dispatches · <s> stalls · <r> restarts
---

## 2026-10-06 — offer_mode (done)

- **What:** per-offer interview mode — stage question sets (`apply/sets/<empresa>.json` →
  `js/offer-sets.js` via `scripts/build-offer-sets.py`), gap probing in remote prompts,
  stage selector, STAR drill (client-owned pointer, 2 turns per story), offline builtin
  fallback, drawer UI (offer/stage/STAR/file loader), config persistence, 16 i18n keys (es+en).
- **Also:** harness-standard v0.4.1 installed (opencode); project contracts moved to
  `CONTRACTS.md` (AGENTS.md is installer-managed and points to it); real gates wired
  (`npm test` → `scripts/check.sh`); badge added to README.
- **Bugs found & fixed:** orb.js `this` loss killed the rAF loop 2,6s into agent mode
  (latent, real browser too) — CONTRACTS §6 #9; `Offers.setStage()` validated against
  its own not-yet-written state — §6 #10.
- **Verification:** check.sh green · Node harness 29/29 · e2e jsdom 19/19 (classic +
  full STAR session to verdict) · harness/init.sh green.
- **Sets shipped:** back_market (6 stages), yaba, preply, clarivate, extia.
- **Deviations:** hybrid-pragmatic flow agreed with the human — work executed in-session
  by one agent (spec → gate → batches → gate), no implementer subagents.
- retro: 0 dispatches · 0 stalls · 0 restarts (in-session hybrid flow)

---

## 2026-10-06 — harness upgraded v0.4.1 → v0.6.0 (maintenance)

- `--update --hybrid`: workflow now hybrid (formalized in harness-standard
  v0.6.0 — the in-session flow used for offer_mode, now with mandatory
  evidence logs in harness/logs/<feature>/ and archived traceability).
- Merge-back after update (edits live outside the workflow markers):
  CONTRACTS.md as mandatory step 1 + repo-map rows re-inserted into AGENTS.md;
  opencode.json build permission corrected (stack now detects node — npm test
  is the gate; no build step in this repo). Pre-update copies in
  harness/backup/2026-10-06T181552Z/ (gitignored — content in git history).
- Verified: harness/init.sh green · Node harness 29/29 · e2e 19/19.
