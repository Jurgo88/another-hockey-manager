#!/bin/sh
# A fit: eight generated leagues (seeds 1-8) in parallel, then the gate report and
# where the level went. About 85 s on 12 cores.
#
#   sh .claude/skills/calibrate/scripts/fit.sh            generated leagues
#   ROSTER=1 sh .claude/skills/calibrate/scripts/fit.sh   and the NHL roster file
#
# Env: PATCH and SEASONS as in fit-run.mts. OUT, the folder for the runs,
# default packages/sim/.cache/fit (gitignored); keep a trial's runs by giving
# each its own OUT.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../.." && pwd)
OUT=${OUT:-$ROOT/packages/sim/.cache/fit}
mkdir -p "$OUT"
rm -f "$OUT"/seed-*.json "$OUT"/roster-file.json
cd "$ROOT/packages/sim"
for seed in 1 2 3 4 5 6 7 8; do npx tsx "$HERE/fit-run.mts" $seed "$OUT/seed-$seed.json" & done
if [ -n "$ROSTER" ]; then
  npx tsx "$HERE/fit-run.mts" 1 "$OUT/roster-file.json" ../estimate/data/nhl-20252026.json &
fi
wait
echo "--- eight generated leagues"
npx tsx "$HERE/fit-report.mts" "$OUT"/seed-*.json
if [ -n "$ROSTER" ]; then
  echo "--- roster file"
  npx tsx "$HERE/fit-report.mts" "$OUT/roster-file.json"
fi
echo "--- where the level went"
npx tsx "$HERE/levels.mts" "$OUT"/seed-*.json
echo "runs in $OUT"
