#!/usr/bin/env python3
"""guard-push-delete.sh の判定表。`python3 .claude/hooks/__tests__/test-guard-push-delete.py` で実行。

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

G, P = "git", "push"

CASES: list[tuple[int, str, str]] = [
    # --- リモートのブランチを消す形は止める ---
    (BLOCK, ":branch の refspec", f"{G} {P} origin :claude/old"),
    (BLOCK, "+:branch の refspec", f"{G} {P} origin +:claude/old"),
    (BLOCK, "--delete が push の直後", f"{G} {P} --delete origin claude/old"),
    (BLOCK, "-d", f"{G} {P} -d origin claude/old"),
    (BLOCK, "--delete が remote の後", f"{G} {P} origin --delete claude/old"),
    (BLOCK, "--prune", f"{G} {P} --prune origin 'refs/heads/*:refs/heads/*'"),
    (BLOCK, "--mirror", f"{G} {P} --mirror origin"),
    (BLOCK, "区切りの後の削除", f"{G} status && {G} {P} origin :claude/old"),
    (BLOCK, "語に付いた ;", f"{G} fetch;{G} {P} origin :claude/old"),
    (BLOCK, "git -C の別リポジトリ", f"{G} -C ../okayus-skills {P} origin :feat/x"),
    # --- 通すもの ---
    (PASS, "ふつうの push", f"{G} {P} -u origin claude/x"),
    (PASS, "HEAD:branch の refspec", f"{G} {P} origin HEAD:claude/x"),
    (PASS, "push の後でローカルのブランチを消す", f"{G} {P} origin claude/x && {G} branch -d claude/old"),
    (PASS, "ローカルのブランチだけ消す", f"{G} branch -D claude/old"),
    (PASS, "ブランチ名に delete を含む", f"{G} {P} -u origin claude/feat-delete-dialog"),
    (PASS, "引用符の中の文字列", f'echo "{G} {P} origin :claude/old"'),
    (PASS, "push 以外の git", f"{G} log --oneline -5"),
]


def run(command: str, env: dict[str, str]) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run([HOOK], input=payload, capture_output=True, text=True, env=env).returncode


def main() -> int:
    env = {"PATH": os.environ.get("PATH", "")}
    failed = 0
    for expected, name, command in CASES:
        actual = run(command, env)
        ok = actual == expected
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} {name} (expected={expected} actual={actual})")

    # jq が無ければ検査できないので止める。bash と cat だけの PATH を作る
    with tempfile.TemporaryDirectory() as tmp:
        for tool in ("bash", "cat"):
            found = subprocess.run(["which", tool], capture_output=True, text=True).stdout.strip()
            os.symlink(found, os.path.join(tmp, tool))
        rc = run(f"{G} {P} -u origin claude/x", {"PATH": tmp})
    ok = rc == BLOCK
    failed += not ok
    print(f"{'ok  ' if ok else 'FAIL'} jq が無い (expected={BLOCK} actual={rc})")

    total = len(CASES) + 1
    print(f"\n{total - failed}/{total} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
