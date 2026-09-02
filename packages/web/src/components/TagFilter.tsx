import type { MealTag } from "../api";

// タグの AND 絞り込み。押した瞬間に一覧が変わる操作なので、checkbox ではなく
// 押下状態のボタンにする（ADR-005 §7）。語彙はどの画面でも GET /tags のよく使う順
export function TagFilter({
  tagList,
  selected,
  onToggle,
}: {
  tagList: MealTag[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  if (tagList.length === 0) return null;
  return (
    <details className="tag-filter">
      <summary>
        タグで絞り込む
        {selected.length > 0 && <span className="muted">（{selected.join("、")}）</span>}
      </summary>
      <fieldset className="chips">
        <legend className="visually-hidden">
          絞り込むタグ（選んだタグを全部持つ記録だけが並びます）
        </legend>
        {tagList.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            aria-pressed={selected.includes(t.name)}
            onClick={() => onToggle(t.name)}
          >
            {t.name}
          </button>
        ))}
      </fieldset>
    </details>
  );
}
