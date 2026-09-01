import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createMeal,
  createSpace,
  deleteMeal,
  describeFailure,
  listMeals,
  setMataTabetai,
  type CreateMealBody,
  type Me,
  type Meal,
  type MealType,
  type RecipeSource,
  type SpaceSummary,
} from "../api";
import { useAuth } from "../auth";
import { Link } from "../components/Link";
import { formatEatenOn, todayLocalDate } from "../format";

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "朝",
  lunch: "昼",
  dinner: "夜",
  snack: "間食",
};

export function HomePage({ me }: { me: Me }) {
  const ownsSpace = me.spaces.some((s) => s.role === "owner");
  // スペース切替 UI は当面持たない（requirements.md backlog）。自分のスペース優先で 1 つに決める
  const primary = me.spaces.find((s) => s.role === "owner") ?? me.spaces[0];
  return (
    <section className="stack">
      <h1>こんにちは、{me.displayName} さん</h1>
      {primary ? (
        <MealsSection key={primary.id} space={primary} />
      ) : (
        <p className="muted">まだどのスペースにも入っていません。</p>
      )}
      <SpacesSection spaces={me.spaces} />
      {!ownsSpace && <CreateSpaceForm />}
    </section>
  );
}

function MealsSection({ space }: { space: SpaceSummary }) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listMeals(space.id);
    if (r.isOk()) setMeals(r.value);
    else setError(describeFailure(r.error));
  }, [space.id]);
  useEffect(() => {
    void load();
  }, [load]);

  // eaten_on DESC, created_at DESC のサーバー順を、手元の挿入でも保つ
  const insert = (m: Meal) =>
    setMeals((prev) =>
      [m, ...(prev ?? [])].sort(
        (a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.createdAt.localeCompare(a.createdAt),
      ),
    );
  const toggle = async (m: Meal) => {
    setError(null);
    const r = await setMataTabetai(space.id, m.id, !m.mataTabetai);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setMeals((prev) =>
      (prev ?? []).map((x) =>
        x.id === m.id ? { ...x, mataTabetai: r.value.mataTabetai, updatedAt: r.value.updatedAt } : x,
      ),
    );
  };
  const remove = async (m: Meal) => {
    if (!confirm(`「${m.name}」を削除しますか？`)) return;
    setError(null);
    const r = await deleteMeal(space.id, m.id);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    setMeals((prev) => (prev ?? []).filter((x) => x.id !== m.id));
  };

  return (
    <>
      <MealForm spaceId={space.id} onCreated={insert} />
      <div className="card stack">
        <h2>みんなの記録</h2>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {meals === null ? (
          <p className="muted">読み込み中…</p>
        ) : meals.length === 0 ? (
          <p className="muted">まだ記録がありません。最初のたべたものを記録してみましょう。</p>
        ) : (
          groupByEatenOn(meals).map(([date, items]) => (
            <div key={date} className="stack stack--tight">
              <h3 className="muted">{formatEatenOn(date)}</h3>
              {/* list-style を消した ul は Safari が list 扱いしなくなるので role を戻す */}
              <ul className="list" role="list">
                {items.map((m) => (
                  <MealItem key={m.id} meal={m} onToggle={toggle} onRemove={remove} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// meals は eaten_on DESC で並んでいるので、連続する同じ日をまとめるだけでよい
function groupByEatenOn(meals: Meal[]): [string, Meal[]][] {
  const groups: [string, Meal[]][] = [];
  for (const m of meals) {
    const last = groups[groups.length - 1];
    if (last && last[0] === m.eatenOn) last[1].push(m);
    else groups.push([m.eatenOn, [m]]);
  }
  return groups;
}

function MealForm({ spaceId, onCreated }: { spaceId: string; onCreated: (m: Meal) => void }) {
  const [sourceKind, setSourceKind] = useState<RecipeSource["type"]>("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const recipeSource: RecipeSource =
      sourceKind === "url"
        ? { type: "url", url: text("url") }
        : sourceKind === "text"
          ? { type: "text", text: text("recipeText") }
          : { type: "none" };
    const body: CreateMealBody = {
      name: text("name"),
      eatenOn: text("eatenOn"),
      mealType: (text("mealType") || null) as MealType | null,
      recipeSource,
      note: text("note") || null,
      tags: text("tags")
        .split(/[、,\s]+/u)
        .filter(Boolean),
    };
    setBusy(true);
    setError(null);
    const r = await createMeal(spaceId, body);
    setBusy(false);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      return;
    }
    onCreated(r.value);
    form.reset();
    setSourceKind("none");
  };

  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>たべたものを記録</h2>
      <div className="field">
        <label htmlFor="mealName">料理名</label>
        <input id="mealName" name="name" required maxLength={100} placeholder="例: 肉じゃが" />
      </div>
      <div className="row">
        <div className="field field--grow">
          <label htmlFor="mealEatenOn">食べた日</label>
          <input id="mealEatenOn" name="eatenOn" type="date" required defaultValue={todayLocalDate()} />
        </div>
        <div className="field field--grow">
          <label htmlFor="mealType">タイミング</label>
          <select id="mealType" name="mealType" defaultValue="">
            <option value="">指定なし</option>
            <option value="breakfast">朝</option>
            <option value="lunch">昼</option>
            <option value="dinner">夜</option>
            <option value="snack">間食</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="mealTags">タグ</label>
        <span id="mealTagsHint" className="hint">
          食材などをスペースや読点で区切って（例: じゃがいも 玉ねぎ）
        </span>
        <input id="mealTags" name="tags" aria-describedby="mealTagsHint" />
      </div>
      <div className="field">
        <label htmlFor="mealSourceKind">レシピ・リンク</label>
        <select
          id="mealSourceKind"
          value={sourceKind}
          onChange={(e) => setSourceKind(e.currentTarget.value as RecipeSource["type"])}
        >
          <option value="none">なし</option>
          <option value="url">リンクを載せる（レシピ・お店・商品）</option>
          <option value="text">自分でレシピを書く</option>
        </select>
      </div>
      {sourceKind === "url" && (
        <div className="field">
          <label htmlFor="mealUrl">リンク（URL）</label>
          <input id="mealUrl" name="url" type="url" required placeholder="https://…" maxLength={2048} />
        </div>
      )}
      {sourceKind === "text" && (
        <div className="field">
          <label htmlFor="mealRecipeText">レシピ</label>
          <textarea id="mealRecipeText" name="recipeText" required rows={4} maxLength={5000} />
        </div>
      )}
      <div className="field">
        <label htmlFor="mealNote">メモ</label>
        <textarea id="mealNote" name="note" rows={2} maxLength={1000} placeholder="例: 子どもがおかわりした" />
      </div>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        記録する
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function MealItem({
  meal,
  onToggle,
  onRemove,
}: {
  meal: Meal;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
}) {
  return (
    <li className="list-item list-item--column">
      <div className="row">
        <strong>{meal.name}</strong>
        {meal.mealType && <span className="badge">{MEAL_TYPE_LABEL[meal.mealType]}</span>}
      </div>
      {meal.tags.length > 0 && (
        <div className="row">
          {meal.tags.map((t) => (
            <span key={t.id} className="badge">
              {t.name}
            </span>
          ))}
        </div>
      )}
      {meal.recipeSource.type === "url" && (
        <a href={meal.recipeSource.url} target="_blank" rel="noreferrer">
          {linkLabel(meal.recipeSource.url)}
        </a>
      )}
      {meal.recipeSource.type === "text" && (
        <details>
          <summary>レシピ</summary>
          <p className="pre-wrap">{meal.recipeSource.text}</p>
        </details>
      )}
      {meal.note && <p className="muted pre-wrap">{meal.note}</p>}
      <div className="row row--between">
        <span className="muted">{meal.createdByName} が記録</span>
        <div className="row">
          <button
            type="button"
            className="btn btn--small"
            aria-pressed={meal.mataTabetai}
            onClick={() => onToggle(meal)}
          >
            <span aria-hidden="true">{meal.mataTabetai ? "♥" : "♡"}</span> またたべたい
            <span className="visually-hidden">（{meal.name}）</span>
          </button>
          <button type="button" className="btn btn--danger btn--small" onClick={() => onRemove(meal)}>
            削除<span className="visually-hidden">（{meal.name}）</span>
          </button>
        </div>
      </div>
    </li>
  );
}

// リンクはドメイン名で示す（URL 全文はモバイルで長すぎる）
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "リンク";
  }
}

function SpacesSection({ spaces }: { spaces: SpaceSummary[] }) {
  if (spaces.length === 0) return null;
  return (
    <div className="card stack">
      <h2>スペース</h2>
      <ul className="list" role="list">
        {spaces.map((s) => (
          <li key={s.id} className="list-item">
            <div className="stack stack--tight">
              <strong>{s.name}</strong>
              <span className="muted">
                <span className="badge">{s.role === "owner" ? "オーナー" : "メンバー"}</span> {s.memberCount} 人
              </span>
            </div>
            <Link href={`/spaces/${s.id}/settings`} className="btn btn--ghost">
              設定
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateSpaceForm() {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    setBusy(true);
    setError(null);
    const r = await createSpace(name);
    if (r.isErr()) {
      setError(describeFailure(r.error));
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  };
  return (
    <form className="card stack" onSubmit={(e) => void onSubmit(e)}>
      <h2>自分のスペースを作る</h2>
      <p className="muted">作れるのは 1 つだけです。家族を招待して一緒に記録できます。</p>
      <div className="field">
        <label htmlFor="spaceName">スペースの名前</label>
        <input id="spaceName" name="name" required maxLength={40} placeholder="例: わが家の食卓" />
      </div>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        作る
      </button>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </form>
  );
}
