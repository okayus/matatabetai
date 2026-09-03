// ふりかえりの集計期間。ユーザーが選んだのは「今週」「先々月」「日付を指定」であって
// from / to そのものではないので、選択を DU で持って範囲は毎回導出する（表示の呼び名も
// ここから決まる）。offset は 0 が「いま」で負が過去 — 記録は過去にしかないので未来へは進めない
export type StatsPeriod =
  | { unit: "all" }
  | { unit: "week"; offset: number }
  | { unit: "month"; offset: number }
  | { unit: "custom"; from: string; to: string };

// GET /meals/stats?from&to にそのまま渡す形。省略は「端を切らない」の意味
export type DateRange = { from?: string | undefined; to?: string | undefined };

export type StepUnit = "week" | "month";

// 週の始まりは日曜。日本のカレンダーに合わせる（Intl の weekInfo は当てにしない）
const WEEK_START_DAY = 0;

// YYYY-MM-DD は端末ローカルの日付として組み立てる。UTC を経由すると JST で 1 日ずれる（format.ts と同じ流儀）
function localDate(ymd: string): Date {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// 日・月の加減算は Date のコンストラクタに任せる（範囲外の値は繰り上がる）ので、
// 月末・年またぎ・閏日を自前で数えない
export function periodRange(period: StatsPeriod, today: string): DateRange {
  switch (period.unit) {
    case "all":
      return {};
    case "week": {
      const base = localDate(today);
      const back = (base.getDay() - WEEK_START_DAY + 7) % 7;
      const start = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate() - back + period.offset * 7,
      );
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { from: toYmd(start), to: toYmd(end) };
    }
    case "month": {
      const base = localDate(today);
      const start = new Date(base.getFullYear(), base.getMonth() + period.offset, 1);
      // 翌月の 0 日 = その月の末日
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      return { from: toYmd(start), to: toYmd(end) };
    }
    case "custom":
      // 空欄は「その端を切らない」。両端とも空なら全期間で、"ぜんぶ" と同じ問い合わせになる
      return {
        ...(period.from === "" ? {} : { from: period.from }),
        ...(period.to === "" ? {} : { to: period.to }),
      };
  }
}

// ← → で 1 期間ずつ動かす。プリセット以外（ぜんぶ / 日付を指定）にステッパーは出ない
export function stepPeriod(period: StatsPeriod, delta: number): StatsPeriod {
  if (period.unit !== "week" && period.unit !== "month") return period;
  return { ...period, offset: Math.min(0, period.offset + delta) };
}

export function canStepForward(period: StatsPeriod): boolean {
  return (period.unit === "week" || period.unit === "month") && period.offset < 0;
}

export function stepUnitOf(period: StatsPeriod): StepUnit | null {
  return period.unit === "week" || period.unit === "month" ? period.unit : null;
}

export function stepUnitName(unit: StepUnit): string {
  return unit === "week" ? "週" : "月";
}

// いまから見てどこかの呼び名。何回か遡ったあと「どこを見ているか」を言えるようにする
export function periodName(period: StatsPeriod): string {
  switch (period.unit) {
    case "all":
      return "ぜんぶの記録";
    case "custom":
      return "指定した期間";
    case "week":
      if (period.offset === 0) return "今週";
      if (period.offset === -1) return "先週";
      return `${-period.offset} 週間前`;
    case "month":
      if (period.offset === 0) return "今月";
      if (period.offset === -1) return "先月";
      return `${-period.offset} か月前`;
  }
}

// 日付を直接いじる形のときだけ、入力の逆転を UI で止める（サーバーも 400 で弾く）
export function isInvertedRange(period: StatsPeriod): boolean {
  return (
    period.unit === "custom" && period.from !== "" && period.to !== "" && period.to < period.from
  );
}
