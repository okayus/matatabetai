import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  deleteMeal,
  deleteMealPhoto,
  describeFailure,
  linkPreviewImageUrl,
  mealPhotoUrl,
  setMataTabetai,
  updateMeal,
  uploadMealPhoto,
  type LinkPreviewKind,
  type Meal,
  type MealPhoto,
} from "../api";
import { formatEatenOn } from "../format";
import { clampIndex, snapIndex } from "../lib/carousel";
import { preparePhoto } from "../lib/image-prep";
import { MEAL_TYPE_LABEL, mealFormFrom, toMealContentBody, type MealFormState } from "../lib/meal-form";
import { sortByRecency } from "../lib/meal-order";
import { MealFields } from "./MealFields";
import { PhotoGrid } from "./PhotoGrid";

// みんなの記録とふりかえりで共通の一覧。日付見出しでまとめ、またたべたいトグル・削除・
// 写真の拡大（<dialog>）までここが持つ。読み込み・並び・空表示は親の責務。
// またたべたい絞り込み中に ♥ を外しても行は消さない（誤タップを戻せる。次の読み込みで消える）。
// view="grid" は同じ配列を写真だけの壁に描き替える（requirements 13。拡大と削除は共有）
export function MealList({
  spaceId,
  meals,
  view = "list",
  onMealsChange,
  onError,
}: {
  spaceId: string;
  meals: Meal[];
  view?: "list" | "grid" | undefined;
  // 楽観更新の書き戻し。一覧の配列は親が持つ
  onMealsChange: (update: (prev: Meal[]) => Meal[]) => void;
  onError: (message: string | null) => void;
}) {
  // 開いている写真は「どの記録の何枚目か」で持つ。meal そのものを控えると、開いている間に
  // 写真が減ったとき（拡大したまま削除）に古い配列を見てしまう
  const [lightbox, setLightbox] = useState<{ mealId: string; index: number } | null>(null);
  // 直せるのは一度に 1 件（ADR-008 §7）。行をその場でフォームに変える
  const [editingId, setEditingId] = useState<string | null>(null);

  // 写真は保存を待たずその場で足し引きする（meal は既にある — ADR-008 §4）
  const setPhotos = (mealId: string, update: (photos: MealPhoto[]) => MealPhoto[]) =>
    onMealsChange((prev) =>
      prev.map((x) => (x.id === mealId ? { ...x, photos: update(x.photos) } : x)),
    );
  const saved = (updated: Meal) => {
    // 食べた日が変わると行は別の日付見出しの下へ移る。写真はこの口では動かないので手元の値を残す
    onMealsChange((prev) =>
      sortByRecency(prev.map((x) => (x.id === updated.id ? { ...updated, photos: x.photos } : x))),
    );
    setEditingId(null);
  };

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
  };
  const removePhoto = async (meal: Meal, photo: MealPhoto) => {
    if (!confirm("この写真を削除しますか？")) return;
    onError(null);
    const r = await deleteMealPhoto(spaceId, meal.id, photo.id);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onMealsChange((prev) =>
      prev.map((x) =>
        x.id === meal.id ? { ...x, photos: x.photos.filter((p) => p.id !== photo.id) } : x,
      ),
    );
    // 消したら閉じる（残りを見るのは開き直せばよい。消し続けるより一度カードへ戻る方が迷わない）
    setLightbox(null);
  };

  // 一覧の配列は親が持つので、拡大中の記録も毎回そこから引き直す。
  // 記録ごと消えた・写真が 0 枚になったときは null → dialog が閉じる
  const opened = lightbox ? meals.find((m) => m.id === lightbox.mealId) : undefined;
  const lightboxMeal = opened && opened.photos.length > 0 ? opened : null;

  return (
    <>
      {view === "grid" ? (
        <PhotoGrid
          spaceId={spaceId}
          meals={meals}
          // セルの飛び先は拡大表示。代表（1 枚目）から開き、中で残りを送れる
          onOpenCell={(meal) => setLightbox({ mealId: meal.id, index: 0 })}
        />
      ) : (
        groupByEatenOn(meals).map(([date, items]) => (
          <div key={date} className="stack stack--tight">
            <h3 className="muted">{formatEatenOn(date)}</h3>
            {/* list-style を消した ul は Safari が list 扱いしなくなるので role を戻す */}
            <ul className="list" role="list">
              {items.map((m) => (
                <MealItem
                  key={m.id}
                  spaceId={spaceId}
                  meal={m}
                  editing={editingId === m.id}
                  onEdit={() => setEditingId(m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={saved}
                  onPhotosChange={setPhotos}
                  onToggle={toggle}
                  onRemove={remove}
                  onOpenPhoto={(meal, index) => setLightbox({ mealId: meal.id, index })}
                  onError={onError}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      <PhotoLightbox
        spaceId={spaceId}
        meal={lightboxMeal}
        openAt={lightbox?.index ?? 0}
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

type MealItemProps = {
  spaceId: string;
  meal: Meal;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (updated: Meal) => void;
  onPhotosChange: (mealId: string, update: (photos: MealPhoto[]) => MealPhoto[]) => void;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
  onOpenPhoto: (meal: Meal, index: number) => void;
  onError: (message: string | null) => void;
};

function MealItem(props: MealItemProps) {
  const { spaceId, meal, editing, onEdit, onToggle, onRemove, onOpenPhoto } = props;
  // 閉じたときに「編集」へ焦点を戻す（フォームごと消えると焦点が body に落ちる）
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (editing) {
    return (
      <li className="list-item list-item--column">
        <MealEditForm {...props} />
      </li>
    );
  }
  return (
    <li className="list-item list-item--column">
      <div className="row">
        <strong>{meal.name}</strong>
        {meal.mealType && <span className="badge">{MEAL_TYPE_LABEL[meal.mealType]}</span>}
      </div>
      {meal.photos.length > 0 && (
        <MealPhotos spaceId={spaceId} meal={meal} onOpenPhoto={onOpenPhoto} />
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
          <button ref={editButton} type="button" className="btn btn--small" onClick={onEdit}>
            編集<span className="visually-hidden">（{meal.name}）</span>
          </button>
          <button type="button" className="btn btn--danger btn--small" onClick={() => onRemove(meal)}>
            削除<span className="visually-hidden">（{meal.name}）</span>
          </button>
        </div>
      </div>
    </li>
  );
}

// 行をその場でフォームに変える（ADR-008 §7）。欄は投稿フォームと同じ MealFields で、
// サジェストの札は出さない — 引き継ぎは「新しく記録する」ための道具で、ここに置くと
// 自分の記録を他の回の内容で上書きできてしまう。
// 保存は内容の全置き換え（PUT）で、写真だけは保存を待たずその場で足し引きする（§4）
function MealEditForm({
  spaceId,
  meal,
  onCancelEdit,
  onSaved,
  onPhotosChange,
  onError,
}: MealItemProps) {
  const [form, setForm] = useState<MealFormState>(() => mealFormFrom(meal));
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof MealFormState>(key: K, value: MealFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const r = await updateMeal(spaceId, meal.id, toMealContentBody(form));
    setBusy(false);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onSaved(r.value);
  };

  const onAddPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    // currentTarget は await の後で使えない（投稿フォームと同じ理由で先に配列へ）
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    setBusy(true);
    onError(null);
    let failure: string | null = null;
    for (const file of files) {
      const prepared = await preparePhoto(file);
      if (!prepared) {
        failure =
          "読み込めない写真がありました（HEIC の可能性）。iPhone は 設定 → カメラ → フォーマット → 互換性優先 にするか、JPEG で共有してください。";
        continue;
      }
      const up = await uploadMealPhoto(spaceId, meal.id, prepared);
      if (up.isOk()) onPhotosChange(meal.id, (photos) => [...photos, up.value]);
      else failure = describeFailure(up.error);
    }
    setBusy(false);
    onError(failure);
  };

  const onRemovePhoto = async (photo: MealPhoto) => {
    if (!confirm("この写真を削除しますか？")) return;
    onError(null);
    const r = await deleteMealPhoto(spaceId, meal.id, photo.id);
    if (r.isErr()) {
      onError(describeFailure(r.error));
      return;
    }
    onPhotosChange(meal.id, (photos) => photos.filter((p) => p.id !== photo.id));
  };

  return (
    <form className="stack" aria-label="記録を編集" onSubmit={(e) => void onSubmit(e)}>
      <MealFields
        idPrefix={`edit-${meal.id}-`}
        form={form}
        onChange={set}
        photos={
          <div className="field">
            <label htmlFor={`edit-${meal.id}-Photos`}>写真</label>
            <span id={`edit-${meal.id}-PhotosHint`} className="hint">
              写真の足し引きは「保存する」を待たずすぐ反映されます
            </span>
            {meal.photos.length > 0 && (
              <ul className="photo-strip" role="list">
                {meal.photos.map((p, i) => (
                  <li key={p.id} className="photo-pending">
                    <img
                      src={mealPhotoUrl(spaceId, meal.id, p.id, p.hasThumb ? "thumb" : undefined)}
                      alt={`${meal.name} の写真 ${i + 1}`}
                      width={p.width}
                      height={p.height}
                      loading="lazy"
                      decoding="async"
                    />
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={busy}
                      onClick={() => void onRemovePhoto(p)}
                    >
                      外す<span className="visually-hidden">（{meal.name} の写真 {i + 1}）</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              id={`edit-${meal.id}-Photos`}
              type="file"
              accept="image/*"
              multiple
              aria-describedby={`edit-${meal.id}-PhotosHint`}
              disabled={busy}
              onChange={(e) => void onAddPhotos(e)}
            />
          </div>
        }
      />
      <div className="row row--between">
        <button type="button" className="btn btn--small" disabled={busy} onClick={onCancelEdit}>
          やめる
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          保存する
        </button>
      </div>
    </form>
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

// 写真の送り（requirements 12）。横スクロール + scroll-snap に任せる — 指のスワイプの慣性も
// 端の跳ね返りもブラウザのものが一番よく、JS の drag 実装より触る量が少ない。位置は scrollLeft
// から数える: scrollsnapchange / scroll-initial-target / scroll-state クエリはどれも Chrome だけ
// （modern-web-guidance 2026-09-04）で、この家族は iPhone と Android の両方を使う
function useCarousel(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [scrolled, setScrolled] = useState(0);
  return {
    ref,
    index: clampIndex(scrolled, count),
    onScroll: () => {
      const el = ref.current;
      if (el) setScrolled(snapIndex(el.scrollLeft, el.clientWidth, count));
    },
    // behavior 未指定（"auto"）は CSS の scroll-behavior に従う = 動きを減らす設定なら滑らかにしない
    goTo: (next: number, behavior: ScrollBehavior = "auto") => {
      const el = ref.current;
      if (!el) return;
      const target = clampIndex(next, count);
      setScrolled(target); // 滑らかに動く間も札は先に合わせる（押した手応えを遅らせない）
      el.scrollTo({ left: target * el.clientWidth, behavior });
    },
  };
}

// ← 2 / 3 → の 1 行。指のない環境（マウス・キーボード）のための、スワイプと同じ動きの入口。
// 写真には重ねない（小さい画面では料理が隠れる）。端では aria-disabled にとどめる —
// disabled にすると押した瞬間にボタンが無効になり、焦点が body へ落ちて送る手が止まる
function CarouselNav({
  index,
  count,
  onGoTo,
}: {
  index: number;
  count: number;
  onGoTo: (next: number) => void;
}) {
  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < count) onGoTo(next);
  };
  return (
    <div className="carousel-nav">
      <button
        type="button"
        className="btn btn--small"
        aria-disabled={index === 0}
        onClick={() => step(-1)}
      >
        <span aria-hidden="true">←</span>
        <span className="visually-hidden">前の写真</span>
      </button>
      <span className="carousel-count">
        {index + 1} / {count}
      </span>
      <button
        type="button"
        className="btn btn--small"
        aria-disabled={index === count - 1}
        onClick={() => step(1)}
      >
        <span aria-hidden="true">→</span>
        <span className="visually-hidden">次の写真</span>
      </button>
    </div>
  );
}

// カードの写真。1 枚なら切り抜かずそのまま出す（そろえる相手がいないのに正方形に切ると、
// 写した料理の端が理由もなく落ちる）。複数枚は正方形にそろえて送れるようにする —
// 縦横の混ざった写真で高さが跳ねると、送るたびに下の文章が動いて読めない。
// タイルではなく本体（1600px）を出す: カード幅いっぱいだと 320px のサムネは粗い。
// サムネは記録フォームと編集フォームの小さな一覧が使い続ける
function MealPhotos({
  spaceId,
  meal,
  onOpenPhoto,
}: {
  spaceId: string;
  meal: Meal;
  onOpenPhoto: (meal: Meal, index: number) => void;
}) {
  const carousel = useCarousel(meal.photos.length);
  const single = meal.photos.length === 1;
  return (
    <div className="stack stack--tight">
      <ul
        ref={carousel.ref}
        className={single ? "photo-carousel photo-carousel--single" : "photo-carousel"}
        role="list"
        onScroll={carousel.onScroll}
      >
        {meal.photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" className="photo-slide" onClick={() => onOpenPhoto(meal, i)}>
              <img
                src={mealPhotoUrl(spaceId, meal.id, p.id)}
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
      {!single && (
        <CarouselNav index={carousel.index} count={meal.photos.length} onGoTo={carousel.goTo} />
      )}
    </div>
  );
}

// 拡大表示。<dialog> の showModal で開く（Esc は native、背景タップは e.target === dialog で判定）。
// 中でも同じカルーセルで送れる（指・← →・キーボードの矢印）。開くのはタップした 1 枚から
function PhotoLightbox({
  spaceId,
  meal,
  openAt,
  onClose,
  onDelete,
}: {
  spaceId: string;
  meal: Meal | null;
  openAt: number;
  onClose: () => void;
  onDelete: (meal: Meal, photo: MealPhoto) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const photos = meal?.photos ?? [];
  const carousel = useCarousel(photos.length);
  const { goTo } = carousel;
  // paint 前（useLayoutEffect）に位置を合わせる。paint 後だと、前回開いたときの
  // 位置のまま 1 フレーム描かれる（札が「2 / 2」で写真は 1 枚目、のような一瞬のずれ）
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (meal && !dialog.open) {
      dialog.showModal();
      goTo(openAt, "instant"); // 開いた瞬間は送らない。タップした 1 枚がそこにある
    }
    if (!meal && dialog.open) dialog.close();
  }, [meal, openAt, goTo]);

  const current = photos[carousel.index];
  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={meal ? `${meal.name} の写真` : "写真の拡大表示"}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        // 焦点はボタンにあるので矢印キーは空いている。Esc は dialog が持つ
        if (e.key === "ArrowRight") carousel.goTo(carousel.index + 1);
        if (e.key === "ArrowLeft") carousel.goTo(carousel.index - 1);
      }}
    >
      {meal && current && (
        <div className="stack stack--tight">
          <ul
            ref={carousel.ref}
            className="photo-carousel photo-carousel--full"
            role="list"
            onScroll={carousel.onScroll}
          >
            {photos.map((p, i) => (
              <li key={p.id}>
                <img
                  src={mealPhotoUrl(spaceId, meal.id, p.id)}
                  alt={`${meal.name} の写真 ${i + 1}`}
                  width={p.width}
                  height={p.height}
                  loading={i === openAt ? "eager" : "lazy"}
                  decoding="async"
                />
              </li>
            ))}
          </ul>
          {/* なにを・いつ食べたか。グリッドから開くと料理名はここにしか無い（requirements 13） */}
          <p className="lightbox__caption">
            <strong>{meal.name}</strong>{" "}
            <span className="lightbox__caption-date">{formatEatenOn(meal.eatenOn)}</span>
          </p>
          {photos.length > 1 && (
            <CarouselNav index={carousel.index} count={photos.length} onGoTo={carousel.goTo} />
          )}
          <div className="row row--between">
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => onDelete(meal, current)}
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
