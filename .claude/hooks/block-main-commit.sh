#!/usr/bin/env bash
set -euo pipefail

cmd=$(jq -r '.tool_input.command // ""')

if echo "$cmd" | grep -Eiq 'git[[:space:]]+(commit|push)' && \
   [ "$(git branch --show-current 2>/dev/null)" = "main" ]; then
  echo "ERROR: main への直接 commit/push は禁止。feature branch を切ってください (例: git switch -c feat/<short-description>)。" 1>&2
  exit 2
fi

exit 0
