#!/usr/bin/env python3
"""guard-pr-merge.sh の判定表。`python3 .claude/hooks/__tests__/test-guard-pr-merge.py` で実行。

mazuoboeru の同じ hook の試験（48 通り + jq なし 2 通り）を、このリポの名前とパスに移したもの。
gh は PATH の先頭に置いた偽物に差し替え、`gh pr view <PR> -R <repo> --json …` に下の FIXTURES を返す
（ネットワークにも GitHub にも出ない）。bookmark の日時は実行時に作るので、日が経っても判定が変わらない。
CI は回さない（ほかの hook のテストと同じく手動）。
"""

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

HOOK = os.path.join(os.path.dirname(__file__), "..", "guard-pr-merge.sh")

BLOCK = 2
PASS = 0

REPO = "okayus/matatabetai"
M = "gh pr merge"

FAKE_GH = """#!/usr/bin/env bash
[ "$1" = pr ] && [ "$2" = view ] || exit 1
f="$FAKE_GH_FIXTURES/$3.json"
[ -f "$f" ] || { echo "no such PR" >&2; exit 1; }
cat "$f"
"""

BOOKMARK_ID = "00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683"


def iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%dT%H:%M:%SZ")


def pr(
    paths: list[str],
    comments: list[tuple[str, timedelta]] = (),
    changed: int | None = None,
    state: str = "",
) -> dict:
    return {
        "files": [{"path": p} for p in paths],
        "changedFiles": len(paths) if changed is None else changed,
        "comments": [{"body": body, "createdAt": iso(age)} for body, age in comments],
        "mergeStateStatus": state,
    }


BOOKMARK = f"**D1 Time Travel bookmark (taken before merge)**\n\n- database: `matatabetai`\n- bookmark: `{BOOKMARK_ID}`"
MIGRATION = "packages/web/drizzle/0008_kokemusu_posts.sql"

FIXTURES = {
    "106": pr(["packages/web/worker/cron.ts", "CLAUDE.md"]),
    "84": pr([MIGRATION, "docs/adr/015-x.md"]),
    "200": pr([MIGRATION], [(BOOKMARK, timedelta(hours=1))]),  # 24 時間以内の bookmark
    "201": pr([MIGRATION], [(BOOKMARK, timedelta(days=2))]),  # 古い bookmark
    "202": pr([MIGRATION], [("merge 前に D1 Time Travel bookmark を取ってください", timedelta(minutes=5))]),
    "203": pr([f"packages/web/src/f{i}.ts" for i in range(100)], changed=150),  # 一覧が途中で切れている
    "204": pr(["docs/status.md"]),
    # --auto なしの squash を通すかは mergeStateStatus で決まる（コンテナの gh 2.23 が clean な PR への --auto を弾く）
    "300": pr(["docs/status.md"], state="CLEAN"),
    "301": pr(["docs/status.md"], state="BLOCKED"),
    "302": pr([MIGRATION], state="CLEAN"),
    "303": pr([MIGRATION], [(BOOKMARK, timedelta(hours=1))], state="CLEAN"),
}

HEREDOC_MERGE = f"git commit -m \"$(cat <<'EOF'\ndocs: merge の形\n\n{M} 106 --squash は使わない\nEOF\n)\""
HEREDOC_THEN_MERGE = f"git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\" && {M} 106"

