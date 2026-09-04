import type { ReactNode } from "react";
import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealFormState } from "../lib/meal-form";

// 記録する / 編集する で同じ欄を出す（ADR-008 §7）。写真は作成と編集で扱いが違う
// （作成は送信まで手元に貯める / 編集は既にある投稿にその場で足し引き）ので、
// afterName と photos は差し込み口にして、欄そのものだけをここが持つ。
// id は idPrefix で分ける — 同じページに 2 つ出るので、label の htmlFor が衝突すると
// 別のフォームの入力を指してしまう
export function MealFields({
  idPrefix,
  form,
  onChange,
  afterName,
  photos,
}: {
  idPrefix: string;
  form: MealFormState;
  onChange: <K extends keyof MealFormState>(key: K, value: MealFormState[K]) => void;
  afterName?: ReactNode;
  photos?: ReactNode;
}) {
  const id = (suffix: string) => `${idPrefix}${suffix}`;
  return (
    <>
      <div className="field">
        <label htmlFor={id("Name")}>料理名</label>
        <input
          id={id("Name")}
          name="name"
          required
          maxLength={100}
          placeholder="例: 肉じゃが"
          value={form.name}
          onChange={(e) => onChange("name", e.currentTarget.value)}
        />
      </div>
      {afterName}
      <div className="row">
        <div className="field field--grow">
          <label htmlFor={id("EatenOn")}>食べた日</label>
          <input
            id={id("EatenOn")}
            name="eatenOn"
            type="date"
            required
            value={form.eatenOn}
            onChange={(e) => onChange("eatenOn", e.currentTarget.value)}
          />
        </div>
        <div className="field field--grow">
          <label htmlFor={id("Type")}>タイミング</label>
          <select
            id={id("Type")}
            name="mealType"
            value={form.mealType}
            onChange={(e) => onChange("mealType", e.currentTarget.value)}
          >
            <option value="">指定なし</option>
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEAL_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={id("Tags")}>タグ</label>
        <span id={id("TagsHint")} className="hint">
          食材などをスペースや読点で区切って（例: じゃがいも 玉ねぎ）
        </span>
        <input
          id={id("Tags")}
          name="tags"
          aria-describedby={id("TagsHint")}
          value={form.tags}
          onChange={(e) => onChange("tags", e.currentTarget.value)}
        />
      </div>
      {photos}
      {/* 3 つは排他ではない（ADR-007 §1）。関連する入力のまとまりなので fieldset + legend */}
      <fieldset className="fieldgroup" aria-describedby={id("LinksHint")}>
        <legend>レシピ・リンク</legend>
        <p id={id("LinksHint")} className="hint">
          どれも任意です。レシピを見ながら自分のアレンジも一緒に残せます
        </p>
        <div className="stack">
          <div className="field">
            <label htmlFor={id("RecipeUrl")}>レシピ URL</label>
            <input
              id={id("RecipeUrl")}
              name="recipeUrl"
              type="url"
              placeholder="https://…"
              maxLength={2048}
              value={form.recipeUrl}
              onChange={(e) => onChange("recipeUrl", e.currentTarget.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={id("ShopUrl")}>お店・商品 URL</label>
            <input
              id={id("ShopUrl")}
              name="shopUrl"
              type="url"
              placeholder="https://…"
              maxLength={2048}
              value={form.shopUrl}
              onChange={(e) => onChange("shopUrl", e.currentTarget.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={id("RecipeMemo")}>作り方メモ</label>
            <textarea
              id={id("RecipeMemo")}
              name="recipeMemo"
              rows={4}
              maxLength={5000}
              placeholder="例: みりんを少し多めに"
              value={form.recipeMemo}
              onChange={(e) => onChange("recipeMemo", e.currentTarget.value)}
            />
          </div>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={id("Note")}>ひとことメモ</label>
        <textarea
          id={id("Note")}
          name="note"
          rows={2}
          maxLength={1000}
          placeholder="例: 子どもがおかわりした"
          value={form.note}
          onChange={(e) => onChange("note", e.currentTarget.value)}
        />
      </div>
    </>
  );
}
