// サーバーの並び（eaten_on DESC, created_at DESC）を、手元の挿入・編集のあとでも保つ。
// 編集で食べた日が変わると行は別の日付見出しの下へ移る（ADR-008 §7）
export function sortByRecency<T extends { eatenOn: string; createdAt: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.createdAt.localeCompare(a.createdAt),
  );
}
