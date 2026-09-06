import { describe, expect, it } from "vitest";
import type { Member } from "../api";
import { cookOptionsFor, formatCredit, mergeCookOptions, toggleCook } from "./meal-cooks";

const member = (userId: string, displayName: string): Member => ({
  userId,
  displayName,
  role: "member",
  joinedAt: "2026-09-01T00:00:00.000Z",
});

describe("cookOptionsFor", () => {
  it("自分が先頭、残りは表示名の順（作ったのが自分の回が一番多い）", () => {
    const options = cookOptionsFor(
      [member("u-mika", "みか"), member("u-me", "たろう"), member("u-hana", "はな")],
      "u-me",
    );
    // ひらがなは Unicode の並びが五十音の並びなので、素の比較で「はな」→「みか」になる
    expect(options.map((o) => o.displayName)).toEqual(["たろう", "はな", "みか"]);
  });

  it("同じ表示名は user id で並ぶ（並びが呼ぶたびに変わらない）", () => {
    const options = cookOptionsFor([member("u-b", "ゆき"), member("u-a", "ゆき")], "u-me");
    expect(options.map((o) => o.userId)).toEqual(["u-a", "u-b"]);
  });

  it("役割と参加日は札に要らない（user id と表示名だけ）", () => {
    expect(cookOptionsFor([member("u-a", "はな")], "u-me")).toEqual([
      { userId: "u-a", displayName: "はな" },
    ]);
  });
});

describe("mergeCookOptions", () => {
  const options = [{ userId: "u-me", displayName: "たろう" }];

  it("スペースを抜けた人も、その記録で作っていれば札に残る（保存で黙って消えない）", () => {
    expect(mergeCookOptions(options, [{ userId: "u-gone", displayName: "むかしの家族" }])).toEqual([
      { userId: "u-me", displayName: "たろう" },
      { userId: "u-gone", displayName: "むかしの家族" },
    ]);
  });

  it("いまのメンバーが作った記録では札は増えない", () => {
    expect(mergeCookOptions(options, [{ userId: "u-me", displayName: "たろう" }])).toEqual(options);
  });
});

describe("toggleCook", () => {
  it("選んでいなければ足し、選んでいれば外す", () => {
    expect(toggleCook([], "u-a")).toEqual(["u-a"]);
    expect(toggleCook(["u-a", "u-b"], "u-a")).toEqual(["u-b"]);
  });
});

describe("formatCredit", () => {
  const recorder = { userId: "u-me", displayName: "たろう" };

  it("作った人を記録していなければ、記録した人だけ", () => {
    expect(formatCredit([], recorder)).toBe("たろう が記録");
  });

  it("作った人が記録した人と同じなら 1 度だけ言う", () => {
    expect(formatCredit([{ userId: "u-me", displayName: "たろう" }], recorder)).toBe(
      "たろう が作って記録",
    );
  });

  it("同姓同名でも id で見分ける（別人が作ったなら 2 つの句になる）", () => {
    expect(formatCredit([{ userId: "u-other", displayName: "たろう" }], recorder)).toBe(
      "たろう が作った、たろう が記録",
    );
  });

  it("複数人が作ったら「・」でつなぎ、記録した人は「、」の後ろ", () => {
    expect(
      formatCredit(
        [
          { userId: "u-mika", displayName: "みか" },
          { userId: "u-me", displayName: "たろう" },
        ],
        recorder,
      ),
    ).toBe("みか・たろう が作った、たろう が記録");
  });
});
