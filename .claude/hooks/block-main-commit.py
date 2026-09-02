#!/usr/bin/env python3
"""PreToolUse hook — main への直接 commit/push を止める。

判定は 2 段。前身の block-main-commit.sh は両方とも雑で、二方向に壊れていた。

1. **コマンド位置**の `git commit` / `git push` だけを拾う。
   sh 版は `git[[:space:]]+(commit|push)` の部分一致だったので、
   `gh pr create --body "… git push …"` のように本文に出てくるだけで止まっていた。
   heredoc の本文も除外する（commit メッセージを heredoc で渡すのが常用のため）。

2. その git が **実際に走るディレクトリ**のブランチを見る。直前の `cd` と
   `git -C <path>` を追う。sh 版は対象を指定せず `git branch --show-current` を
   呼んでいたので、常にセッションの cwd（= matatabetai）のブランチを答えた。結果:

   - 誤ブロック: `cd ../okayus-skills && git commit …`（skill の還元。CLAUDE.md が
     定める手順）が、matatabetai の checkout が main というだけで止まる
   - 素通し: 逆に matatabetai が feature branch にいる間はフック全体が無効になり、
     main にいる別リポジトリへの commit も通る

境界はサーバー側の `protect-main` ruleset と token scope で、このフックは事故を
早く止める二重化（ADR-001 改訂 2026-08-24）。判定できないときは通す（fail-open）
— 見逃しは ruleset が拾うが、誤ブロックは誰も拾わないため。

exit 2 で stderr が Claude に返る。
"""

import json
import os
import re
import shlex
import subprocess
import sys

# セグメント区切り。パイプや && の後ろもコマンド位置になる。
# 改行は shlex が空白として食ってしまうので、行単位で回して別に扱う。
SEPARATORS = {"&&", "||", "|", ";", "&", "(", ")"}

# <<EOF / <<'EOF' / <<-EOF。`<<<` (herestring) は次のグループが英字始まりでないので
# マッチしない。
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")

# `git <subcommand>` の手前に来る global option のうち、値を別トークンで取るもの。
GIT_OPTS_TAKING_VALUE = {
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--exec-path",
    "--config-env",
}

BLOCKED_SUBCOMMANDS = {"commit", "push"}


def strip_heredocs(command: str) -> str:
    """heredoc の本文を落とす。

    本文はシェルのトークンではなくただのテキストなので、そのまま shlex に渡すと
    commit メッセージの中身をコマンドとして誤検知する。
    """
    lines = command.split("\n")
    kept: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        kept.append(line)
        tags = [m.group(2) for m in HEREDOC.finditer(line)]
        i += 1
        for tag in tags:
            while i < len(lines) and lines[i].strip() != tag:
                i += 1
            i += 1  # 終端行そのものも飛ばす
    return "\n".join(kept)


def segments(command: str):
    """コマンド位置ごとのトークン列を順に返す。

    `shlex.split` ではなく `punctuation_chars=True` の lexer を使う。前者は空白でしか
    切らないので `cd /path; git commit` が `/path;` という 1 トークンになり、cd の
    追跡が壊れて検知漏れになる。punctuation_chars は `();<>|&` を独立トークンにし、
    `&&` `||` のような連なりは 1 つにまとめ、引用符の中の `;` は触らない。

    括弧も区切りとして扱うので `(cd x && git commit)` の中身は拾えるが、サブシェルの
    スコープは追わない（閉じ括弧の後も cwd が残る）。誤ブロック側に倒れうるが、
    サブシェルで cd してから外で commit する形は実際には出ないので許容する。

    引用符が行をまたぐと ValueError になるが、その行は諦めて飛ばす (fail-open)。
    """
    for line in strip_heredocs(command).split("\n"):
        lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        try:
            tokens = list(lexer)
        except ValueError:
            continue
        current: list[str] = []
        for token in tokens:
            if token in SEPARATORS:
                if current:
                    yield current
                current = []
            else:
                current.append(token)
        if current:
            yield current


def drop_env_prefix(tokens: list[str]) -> list[str]:
    """FOO=bar cmd … の前置きを読み飛ばす。"""
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if "=" in token and token.split("=", 1)[0].isidentifier():
            i += 1
            continue
        break
    return tokens[i:]


def resolve(path: str, base: str) -> str:
    path = os.path.expanduser(path)
    if os.path.isabs(path):
        return os.path.normpath(path)
    return os.path.normpath(os.path.join(base, path))


def git_target(tokens: list[str], cwd: str) -> tuple[str | None, str]:
    """tokens[0] == "git" 前提で (subcommand, その git が走るディレクトリ) を返す。"""
    directory = cwd
    i = 1
    while i < len(tokens):
        token = tokens[i]
        if token == "-C":
            if i + 1 >= len(tokens):
                return None, directory
            directory = resolve(tokens[i + 1], directory)
            i += 2
        elif token.startswith("-C") and len(token) > 2:
            directory = resolve(token[2:], directory)
            i += 1
        elif token in GIT_OPTS_TAKING_VALUE:
            i += 2
        elif token.startswith("-"):
            i += 1  # --no-pager など値を取らないもの、--git-dir=… の = 形式も含む
        else:
            return token, directory
    return None, directory


def current_branch(directory: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", directory, "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None  # git リポジトリではない。commit 自体が失敗するので通す
    return result.stdout.strip()


def find_offender(command: str, cwd: str) -> tuple[str, str] | None:
    """main で commit/push しようとしている最初の (ディレクトリ, subcommand) を返す。"""
    for raw in segments(command):
        tokens = drop_env_prefix(raw)
        if not tokens:
            continue
        head = os.path.basename(tokens[0])
        if head == "cd":
            args = [t for t in tokens[1:] if not t.startswith("-")]
            if not args:
                cwd = os.path.expanduser("~")
            elif args[0] != "-":  # `cd -` は追えないので据え置き
                cwd = resolve(args[0], cwd)
            continue
        if head != "git":
            continue
        subcommand, directory = git_target(tokens, cwd)
        if subcommand not in BLOCKED_SUBCOMMANDS:
            continue
        if current_branch(directory) == "main":
            return directory, subcommand
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    command = payload.get("tool_input", {}).get("command", "")
    if not command:
        return 0

    offender = find_offender(command, os.getcwd())
    if offender is None:
        return 0

    directory, subcommand = offender
    print(
        f"`{directory}` は main。main への直接 {subcommand} は禁止 "
        f"(CLAUDE.md「ブランチ戦略」)。\n"
        f"\n"
        f"feature branch を切ること:\n"
        f"  git -C {directory} switch -c <type>/<short-description>\n"
        f"\n"
        f"境界はサーバー側の protect-main ruleset で、このフックは事故を早く止める"
        f"二重化 (ADR-001)。",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
