#!/usr/bin/env bash
# check.sh — verification gates (CONTRACTS.md §5). Run from the repo root.
#   Gate 1: syntax of every JS module and shell script.
#   Gate 2: offer-set JSON files parse (only when the external apply/ folder
#           exists — the repo stays self-contained without it).
set -u
fail=0

for f in js/*.js; do
  node --check "$f" || fail=1
done
for f in scripts/*.sh; do
  bash -n "$f" || fail=1
done

SETS_DIR="../../apply/sets"
if [ -d "$SETS_DIR" ]; then
  for f in "$SETS_DIR"/*.json; do
    [ -e "$f" ] || continue
    python3 -m json.tool "$f" > /dev/null || { echo "invalid JSON: $f"; fail=1; }
  done
fi

if [ "$fail" -eq 0 ]; then
  echo "check.sh: all gates green"
fi
exit "$fail"
