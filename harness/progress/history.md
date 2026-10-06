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
