#!/usr/bin/env python3
"""block-main-commit.py の判定表。`python3 .claude/hooks/__tests__/test-block-main-commit.py` で実行。

この hook は「コマンド位置の git commit / push」かつ「それが走るディレクトリの
ブランチが main」で止める。判定に実際の git リポジトリが要るので、tempdir に
3 つ（main のリポジトリ / feature branch のリポジトリ / リポジトリでない場所）を
作ってから回す。ケースは (期待, 名前, コマンド, hook を動かす cwd)。

CI は回さない（require-container のテストと同じく手動）。
"""

import json
import os
import subprocess
import sys
import tempfile

HOOK = os.path.join(os.path.dirname(__file__), "..", "block-main-commit.py")

BLOCK = 2
PASS = 0


def init_repo(path: str, branch: str) -> str:
    os.makedirs(path, exist_ok=True)
    subprocess.run(
        ["git", "init", "-q", "-b", branch, path], check=True, capture_output=True
    )
    return path


def build_cases(main_repo: str, feat_repo: str, plain_dir: str):
    """(expected, name, command, cwd) の並び。

    `git commit` / `git push` をソースに直書きすると、この hook 自身が自分のテストを
    書き換える commit を止めてしまうので組み立てる（sh 版の部分一致で実際に踏んだ）。
    """
    g, cm, pu = "git", "com" + "mit", "pu" + "sh"

    return [
        # --- main で commit / push しようとしているものは止める ---
        (BLOCK, "cwd が main", f"{g} {cm} -m x", main_repo),
        (BLOCK, "main のリポジトリへ cd", f"cd {main_repo} && {g} {cm} -m x", feat_repo),
        (BLOCK, "git -C で main を指す", f"{g} -C {main_repo} {pu}", feat_repo),
        (BLOCK, "空白なしの ; 区切り", f"cd {main_repo};{g} {cm} -m x", feat_repo),
        (BLOCK, "パイプの先", f"cd {main_repo}; echo x | {g} {cm} -F -", feat_repo),
        (BLOCK, "引用符内に ; を含むメッセージ", f"{g} {cm} -m 'a;b'", main_repo),
        (BLOCK, "リダイレクト付き", f"{g} {cm} -m x > /dev/null", main_repo),
        (BLOCK, "env 前置き", f"GIT_AUTHOR_NAME=x {g} {cm} -m y", main_repo),
        (BLOCK, "相対 cd", f"cd .. && cd {os.path.basename(main_repo)} && {g} {pu}", feat_repo),
        (BLOCK, "サブシェル", f"({g} -C {main_repo} {cm} -m x)", feat_repo),
        # heredoc の *終端後* は本物のコマンド位置
        (BLOCK, "heredoc の後の本物", f"cat <<'EOF'\nnote\nEOF\n{g} {cm} -m x", main_repo),
        # --- 通すべきもの ---
        # sh 版はここで止まっていた。cwd（= プロジェクト）が main というだけで、
        # 別リポジトリへの commit を巻き込んでいた。CLAUDE.md が定める skill 還元の手順。
        (PASS, "feature branch のリポジトリへ cd", f"cd {feat_repo} && {g} {cm} -m x", main_repo),
        (PASS, "cwd が feature branch", f"{g} {cm} -m x", feat_repo),
        (PASS, "git -C で feature branch を指す", f"{g} -C {feat_repo} {pu}", main_repo),
        # sh 版は部分一致だったので、本文に文字列が出るだけで止まっていた。
        # gh pr create / gh pr comment はこのプロジェクトの標準ワークフロー。
        (PASS, "PR 本文の文字列", f'gh pr create --body "手順: {g} {pu} origin main"', main_repo),
        (PASS, "heredoc 本文の文字列", f"cat <<'EOF'\n{g} {cm} -m x\nEOF", main_repo),
        (PASS, "cd するが git ではない", f"cd {main_repo} && ls", feat_repo),
        (PASS, "commit / push 以外の git", f"{g} status", main_repo),
        (PASS, "git リポジトリでない場所", f"cd {plain_dir} && {g} {cm} -m x", main_repo),
        # 引用符が行をまたぐと解析できない。fail-open
        # （見逃しは protect-main ruleset が拾うが、誤ブロックは誰も拾わない）
        (PASS, "引用符が閉じていない", f'{g} {cm} -m "unclosed', main_repo),
    ]


def run(command: str, cwd: str) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run(
        [sys.executable, HOOK], input=payload, capture_output=True, text=True, cwd=cwd
    ).returncode


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        main_repo = init_repo(os.path.join(tmp, "on-main"), "main")
        feat_repo = init_repo(os.path.join(tmp, "on-feature"), "feat/x")
        plain_dir = os.path.join(tmp, "not-a-repo")
        os.makedirs(plain_dir, exist_ok=True)

        cases = build_cases(main_repo, feat_repo, plain_dir)
        failed = 0
        for expected, name, command, cwd in cases:
            actual = run(command, cwd)
            ok = actual == expected
            failed += not ok
            print(f"{'ok  ' if ok else 'FAIL'} {name} (expected={expected} actual={actual})")

        # Bash 以外のツールには一切干渉しない
        payload = json.dumps(
            {"tool_name": "Edit", "tool_input": {"command": f"cd {main_repo} && git com" + "mit -m x"}}
        )
        rc = subprocess.run(
            [sys.executable, HOOK], input=payload, capture_output=True, text=True, cwd=main_repo
        ).returncode
        ok = rc == 0
        failed += not ok
        print(f"{'ok  ' if ok else 'FAIL'} Bash 以外のツール (expected=0 actual={rc})")

        print(f"\n{len(cases) + 1 - failed}/{len(cases) + 1} passed")
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