CASES: list[tuple[int, str]] = [
    (PASS, "ls -la"),
    (PASS, "gh pr view 106"),
    (PASS, f"{M} --auto --squash 106"),
    (PASS, f"{M} 106 --auto --squash"),
    (PASS, f"{M} --auto -s 106"),
    (BLOCK, f"{M} 106 --squash"),
    (BLOCK, f"{M} --squash 106"),
    (BLOCK, f"{M} --auto --squash --admin 106"),
    (BLOCK, f"{M} --auto --merge 106"),
    (BLOCK, f"{M} --auto --squash 84"),
    (BLOCK, f"{M} --auto --squash 84;"),
    (PASS, f"{M} --auto --squash 200"),
    (BLOCK, f"{M} --auto --squash 201"),
    (BLOCK, f"{M} --auto --squash 202"),
    (BLOCK, f"{M} --auto --squash 203"),
    (PASS, f"{M} --auto --squash 204"),
    (BLOCK, f"{M} --auto --squash 999"),
    (BLOCK, f"{M} --auto --squash"),
    (BLOCK, f"{M} --auto --squash 106 && {M} --auto --squash 204"),
    (PASS, f"cd /workspace && {M} --auto --squash 106"),
    (PASS, f"{M} --auto --squash 106 | cat"),
    (PASS, f"{M} --auto --squash https://github.com/{REPO}/pull/106"),
    (BLOCK, f"{M} --auto --squash https://github.com/{REPO}/pull/84"),
    (BLOCK, f"{M} --auto --squash https://github.com/okayus/kokemusu/pull/71"),
    (PASS, f"{M} --auto --squash 106 -R {REPO}"),
    (BLOCK, f"{M} --auto --squash -R {REPO} 84"),
    (BLOCK, f"{M} --auto --squash 106 --repo okayus/kokemusu"),
    (BLOCK, f"{M} --auto --squash 106 --repo=okayus/kokemusu"),
    (PASS, f"{M} --disable-auto 106"),
    (BLOCK, f'{M} --auto --squash --subject "fix 2 bugs" 106'),
    (PASS, f'{M} --auto --squash 106 --body "see #84"'),
    (PASS, HEREDOC_MERGE),
    (BLOCK, HEREDOC_THEN_MERGE),
    (PASS, f'git commit -m "docs: {M} 106 --admin は使わない"'),
    (PASS, f'echo "use {M} --admin 106"'),
    (BLOCK, f'bash -c "{M} 106"'),
    (PASS, f"GH_PROMPT_DISABLED=1 {M} --auto --squash 106"),
    (BLOCK, f"timeout 30 {M} --auto --squash 84"),
    (BLOCK, f"/usr/bin/{M} 106"),
    (BLOCK, f"git fetch\n{M} 106"),
    (PASS, '{"tool_name":"Read"}'),
    # --auto なしの squash は clean な PR だけ
    (PASS, f"{M} --squash 300"),
    (PASS, f"{M} -s 300"),
    (BLOCK, f"{M} 300"),
    (BLOCK, f"{M} --squash 301"),
    (BLOCK, f"{M} --squash 302"),
    (PASS, f"{M} --squash 303"),
    (BLOCK, f"{M} --squash --admin 300"),
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
    with tempfile.TemporaryDirectory() as tmp:
        fake_bin = os.path.join(tmp, "fake-bin")
        fixtures = os.path.join(tmp, "fixtures")
        os.makedirs(fake_bin)
        os.makedirs(fixtures)
        with open(os.path.join(fake_bin, "gh"), "w") as f:
            f.write(FAKE_GH)
        os.chmod(os.path.join(fake_bin, "gh"), 0o755)
        for number, body in FIXTURES.items():
            with open(os.path.join(fixtures, f"{number}.json"), "w") as f:
                json.dump(body, f)
        env = {"PATH": f"{fake_bin}:{os.environ.get('PATH', '')}", "FAKE_GH_FIXTURES": fixtures}

        failed = 0
        for expected, command in CASES:
            failed += not report(expected, run(command, env), command)

        # jq が無ければ、命令が gh pr merge のときだけ止める。bash と coreutils だけの PATH を作る
        bare = os.path.join(tmp, "bare-bin")
        os.makedirs(bare)
        for tool in ("bash", "cat", "date", "env"):
            found = subprocess.run(["which", tool], capture_output=True, text=True).stdout.strip()
            os.symlink(found, os.path.join(bare, tool))
        no_jq = {"PATH": f"{fake_bin}:{bare}", "FAKE_GH_FIXTURES": fixtures}
        failed += not report(BLOCK, run(f"{M} --auto --squash 106", no_jq), "jq なしで merge")
        failed += not report(PASS, run("ls -la", no_jq), "jq なしで ls")

        total = len(CASES) + 2
        print(f"\n{total - failed}/{total} passed")
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
