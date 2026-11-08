#!/usr/bin/env bash
# PreToolUse(Bash): リモートのブランチを消す git push を止める（exit 2）。
# 止める形: ":<branch>" と "+:<branch>" の refspec、--delete と -d、--prune、--mirror。
# deny ルールではこれらを書き切れない。末尾の ":*" は旧来の前方一致の書式として読まれ、
# settings.json の "Bash(git push * --delete *)" は --delete が push の直後に来る形と -d に当たらない。
set -u
set -f

deny() {
  echo "guard-push-delete: $1" >&2
  exit 2
}

input=$(cat)
case "$input" in
  *"git"*"push"*) ;;
  *) exit 0 ;;
esac
command -v jq >/dev/null 2>&1 || deny "jq が無いので git push を検査できない"
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
# 語に付いた区切り記号（"x;" "a&&b"）と改行も、文の切れ目として独立した語にする
cmd=${cmd//[;&|]/ ; }
cmd=${cmd//$'\n'/ ; }

seen_git=0
in_push=0
for tok in $cmd; do
  case "$tok" in
    ";")
      seen_git=0
      in_push=0
      ;;
    git) seen_git=1 ;;
    push) [ "$seen_git" -eq 1 ] && in_push=1 ;;
    :* | +:* | --delete | -d | --prune | --mirror)
      [ "$in_push" -eq 1 ] && deny "リモートのブランチを消す push（$tok）は使わない"
      ;;
  esac
done
exit 0
