const dateTime = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}

const dayWithWeekday = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

// eaten_on は日付文字列 YYYY-MM-DD。UTC 経由にせず端末ローカルの日付として組み立てる
export function formatEatenOn(ymd: string): string {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return dayWithWeekday.format(new Date(y, m - 1, d));
}

const shortDay = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" });

// サジェストの札に載せる短い日付（8/28）。読み上げには formatEatenOn の全文を添える
export function formatShortDate(ymd: string): string {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return shortDay.format(new Date(y, m - 1, d));
}

// <input type="date"> の初期値（端末ローカル。家族は JST）
export function todayLocalDate(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const monthOnly = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" });

// 月プリセットの見出し（2026年9月）
export function formatMonth(ymd: string): string {
  const [y = 0, m = 1] = ymd.split("-").map(Number);
  return monthOnly.format(new Date(y, m - 1, 1));
}

const monthDayWithWeekday = new Intl.DateTimeFormat("ja-JP", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

// 週プリセットの見出し。年は先頭に 1 度だけ出し、年をまたぐ週のときだけ後ろにも添える
export function formatDateRange(from: string, to: string): string {
  const [ty = 0, tm = 1, td = 1] = to.split("-").map(Number);
  const tail =
    from.slice(0, 4) === to.slice(0, 4)
      ? monthDayWithWeekday.format(new Date(ty, tm - 1, td))
      : formatEatenOn(to);
  return `${formatEatenOn(from)}〜${tail}`;
}
