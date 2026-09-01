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

// <input type="date"> の初期値（端末ローカル。家族は JST）
export function todayLocalDate(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
