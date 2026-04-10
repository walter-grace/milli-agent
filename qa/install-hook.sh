#!/usr/bin/env bash
# Install qa/run-all.mjs as a git pre-commit hook.
# Usage:  bash qa/install-hook.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ ! -d .git ]; then
  echo "✗ not a git repo at $REPO_ROOT"
  echo "  initialize first:  git init"
  exit 1
fi

HOOK="$REPO_ROOT/.git/hooks/pre-commit"
mkdir -p "$REPO_ROOT/.git/hooks"

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# Milli-Agent pre-commit: run UI smoke tests against the local server.
# Skipped if MILLI_QA_SKIP=1 (use sparingly — never just to bypass red).
set -e
if [ "${MILLI_QA_SKIP:-0}" = "1" ]; then
  echo "⚠  pre-commit skipped (MILLI_QA_SKIP=1)"
  exit 0
fi

REPO="$(git rev-parse --show-toplevel)"
BASE="${MILLI_QA_BASE:-http://127.0.0.1:3737}"

# Skip if server isn't running — don't block local commits when nothing's up
if ! curl -sf -o /dev/null "$BASE/" 2>/dev/null; then
  echo "⚠  pre-commit: $BASE unreachable, skipping QA"
  exit 0
fi

echo "▶ pre-commit: running qa/run-all.mjs against $BASE"
if BASE="$BASE" node "$REPO/qa/run-all.mjs"; then
  echo "✓ QA passed"
  exit 0
else
  echo "✗ QA failed — commit aborted"
  echo "  bypass with:  MILLI_QA_SKIP=1 git commit ..."
  exit 1
fi
HOOK_EOF

chmod +x "$HOOK"
echo "✓ installed pre-commit hook at $HOOK"
echo "  bypass once:    MILLI_QA_SKIP=1 git commit ..."
echo "  custom base:    MILLI_QA_BASE=http://127.0.0.1:9999 git commit ..."
