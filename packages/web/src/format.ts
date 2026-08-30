const dateTime = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });
const date = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}
