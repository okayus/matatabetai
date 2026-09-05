// ホームの絞り込み（requirements 15、ADR-009 §4）。状態は URL のクエリが持ち、
// ここはその読み書きだけ。パラメータ名は一覧 API と同じ q / tags / mataTabetai
export type MealFilter = {
  // 料理名の部分一致。空は「絞らない」
  q: string;
  mataTabetai: boolean;
  // タグ AND（表示名。サーバーが正規化して比べる）
  tags: string[];
};

export const EMPTY_MEAL_FILTER: MealFilter = { q: "", mataTabetai: false, tags: [] };

// "?q=…&tags=a&tags=b&mataTabetai=1" → MealFilter。知らないパラメータは無視し、
// mataTabetai は "1" だけを真にする（API と同じ読み）
export function parseMealFilter(search: string): MealFilter {
  const params = new URLSearchParams(search);
  const tags: string[] = [];
  for (const raw of params.getAll("tags")) {
    const name = raw.trim();
    if (name !== "" && !tags.includes(name)) tags.push(name);
  }
  return {
    q: (params.get("q") ?? "").trim(),
    mataTabetai: params.get("mataTabetai") === "1",
    tags,
  };
}

// MealFilter → "?…"。何も絞っていなければ ""（URL は素の "/" に戻る）
export function mealFilterSearch(filter: MealFilter): string {
  const params = new URLSearchParams();
  if (filter.q !== "") params.set("q", filter.q);
  for (const name of filter.tags) params.append("tags", name);
  if (filter.mataTabetai) params.set("mataTabetai", "1");
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export function isEmptyMealFilter(filter: MealFilter): boolean {
  return filter.q === "" && !filter.mataTabetai && filter.tags.length === 0;
}

export function toggleFilterTag(filter: MealFilter, name: string): MealFilter {
  return {
    ...filter,
    tags: filter.tags.includes(name)
      ? filter.tags.filter((t) => t !== name)
      : [...filter.tags, name],
  };
}
