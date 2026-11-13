#!/usr/bin/env bash
# The master's merge-to-live in one command, with short output (saves tokens and round trips).
#   tools/ship.sh [branch ...]   merge each branch (--no-ff), bump CACHE once, typecheck, test, commit, push, deploy, verify
#   tools/ship.sh --no-push ...  the same, but stop after the commit (for areas that need the owner's approval)
# Stops at the first failure and prints only the failing tail.
set -euo pipefail
cd "$(dirname "$0")/.."
PUSH=1
[ "${1:-}" = "--no-push" ] && { PUSH=0; shift; }
TRAIL='Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
[ "$(git branch --show-current)" = main ] || { echo "not on main"; exit 1; }

for b in "$@"; do
  n=$(git rev-list --count "main..$b")
  [ "$n" = 0 ] && { echo "$b: nothing new"; continue; }
  echo "$b: $n commits; $(git diff --shortstat "main...$b")"
  git merge --no-ff -q "$b" -m "Merge $b: $(git log -1 --format=%s "$b" | cut -c1-120)

$TRAIL"
done

cur=$(grep -o "helper-v[0-9]*" public/sw.js | head -1); next="helper-v$(( ${cur#helper-v} + 1 ))"
sed -i "s/$cur/$next/" public/sw.js
npm run -s typecheck >/tmp/ship-tc.log 2>&1 || { tail -20 /tmp/ship-tc.log; git checkout public/sw.js; exit 1; }
npm test >/tmp/ship-test.log 2>&1 || { grep -iE "fail|error" /tmp/ship-test.log | tail -20; git checkout public/sw.js; exit 1; }
echo "checks pass ($(grep -cE "passed|pass" /tmp/ship-test.log) suites)"
git commit -qam "CACHE ${next#helper-}

$TRAIL"
echo "committed $(git log -1 --format=%h) as $next"
[ $PUSH = 0 ] && { echo "not pushed (--no-push)"; exit 0; }

git push -q origin main 2>&1 | grep -v "^warning" || true
npx wrangler deploy 2>&1 | grep -i "version id" || { echo "deploy failed"; exit 1; }
for i in 1 2 3 4 5 6; do
  live=$(curl -s "https://helper.shemrivers.workers.dev/sw.js?z=$RANDOM$RANDOM" | grep -o "helper-v[0-9]*" || true)
  [ "$live" = "$next" ] && { echo "live: $live"; exit 0; }
  sleep 10
done
echo "live still says $live (edge may be stale; recheck)"
