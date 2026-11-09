#!/usr/bin/env python3
"""guard-push-delete.sh の判定表。`python3 .claude/hooks/__tests__/test-guard-push-delete.py` で実行。

mazuoboeru の同じ hook の試験（33 通り + jq なし 2 通り）を移したもの。
hook はコマンドを読むだけで git を走らせないので、リポジトリは要らない。
CI は回さない（ほかの hook のテストと同じく手動）。
"""

import json
import os
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(__file__), "..", "guard-push-delete.sh")

BLOCK = 2
PASS = 0

P = "git push"

HEREDOC_PUSH = (
    f"git commit -m \"$(cat <<'EOF'\nfix(claude): 削除の push を止める\n\n"
    f"{P} origin :claude/x と {P} -d origin x\nEOF\n)\""
)

CASES: list[tuple[int, str]] = [
    (PASS, f"{P} -u origin claude/harness-trim"),
    (PASS, f"{P} origin claude/x"),
    (PASS, f"{P} origin HEAD:refs/heads/claude/x"),
    (PASS, f"{P} --dry-run origin claude/x"),
    (PASS, f"{P} -o ci.skip origin claude/x"),
    (PASS, f"{P} --force-with-lease origin claude/x"),
    (BLOCK, f"{P} origin :claude/x"),
    (BLOCK, f"{P} origin +:claude/x"),
    (BLOCK, f"{P} origin --delete claude/x"),
    (BLOCK, f"{P} --delete origin claude/x"),
    (BLOCK, f"{P} -d origin claude/x"),
    (BLOCK, f"{P} origin -d claude/x"),
    (BLOCK, f"{P} -ud origin claude/x"),
    (BLOCK, f"{P} --del origin claude/x"),
    (BLOCK, f"{P} --prune origin 'refs/heads/*:refs/heads/*'"),
    (BLOCK, f"{P} --mirror origin"),
    (BLOCK, "git -C /workspace push origin :claude/x"),
    (BLOCK, "git -c push.default=current push origin :claude/x"),
    (BLOCK, f"cd /workspace && {P} origin ':claude/x'"),
    (BLOCK, f'bash -c "{P} origin :claude/x"'),
    (BLOCK, f"{P} origin claude/x;{P} origin :claude/y"),
    (BLOCK, f"echo $({P} origin :claude/x)"),
    (BLOCK, f"GIT_TRACE=1 {P} origin :claude/x"),
    (BLOCK, f"git add -A\n{P} origin :claude/x"),
    (PASS, 'git commit -m "fix: push :x handling"'),
    (PASS, f'git commit -m "docs: {P} origin :branch を止める"'),
    (PASS, HEREDOC_PUSH),
    (PASS, 'git stash push -m "wip :x"'),
    (PASS, "git log --oneline | grep push"),
    (PASS, f"git fetch --prune && {P} -u origin claude/x"),
    (PASS, f"git branch -d claude/x && {P} -u origin claude/y"),
    (PASS, f'gh pr create --title "x" --body "{P} origin :x は hook が止める"'),
    (PASS, "ls"),
]


def run(command: str, env: dict[str, str]) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run([HOOK], input=payload, capture_output=True, text=True, env=env).returncode


def report(expected: int, actual: int, name: str) -> bool:
    ok = actual == expected
    shown = name.replace("\n", "⏎")[:90]
    print(f"{'ok  ' if ok else 'FAIL'} expected={expected} actual={actual}  {shown}")
    return ok


def main() -> int:
    env = {"PATH": os.environ.get("PATH", "")}
    failed = 0
    for expected, command in CASES:
        failed += not report(expected, run(command, env), command)

    # jq が無ければ、命令が git push のときだけ止める。bash と coreutils だけの PATH を作る
    with tempfile.TemporaryDirectory() as bare:
        for tool in ("bash", "cat", "date", "env"):
            found = subprocess.run(["which", tool], capture_output=True, text=True).stdout.strip()
            os.symlink(found, os.path.join(bare, tool))
        failed += not report(BLOCK, run(f"{P} origin claude/x", {"PATH": bare}), "jq なしで push")
        failed += not report(PASS, run("ls -la", {"PATH": bare}), "jq なしで ls")

    total = len(CASES) + 2
    print(f"\n{total - failed}/{total} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
