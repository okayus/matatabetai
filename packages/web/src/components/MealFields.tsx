import type { ReactNode } from "react";
import type { MealCook } from "../api";
import { toggleCook } from "../lib/meal-cooks";
import {
  MAX_LINKS_PER_MEAL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  addUrlRow,
  removeUrlRow,
  setUrlRow,
  urlFieldLabel,
  urlRows,
  type MealFormState,
} from "../lib/meal-form";

// 記録する / 編集する で同じ欄を出す（ADR-008 §7）。写真は作成と編集で扱いが違う
// （作成は送信まで手元に貯める / 編集は既にある投稿にその場で足し引き）ので、
// afterName と photos は差し込み口にして、欄そのものだけをここが持つ。
// id は idPrefix で分ける — 同じページに 2 つ出るので、label の htmlFor が衝突すると
// 別のフォームの入力を指してしまう
export function MealFields({
  idPrefix,
  form,
  cookOptions,
  onChange,
  afterName,
  photos,
}: {
  idPrefix: string;
  form: MealFormState;
  // 作った人の札に出す人（スペースのメンバー + 編集ならその記録で作った人 — ADR-012 §4）
  cookOptions: MealCook[];
  onChange: <K extends keyof MealFormState>(key: K, value: MealFormState[K]) => void;
  afterName?: ReactNode;
  photos?: ReactNode;
}) {
  const id = (suffix: string) => `${idPrefix}${suffix}`;
  // 上限は kind ごとではなく合計（ADR-010 §2）なので、行数は両方を足して数える
  const total = urlRows(form.recipeUrls).length + urlRows(form.shopUrls).length;
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
      <CookPicker
        id={id("Cooks")}
        options={cookOptions}
        selected={form.cookUserIds}
        onChange={(next) => onChange("cookUserIds", next)}
      />
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
          どれも任意です。レシピを見ながら自分のアレンジも一緒に残せます（URL は合わせて{" "}
          {MAX_LINKS_PER_MEAL} 本まで）
        </p>
        <div className="stack">
          <UrlFields
            id={id("RecipeUrl")}
            name="recipeUrl"
            label="レシピ URL"
            urls={form.recipeUrls}
            total={total}
            onChange={(next) => onChange("recipeUrls", next)}
          />
          <UrlFields
            id={id("ShopUrl")}
            name="shopUrl"
            label="お店・商品 URL"
            urls={form.shopUrls}
            total={total}
            onChange={(next) => onChange("shopUrls", next)}
          />
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

// 作った人（requirements 17、ADR-012 §6）。スペースのメンバーの札を押して選ぶ（複数可）。
// 初期値は「誰も選ばれていない」= 作った人は記録しない — 自分を先に押しておくと、外食や
// 家族が作った回で外し忘れたぶんが「自分が作った」として残る（ADR-012 §6）。
// 見出しは <label> ではなく group の名前（中の入力が 1 つではない — UrlFields と同じ形）
function CookPicker({
  id,
  options,
  selected,
  onChange,
}: {
  id: string;
  options: MealCook[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  // メンバーを読めていない間は出さない（空の見出しだけが残らないように）
  if (options.length === 0) return null;
  return (
    <div className="field" role="group" aria-labelledby={`${id}Label`} aria-describedby={`${id}Hint`}>
      <span id={`${id}Label`} className="field__label">
        作った人
      </span>
      <span id={`${id}Hint`} className="hint">
        任意です。作った人を押してください（複数えらべます）
      </span>
      <div className="chips">
        {options.map((cook) => (
          <button
            key={cook.userId}
            type="button"
            className="chip"
            aria-pressed={selected.includes(cook.userId)}
            onClick={() => onChange(toggleCook(selected, cook.userId))}
          >
            {cook.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

// 同じ種類の URL を何本でも貼れる欄（ADR-010 §6）。行は常に 1 つ以上あり、2 行以上のときだけ
// 「外す」が出る（1 行しかないときの「外す」は空にするのと同じで、意味が無い）。
// 見出しは <label> ではなく group の名前 — 中の入力が 1 つとは限らないので、
// 各行の読み上げ名は aria-label が持つ（1 行なら番号なし）
function UrlFields({
  id,
  name,
  label,
  urls,
  total,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  urls: string[];
  // レシピとお店・商品を合わせた行数。上限は合計で数える（ADR-010 §2）
  total: number;
  onChange: (next: string[]) => void;
}) {
  const rows = urlRows(urls);
  return (
    <div className="field" role="group" aria-labelledby={`${id}Label`}>
      <span id={`${id}Label`} className="field__label">
        {label}
      </span>
      {rows.map((url, i) => (
        // key は行番号。値は制御されているので、行を抜いても前の行の値が残ることはない
        <div className="row row--nowrap" key={i}>
          <input
            id={i === 0 ? id : `${id}${i}`}
            name={name}
            type="url"
            className="field--grow"
            placeholder="https://…"
            maxLength={2048}
            aria-label={urlFieldLabel(label, i, rows.length)}
            value={url}
            onChange={(e) => onChange(setUrlRow(rows, i, e.currentTarget.value))}
          />
          {rows.length > 1 && (
            <button
              type="button"
              className="btn btn--small"
              aria-label={`${urlFieldLabel(label, i, rows.length)} を外す`}
              onClick={() => onChange(removeUrlRow(rows, i))}
            >
              外す
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn--small btn--ghost field__add"
        // 上限に達したら押せない（送ってから断られるより、押せない方が分かる）
        disabled={total >= MAX_LINKS_PER_MEAL}
        onClick={() => onChange(addUrlRow(rows))}
      >
        ＋ {label} を追加
      </button>
    </div>
  );
}
