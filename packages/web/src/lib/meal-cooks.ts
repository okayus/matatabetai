import type { MealCook, Member } from "../api";

// 作った人（requirements 17、ADR-012）。札の並び・選び方と、一覧・詳細に出す 1 行。
// 「誰が作ったか」と「誰が記録したか」は別物なので、両方を 1 行に畳むのはここだけの仕事

// 札の並びは 自分 → 表示名の順。自分を先頭にするのは、作ったのが自分の回が一番多いから。
// 表示名の比較は素の < / >（localeCompare ではない）— サーバーが cooks を返す並び
// （SQLite の BINARY 照合）と揃える
export function cookOptionsFor(members: readonly Member[], meId: string): MealCook[] {
  return members
    .map(({ userId, displayName }) => ({ userId, displayName }))
    .sort((a, b) => {
      if (a.userId === meId) return -1;
      if (b.userId === meId) return 1;
      if (a.displayName !== b.displayName) return a.displayName < b.displayName ? -1 : 1;
      return a.userId < b.userId ? -1 : 1;
    });
}

// 編集の札は「いまのメンバー + その記録で作った人」。スペースを抜けた人が選ばれたまま見え、
// 残すのも外すのも選べる（保存で黙って消えない — ADR-012 §4）
export function mergeCookOptions(
  options: readonly MealCook[],
  cooks: readonly MealCook[],
): MealCook[] {
  const known = new Set(options.map((o) => o.userId));
  return [...options, ...cooks.filter((c) => !known.has(c.userId))];
}

// 札のトグル。選んだ順は持たない（並びは札の並び = サーバーが返す並び）
export function toggleCook(selected: readonly string[], userId: string): string[] {
  return selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId];
}

// 記録の下に出す 1 行。作った人を先に読ませ、記録した人は後ろに置く（誰が作ったかが主役で、
// 記録した人は監査の情報 — ADR-008 §2）。名前をつなぐ「・」と句を切る「、」は使い分ける。
// 作った人が記録した人と同じ 1 人なら 1 度だけ言う（同姓同名でも取り違えないよう id で比べる）
export function formatCredit(cooks: readonly MealCook[], recorder: MealCook): string {
  if (cooks.length === 0) return `${recorder.displayName} が記録`;
  const names = cooks.map((c) => c.displayName).join("・");
  if (cooks.length === 1 && cooks[0]?.userId === recorder.userId) return `${names} が作って記録`;
  return `${names} が作った、${recorder.displayName} が記録`;
}
