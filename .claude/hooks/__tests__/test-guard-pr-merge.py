#!/usr/bin/env python3
"""guard-pr-merge.sh の判定表。`python3 .claude/hooks/__tests__/test-guard-pr-merge.py` で実行。

gh は PATH の先頭に置いた偽物に差し替える（ネットワークにも GitHub にも出ない）。
偽物は環境変数で答えを変える: FAKE_FILES（変更ファイル）、FAKE_COMMENTS（コメント）、
FAKE_CURRENT（今のブランチの PR 番号）、FAKE_FAIL（files / comments で失敗させる）。
CI は回さない（ほかの hook のテストと同じく手動）。
"""

import json
import os
import stat
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(__file__), "..", "guard-pr-merge.sh")

BLOCK = 2
PASS = 0

FAKE_GH = """#!/usr/bin/env bash
case "$*" in
  "pr view --json number -q .number") [ -n "${FAKE_CURRENT:-}" ] && echo "$FAKE_CURRENT" || exit 1 ;;
  *"--json files"*) [ "${FAKE_FAIL:-}" = files ] && exit 1; printf '%s\\n' "${FAKE_FILES:-}" ;;
  *"--json comments"*) [ "${FAKE_FAIL:-}" = comments ] && exit 1; printf '%s\\n' "${FAKE_COMMENTS:-}" ;;
  *) exit 1 ;;
esac
"""

CODE = "packages/web/src/App.tsx"
MIGRATION = "packages/web/drizzle/0008_kokemusu_posts.sql\npackages/web/worker/db/schema.ts"
BOOKMARK = "**D1 Time Travel bookmark (taken before merge)**\n`00000085-0000...`"

# 組み立てる。直書きすると、このファイルを heredoc で書く Bash コマンドを hook 自身が止める。
M = "gh pr " + "merge"

# (期待, 名前, コマンド, 偽 gh の環境)
CASES: list[tuple[int, str, str, dict[str, str]]] = [
    # --- 形の検査 ---
    (BLOCK, "即時 merge", f"{M} 80 --squash", {"FAKE_FILES": CODE}),
    (BLOCK, "--auto だけ（merge commit）", f"{M} --auto 80", {"FAKE_FILES": CODE}),
    (BLOCK, "--auto --merge", f"{M} --auto --merge 80", {"FAKE_FILES": CODE}),
    (BLOCK, "--admin", f"{M} --auto --squash --admin 80", {"FAKE_FILES": CODE}),
    (BLOCK, "1 回に 2 PR", f"{M} --auto --squash 80 && {M} --auto --squash 81", {"FAKE_FILES": CODE}),
    (BLOCK, "bash -c で包んだ即時 merge", f'bash -c "{M} 80 --squash"', {"FAKE_FILES": CODE}),
    (BLOCK, "PR を決められない", f"{M} --auto --squash", {"FAKE_FILES": CODE}),
    # 文字列として出てくるだけでも検査する（bash -c を止めるための fail-closed。既知の誤検知）
    (BLOCK, "grep の引数", f'grep -n "{M}" CLAUDE.md', {}),
    # --- migration の関門 ---
    (BLOCK, "migration で bookmark が無い", f"{M} --auto --squash 80", {"FAKE_FILES": MIGRATION}),
    (
        BLOCK,
        "URL 指定の migration で bookmark が無い",
        f"{M} --auto --squash https://github.com/okayus/matatabetai/pull/80",
        {"FAKE_FILES": MIGRATION},
    ),
    (BLOCK, "変更ファイルを取れない", f"{M} --auto --squash 80", {"FAKE_FAIL": "files"}),
    (BLOCK, "コメントを取れない", f"{M} --auto --squash 80", {"FAKE_FILES": MIGRATION, "FAKE_FAIL": "comments"}),
    # --- 通すもの ---
    (PASS, "merge 以外", "git status", {}),
    (PASS, "--auto --squash", f"{M} --auto --squash 80", {"FAKE_FILES": CODE}),
    (PASS, "-s の短縮形", f"{M} --auto -s 80", {"FAKE_FILES": CODE}),
    (PASS, "PR 番号の後に ; が付く", f"{M} --auto --squash 80; echo done", {"FAKE_FILES": CODE}),
    (PASS, "--delete-branch 付き", f"{M} --auto --squash 80 --delete-branch", {"FAKE_FILES": CODE}),
    (PASS, "今のブランチの PR", f"{M} --auto --squash", {"FAKE_FILES": CODE, "FAKE_CURRENT": "80"}),
    (
        PASS,
        "migration で bookmark がある",
        f"{M} --auto --squash 80",
        {"FAKE_FILES": MIGRATION, "FAKE_COMMENTS": BOOKMARK},
    ),
]


def write_exec(path: str, body: str) -> None:
    with open(path, "w") as f:
        f.write(body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)


def run(command: str, env: dict[str, str]) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run([HOOK], input=payload, capture_output=True, text=True, env=env).returncode


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        fake_bin = os.path.join(tmp, "fake-bin")
        os.makedirs(fake_bin)
        write_exec(os.path.join(fake_bin, "gh"), FAKE_GH)
        base = {"PATH": f"{fake_bin}:{os.environ.get('PATH', '')}", "HOME": tmp}

        failed = 0
        for expected, name, command, fake in CASES:
            actual = run(command, {**base, **fake})
            ok = actual == expected
            failed += not ok
            print(f"{'ok  ' if ok else 'FAIL'} {name} (expected={expected} actual={actual})")

        # jq が無ければ検査できないので止める。bash と coreutils だけの PATH を作る
        bare_bin = os.path.join(tmp, "bare-bin")
        os.makedirs(bare_bin)
        for tool in ("bash", "cat", "grep", "wc"):
            found = subprocess.run(["which", tool], capture_output=True, text=True).stdout.strip()
            os.symlink(found, os.path.join(bare_bin, tool))
        rc = run(f"{M} --auto --squash 80", {"PATH": f"{fake_bin}:{bare_bin}", "HOME": tmp})
        ok = rc == BLOCK
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} jq が無い (expected={BLOCK} actual={rc})")

        total = len(CASES) + 1
        print(f"\n{total - failed}/{total} passed")
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
