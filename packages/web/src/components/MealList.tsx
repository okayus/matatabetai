import {
  useCallback,
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
  type MealCook,
  type MealPhoto,
} from "../api";
import { formatEatenOn } from "../format";
import { clampIndex, snapIndex } from "../lib/carousel";
import { preparePhoto } from "../lib/image-prep";
import { formatCredit, mergeCookOptions } from "../lib/meal-cooks";
import { MEAL_TYPE_LABEL, mealFormFrom, toMealContentBody, type MealFormState } from "../lib/meal-form";
import { sortByRecency } from "../lib/meal-order";
import { MealFields } from "./MealFields";
import { PhotoGrid } from "./PhotoGrid";

// みんなの記録とふりかえりで共通の一覧。日付見出しでまとめ、またたべたいトグル・削除・
// 記録の詳細（<dialog>）までここが持つ。読み込み・並び・空表示は親の責務。
// またたべたい絞り込み中に ♥ を外しても行は消さない（誤タップを戻せる。次の読み込みで消える）。
// view="grid" は同じ配列を写真だけの壁に描き替える（requirements 13。詳細は共有）
export function MealList({
  spaceId,
  meals,
  cookOptions,
  view = "list",
  onMealsChange,
  onError,
}: {
  spaceId: string;
  meals: Meal[];
  // 編集フォームの「作った人」の札（ADR-012 §6）。一覧は名前を meal.cooks から出すので、
  // これが要るのは直すときだけ
  cookOptions: MealCook[];
  view?: "list" | "grid" | undefined;
  // 楽観更新の書き戻し。一覧の配列は親が持つ
  onMealsChange: (update: (prev: Meal[]) => Meal[]) => void;
  onError: (message: string | null) => void;
}) {
  // 開いている詳細は「どの記録の何枚目から」で持つ。meal そのものを控えると、開いている間に
  // 内容が変わったとき（編集・写真の足し引き）に古い値を見てしまう
  const [detail, setDetail] = useState<{ mealId: string; index: number } | null>(null);
  // 直せるのは一度に 1 件（ADR-008 §7）。一覧の行はその場でフォームに変わり、詳細は中身を
  // フォームに差し替える。詳細を開くときに行の編集を畳むので、フォームが 2 つ出ることはない
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);

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
    setDetailEditing(false);
  };
  const openDetail = (meal: Meal, index: number) => {
    setEditingId(null);
    setDetailEditing(false);
    setDetail({ mealId: meal.id, index });
  };
  const closeDetail = () => {
    setDetail(null);
    setDetailEditing(false);
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
    // 記録ごと消えると詳細は開いたままにできない（下の find が null → dialog が閉じる）
    onMealsChange((prev) => prev.filter((x) => x.id !== m.id));
  };

  // 一覧の配列は親が持つので、開いている記録も毎回そこから引き直す。
  // 記録ごと消えたときは null → dialog が閉じる
  const detailMeal = detail ? (meals.find((m) => m.id === detail.mealId) ?? null) : null;

  return (
    <>
      {view === "grid" ? (
        <PhotoGrid
          spaceId={spaceId}
          meals={meals}
          // セルの飛び先は記録の詳細。代表（1 枚目）から開き、中で残りを送れる
          onOpenCell={(meal) => openDetail(meal, 0)}
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
                  cookOptions={cookOptions}
                  editing={editingId === m.id}
                  onEdit={() => setEditingId(m.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={saved}
                  onPhotosChange={setPhotos}
                  onToggle={toggle}
                  onRemove={remove}
                  onOpenDetail={openDetail}
                  onError={onError}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      <MealDetailDialog
        spaceId={spaceId}
        meal={detailMeal}
        cookOptions={cookOptions}
        openAt={detail?.index ?? 0}
        editing={detailEditing}
        onEdit={() => setDetailEditing(true)}
        onCancelEdit={() => setDetailEditing(false)}
        onSaved={saved}
        onPhotosChange={setPhotos}
        onToggle={toggle}
        onRemove={remove}
        onClose={closeDetail}
        onError={onError}
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
  cookOptions: MealCook[];
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (updated: Meal) => void;
  onPhotosChange: (mealId: string, update: (photos: MealPhoto[]) => MealPhoto[]) => void;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
  onOpenDetail: (meal: Meal, index: number) => void;
  onError: (message: string | null) => void;
};

function MealItem(props: MealItemProps) {
  const { spaceId, meal, editing, onEdit, onToggle, onRemove, onOpenDetail } = props;
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
        <MealEditForm
          spaceId={props.spaceId}
          meal={props.meal}
          cookOptions={props.cookOptions}
          idPrefix={`edit-${props.meal.id}-`}
          onCancelEdit={props.onCancelEdit}
          onSaved={props.onSaved}
          onPhotosChange={props.onPhotosChange}
          onError={props.onError}
        />
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
        <MealPhotos spaceId={spaceId} meal={meal} onOpenDetail={onOpenDetail} />
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
        {/* 誰が作ったかを先に読ませる（requirements 17）。記録した人は後ろ */}
        <span className="muted">
          {formatCredit(meal.cooks, { userId: meal.createdBy, displayName: meal.createdByName })}
        </span>
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

type MealEditFormProps = {
  spaceId: string;
  meal: Meal;
  cookOptions: MealCook[];
  // 同じページに 2 つ出ることがある（一覧の行 / 詳細の中）ので、label の htmlFor を分ける
  idPrefix: string;
  onCancelEdit: () => void;
  onSaved: (updated: Meal) => void;
  onPhotosChange: (mealId: string, update: (photos: MealPhoto[]) => MealPhoto[]) => void;
  onError: (message: string | null) => void;
};

// 記録を直すフォーム（ADR-008 §7）。欄は投稿フォームと同じ MealFields で、サジェストの札は
// 出さない — 引き継ぎは「新しく記録する」ための道具で、ここに置くと自分の記録を他の回の内容で
// 上書きできてしまう。保存は内容の全置き換え（PUT）で、写真だけは保存を待たずその場で足し引きする（§4）。
// 写真を消せるのはここだけ（ADR-011 §4）— 眺める場に消すボタンを置かない
function MealEditForm({
  spaceId,
  meal,
  cookOptions,
  idPrefix,
  onCancelEdit,
  onSaved,
  onPhotosChange,
  onError,
}: MealEditFormProps) {
  const [form, setForm] = useState<MealFormState>(() => mealFormFrom(meal));
  const [busy, setBusy] = useState(false);
  const id = (suffix: string) => `${idPrefix}${suffix}`;

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
        idPrefix={idPrefix}
        form={form}
        // スペースを抜けた人が作った記録でも、その人の札は選ばれたまま出す（ADR-012 §4）
        cookOptions={mergeCookOptions(cookOptions, meal.cooks)}
        onChange={set}
        photos={
          <div className="field">
            <label htmlFor={id("Photos")}>写真</label>
            <span id={id("PhotosHint")} className="hint">
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
              id={id("Photos")}
              type="file"
              accept="image/*"
              multiple
              aria-describedby={id("PhotosHint")}
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

// 見出しはフォームと同じ言葉。並び（レシピ → お店・商品、その中は入力順）はサーバーが決める
const LINK_KIND_LABEL: Record<LinkPreviewKind, string> = {
  recipe: "レシピ",
  shop: "お店・商品",
};

// URL は常にリンクとして働き、投稿時のスナップショットが取れていた（ok）ときだけ
// その上にカードを重ねる。取得中・失敗・行なしは同じ見え方なので、取得が途中で死んでも
// 表示は壊れない（ADR-007 §5）。カードは投稿時点の姿で、表示時に外部へは出ない。
// 1 投稿に複数本あるので（ADR-010）、同じ種類のカードが続けて並ぶこともある
function MealLinkList({ spaceId, meal }: { spaceId: string; meal: Meal }) {
  if (meal.links.length === 0) return null;
  return (
    <ul className="link-list" role="list">
      {meal.links.map(({ id, kind, url, preview }) => (
        <li key={id}>
          {preview.status === "ok" ? (
            <a className="link-card" href={url} target="_blank" rel="noreferrer">
              {preview.hasImage && (
                <img
                  className="link-card__media"
                  src={linkPreviewImageUrl(spaceId, meal.id, id)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              )}
              <span className="link-card__body">
                <span className="badge">{LINK_KIND_LABEL[kind]}</span>
                <span className="link-card__title">{preview.title}</span>
                <span className="link-card__site">{preview.siteName ?? linkLabel(url)}</span>
              </span>
            </a>
          ) : (
            <a href={url} target="_blank" rel="noreferrer">
              {LINK_KIND_LABEL[kind]}: {linkLabel(url)}
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
// （modern-web-guidance 2026-09-06）で、この家族は iPhone と Android の両方を使う。
// goTo / onScroll は useCallback で安定させる — 詳細（dialog）が「開いた直後・編集から戻った直後に
// 位置を合わせる」を effect の依存で表すため
function useCarousel(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [scrolled, setScrolled] = useState(0);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) setScrolled(snapIndex(el.scrollLeft, el.clientWidth, count));
  }, [count]);
  // behavior 未指定（"auto"）は CSS の scroll-behavior に従う = 動きを減らす設定なら滑らかにしない
  const goTo = useCallback(
    (next: number, behavior: ScrollBehavior = "auto") => {
      const el = ref.current;
      if (!el) return;
      const target = clampIndex(next, count);
      setScrolled(target); // 滑らかに動く間も札は先に合わせる（押した手応えを遅らせない）
      el.scrollTo({ left: target * el.clientWidth, behavior });
    },
    [count],
  );
  return { ref, index: clampIndex(scrolled, count), onScroll, goTo };
}

type Carousel = ReturnType<typeof useCarousel>;

// ← 2 / 3 → の 1 行。指のない環境（マウス・キーボード）のための、スワイプと同じ動きの入口。
// 一覧のカードでは写真に重ねない（小さい画面では料理が隠れる）。端では aria-disabled にとどめる —
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
  onOpenDetail,
}: {
  spaceId: string;
  meal: Meal;
  onOpenDetail: (meal: Meal, index: number) => void;
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
            {/* 飛び先は記録の詳細（その 1 枚から）。名前はボタンが持ち、絵は装飾に落とす */}
            <button
              type="button"
              className="photo-slide"
              aria-label={`${meal.name} の写真 ${i + 1} をひらく`}
              onClick={() => onOpenDetail(meal, i)}
            >
              <img
                src={mealPhotoUrl(spaceId, meal.id, p.id)}
                alt=""
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

// 点で示す行き先。多すぎると点の意味が消えるので、この本数までのときだけ出す（札は常に出る）
const MAX_DOTS = 8;

// 詳細の写真（ADR-011 §2）。送りは指のスワイプ（scroll-snap）に任せ、その上に「送れること」が
// ひと目で分かる操作を重ねる: ← → の丸ボタン・いま何枚目かの札・行き先の点。
// タップして初めて出る操作は、出ていないのと同じ。舞台の高さは決め打ちで、縦横の混ざった写真を
// 送っても伸び縮みしない（下の料理名とボタンが動くと、読めないし押し損ねる）
function PhotoStage({
  spaceId,
  meal,
  carousel,
}: {
  spaceId: string;
  meal: Meal;
  carousel: Carousel;
}) {
  const photos = meal.photos;
  const { ref, index, onScroll, goTo } = carousel;
  if (photos.length === 0) {
    return <p className="detail__nophoto">この記録に写真はありません。</p>;
  }
  const many = photos.length > 1;
  return (
    <div className="photo-stage">
      <ul
        ref={ref}
        className="photo-carousel photo-carousel--stage"
        role="list"
        onScroll={onScroll}
      >
        {photos.map((p, i) => (
          <li key={p.id}>
            <img
              src={mealPhotoUrl(spaceId, meal.id, p.id)}
              alt={`${meal.name} の写真 ${i + 1}`}
              width={p.width}
              height={p.height}
              loading="lazy"
              decoding="async"
            />
          </li>
        ))}
      </ul>
      {many && (
        <>
          <button
            type="button"
            className="photo-stage__nav photo-stage__nav--prev"
            aria-disabled={index === 0}
            onClick={() => goTo(index - 1)}
          >
            <Chevron back />
            <span className="visually-hidden">前の写真</span>
          </button>
          <button
            type="button"
            className="photo-stage__nav photo-stage__nav--next"
            aria-disabled={index === photos.length - 1}
            onClick={() => goTo(index + 1)}
          >
            <Chevron />
            <span className="visually-hidden">次の写真</span>
          </button>
          <p className="photo-stage__count">
            {index + 1} / {photos.length}
          </p>
          {photos.length <= MAX_DOTS && (
            <div className="photo-stage__dots">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="photo-stage__dot"
                  aria-current={i === index}
                  onClick={() => goTo(i)}
                >
                  <span className="visually-hidden">{i + 1} 枚目の写真へ</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ← → の文字はフォント次第で中心がずれる（＋ を SVG にしたのと同じ理由 — ADR-009 §5）
function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg className="photo-stage__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={back ? "M15 4.5 7.5 12 15 19.5" : "M9 4.5 16.5 12 9 19.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 記録の詳細（requirements 16 / ADR-011）。写真をタップすると開く <dialog>（showModal —
// Esc・Android の戻る・広い画面では背景のタップで閉じる。記録フォームと同じ流儀）。
// 写真の壁からはここが唯一の入口なので、写真だけでなく記録の中身と、直す・またたべたい・消すを
// すべてここに置く。編集は同じ dialog の中身を差し替える（ページを移らない）
function MealDetailDialog({
  spaceId,
  meal,
  cookOptions,
  openAt,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
  onPhotosChange,
  onToggle,
  onRemove,
  onClose,
  onError,
}: {
  spaceId: string;
  meal: Meal | null;
  cookOptions: MealCook[];
  openAt: number;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (updated: Meal) => void;
  onPhotosChange: (mealId: string, update: (photos: MealPhoto[]) => MealPhoto[]) => void;
  onToggle: (m: Meal) => void;
  onRemove: (m: Meal) => void;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isOpen = meal !== null;
  const carousel = useCarousel(meal?.photos.length ?? 0);
  const { goTo, index } = carousel;
  // いま見ている 1 枚。編集に切り替えるとカルーセルは DOM ごと外れるので、戻ったらここへ戻す
  const shown = useRef(openAt);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!isOpen) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
      shown.current = openAt; // 開くのはタップした 1 枚から
    }
  }, [isOpen, openAt]);
  // 位置合わせは showModal のあと（閉じた dialog は幅が 0 で、何枚目かを数えられない）。
  // paint 前（useLayoutEffect）に済ませるので、前の位置のまま 1 フレーム描かれることがない
  useLayoutEffect(() => {
    if (isOpen && !editing) goTo(shown.current, "instant");
  }, [isOpen, editing, goTo]);
  useEffect(() => {
    if (!editing) shown.current = index;
  }, [editing, index]);

  return (
    <dialog
      ref={ref}
      className="sheet sheet--detail"
      aria-labelledby="mealDetailHeading"
      closedby="any"
      onClose={onClose}
      onClick={(e) => {
        // closedby="any" の無い Safari のための背景タップ。中身が dialog を満たしているので、
        // target が dialog そのものになるのは背景だけ
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        // 焦点はボタンにあるので矢印キーは空いている（編集中は入力欄のもの）。Esc は dialog が持つ
        if (editing) return;
        if (e.key === "ArrowRight") goTo(index + 1);
        if (e.key === "ArrowLeft") goTo(index - 1);
      }}
    >
      {meal && (
        <div className="detail">
          <div className="sheet__head">
            <h2 id="mealDetailHeading">{meal.name}</h2>
            <button type="button" className="btn btn--small" onClick={onClose}>
              閉じる
            </button>
          </div>
          {editing ? (
            <div className="sheet__body">
              <MealEditForm
                spaceId={spaceId}
                meal={meal}
                cookOptions={cookOptions}
                idPrefix={`detail-${meal.id}-`}
                onCancelEdit={onCancelEdit}
                onSaved={onSaved}
                onPhotosChange={onPhotosChange}
                onError={onError}
              />
            </div>
          ) : (
            <>
              <PhotoStage spaceId={spaceId} meal={meal} carousel={carousel} />
              <div className="sheet__body stack stack--tight">
                <div className="row">
                  <span className="muted">{formatEatenOn(meal.eatenOn)}</span>
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
                <MealLinkList spaceId={spaceId} meal={meal} />
                {meal.recipeMemo && (
                  <details>
                    <summary>作り方メモ</summary>
                    <p className="pre-wrap">{meal.recipeMemo}</p>
                  </details>
                )}
                {meal.note && <p className="pre-wrap">{meal.note}</p>}
                <p className="muted">
                  {formatCredit(meal.cooks, {
                    userId: meal.createdBy,
                    displayName: meal.createdByName,
                  })}
                </p>
                <div className="row row--between">
                  <button
                    type="button"
                    className="btn btn--small"
                    aria-pressed={meal.mataTabetai}
                    onClick={() => onToggle(meal)}
                  >
                    <span aria-hidden="true">{meal.mataTabetai ? "♥" : "♡"}</span> またたべたい
                    <span className="visually-hidden">（{meal.name}）</span>
                  </button>
                  <div className="row">
                    <button type="button" className="btn btn--small" onClick={onEdit}>
                      編集<span className="visually-hidden">（{meal.name}）</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={() => onRemove(meal)}
                    >
                      削除<span className="visually-hidden">（{meal.name}）</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
