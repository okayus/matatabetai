import { useEffect, useRef, useState } from "react";
import {
  deleteMeal,
  deleteMealPhoto,
  describeFailure,
  linkPreviewImageUrl,
  mealPhotoUrl,
  setMataTabetai,
  type LinkPreviewKind,
  type Meal,
  type MealPhoto,
} from "../api";
import { formatEatenOn } from "../format";
import { MEAL_TYPE_LABEL } from "../lib/meal-form";

// みんなの記録とふりかえりで共通の一覧。日付見出しでまとめ、またたべたいトグル・削除・
// 写真の拡大（<dialog>）までここが持つ。読み込み・並び・空表示は親の責務。
// またたべたい絞り込み中に ♥ を外しても行は消さない（誤タップを戻せる。次の読み込みで消える）
export function MealList({
  spaceId,
  meals,
  onMealsChange,
  onRecordsChanged,
  onError,
}: {
  spaceId: string;
  meals: Meal[];
  // 楽観更新の書き戻し。一覧の配列は親が持つ
  onMealsChange: (update: (prev: Meal[]) => Meal[]) => void;
  // 記録の増減（削除・写真削除）。ホームはサジェストの再読込に使う
  onRecordsChanged?: (() => void) | undefined;
  onError: (message: string | null) => void;
}) {
  const [lightbox, setLightbox] = useState<{ meal: Meal; photo: MealPhoto } | null>(null);

  const toggle = async (m: Meal) => {
    onError(null);
    const r = await setMataTabetai(spaceId, m.id, !m.mataTabetai);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onMealsChange((prev) =>
      prev.map((x) =>
        x.id === m.id ? { ...x, mataTabetai: r.value.mataTabetai, updatedAt: r.value.updatedAt } : x,
      ),
    );
  };
  const remove = async (m: Meal) => {
    if (!confirm(`「${m.name}」を削除しますか？`)) return;
    onError(null);
    const r = await deleteMeal(spaceId, m.id);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onMealsChange((prev) => prev.filter((x) => x.id !== m.id));
    onRecordsChanged?.();
  };
  const removePhoto = async (sel: { meal: Meal; photo: MealPhoto }) => {
    if (!confirm("この写真を削除しますか？")) return;
    onError(null);
    const r = await deleteMealPhoto(spaceId, sel.meal.id, sel.photo.id);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onMealsChange((prev) =>
      prev.map((x) =>
        x.id === sel.meal.id
          ? { ...x, photos: x.photos.filter((p) => p.id !== sel.photo.id) }
          : x,
      ),
    );
    setLightbox(null);
    onRecordsChanged?.();
  };

  return (
    <>
      {groupByEatenOn(meals).map(([date, items]) => (
        <div key={date} className="stack stack--tight">
          <h3 className="muted">{formatEatenOn(date)}</h3>
          {/* list-style を消した ul は Safari が list 扱いしなくなるので role を戻す */}
          <ul className="list" role="list">
            {items.map((m) => (
              <MealItem
                key={m.id}
                spaceId={spaceId}
                meal={m}
                onToggle={toggle}
                onRemove={remove}
                onOpenPhoto={(meal, photo) => setLightbox({ meal, photo })}
              />
            ))}
          </ul>
        </div>
      ))}
      <PhotoLightbox
        spaceId={spaceId}
        selected={lightbox}
        onClose={() => setLightbox(null)}
        onDelete={removePhoto}
      />
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

function MealItem({
  spaceId,
  meal,
  onToggle,
  onRemove,
  onOpenPhoto,
}: {
  spaceId: string;
  meal: Meal;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
  onOpenPhoto: (meal: Meal, photo: MealPhoto) => void;
}) {
  return (
    <li className="list-item list-item--column">
      <div className="row">
        <strong>{meal.name}</strong>
        {meal.mealType && <span className="badge">{MEAL_TYPE_LABEL[meal.mealType]}</span>}
      </div>
      {meal.photos.length > 0 && (
        <ul className="photo-strip" role="list">
          {meal.photos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="photo-thumb"
                onClick={() => onOpenPhoto(meal, p)}
              >
                <img
                  src={mealPhotoUrl(spaceId, meal.id, p.id, p.hasThumb ? "thumb" : undefined)}
                  alt={`${meal.name} の写真 ${i + 1} を拡大`}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {meal.tags.length > 0 && (
        <div className="row">
          {meal.tags.map((t) => (
            <span key={t.id} className="badge">
              {t.name}
            </span>
          ))}
        </div>
      )}
      <MealLinkList spaceId={spaceId} meal={meal} />
      {meal.recipeMemo && (
        <details>
          <summary>作り方メモ</summary>
          <p className="pre-wrap">{meal.recipeMemo}</p>
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

// 欄の並びと見出しはフォームと同じ（レシピ → お店・商品）
const LINK_KINDS = [
  { kind: "recipe", label: "レシピ", urlOf: (m: Meal) => m.recipeUrl },
  { kind: "shop", label: "お店・商品", urlOf: (m: Meal) => m.shopUrl },
] as const satisfies readonly {
  kind: LinkPreviewKind;
  label: string;
  urlOf: (m: Meal) => string | null;
}[];

// URL は常にリンクとして働き、投稿時のスナップショットが取れていた（ok）ときだけ
// その上にカードを重ねる。取得中・失敗・行なしは同じ見え方なので、取得が途中で死んでも
// 表示は壊れない（ADR-007 §5）。カードは投稿時点の姿で、表示時に外部へは出ない
function MealLinkList({ spaceId, meal }: { spaceId: string; meal: Meal }) {
  const links = LINK_KINDS.flatMap(({ kind, label, urlOf }) => {
    const url = urlOf(meal);
    return url === null
      ? []
      : [{ kind, label, url, preview: meal.previews.find((p) => p.kind === kind) ?? null }];
  });
  if (links.length === 0) return null;
  return (
    <ul className="link-list" role="list">
      {links.map(({ kind, label, url, preview }) => (
        <li key={kind}>
          {preview?.status === "ok" ? (
            <a className="link-card" href={url} target="_blank" rel="noreferrer">
              {preview.hasImage && (
                <img
                  className="link-card__media"
                  src={linkPreviewImageUrl(spaceId, meal.id, kind)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="link-card__body">
                <span className="badge">{label}</span>
                <span className="link-card__title">{preview.title}</span>
                <span className="link-card__site">{preview.siteName ?? linkLabel(url)}</span>
              </span>
            </a>
          ) : (
            <a href={url} target="_blank" rel="noreferrer">
              {label}: {linkLabel(url)}
            </a>
          )}
        </li>
      ))}
    </ul>
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

// 拡大表示。<dialog> の showModal で開く（Esc は native、背景タップは e.target === dialog で判定）
function PhotoLightbox({
  spaceId,
  selected,
  onClose,
  onDelete,
}: {
  spaceId: string;
  selected: { meal: Meal; photo: MealPhoto } | null;
  onClose: () => void;
  onDelete: (sel: { meal: Meal; photo: MealPhoto }) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={selected ? `${selected.meal.name} の写真` : "写真の拡大表示"}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {selected && (
        <div className="stack stack--tight">
          <img
            src={mealPhotoUrl(spaceId, selected.meal.id, selected.photo.id)}
            alt={`${selected.meal.name} の写真`}
            width={selected.photo.width}
            height={selected.photo.height}
          />
          <div className="row row--between">
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => onDelete(selected)}
            >
              写真を削除
            </button>
            <button type="button" className="btn btn--small" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
