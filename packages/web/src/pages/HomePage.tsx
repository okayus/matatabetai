import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  createMeal,
  describeFailure,
  listMeals,
  listMealSuggestions,
  listSpaceTags,
  mealPhotoUrl,
  uploadMealPhoto,
  type Me,
  type Meal,
  type MealPhoto,
  type MealSuggestion,
  type MealTag,
  type SpaceSummary,
} from "../api";
import { Link } from "../components/Link";
import { MealFields } from "../components/MealFields";
import { MealList } from "../components/MealList";
import { TagFilter } from "../components/TagFilter";
import { formatEatenOn, formatShortDate, todayLocalDate } from "../format";
import { preparePhoto, type PreparedPhoto } from "../lib/image-prep";
import {
  EMPTY_MEAL_FILTER,
  isEmptyMealFilter,
  mealFilterSearch,
  parseMealFilter,
  toggleFilterTag,
  type MealFilter,
} from "../lib/meal-filter";
import { applySuggestion, emptyMealForm, toMealContentBody, type MealFormState } from "../lib/meal-form";
import { sortByRecency } from "../lib/meal-order";
import { primarySpace } from "../lib/space";
import { navigate, useSearch } from "../router";

// トップページ（requirements 15）: 検索と写真の壁が主役。h1 はスペース名 — 家族のアルバムの題
// （ADR-009 §5。挨拶とスペース一覧はアカウントへ）。絞り込みの状態は URL のクエリが持つ（§4）:
// 引っ張り更新で消えず、ふりかえりからの遷移が URL で渡せ、「ホーム」リンク（= 素の /）が解除になる
export function HomePage({ me }: { me: Me }) {
  const primary = primarySpace(me.spaces);
  const search = useSearch();
  const filter = useMemo(() => parseMealFilter(search), [search]);
  if (!primary) {
    return (
      <section className="stack">
        <h1>ホーム</h1>
        <p className="muted">
          まだどのスペースにも入っていません。<Link href="/account">アカウント</Link>{" "}
          で自分のスペースを作るか、家族から招待リンクをもらってください。
        </p>
      </section>
    );
  }
  return (
    <MealsSection
      key={primary.id}
      space={primary}
      filter={filter}
      // 札の切り替え・テキストの確定は履歴を汚さない（「戻る」は前のページへ）
      onFilterChange={(next) => navigate(`/${mealFilterSearch(next)}`, { replace: true })}
    />
  );
}

function MealsSection({
  space,
  filter,
  onFilterChange,
}: {
  space: SpaceSummary;
  filter: MealFilter;
  onFilterChange: (next: MealFilter) => void;
}) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  // 絞り込みの語彙（よく使う順）。記録すると増えるので、送れたら読み直す
  const [tagList, setTagList] = useState<MealTag[]>([]);
  // タイムラインの見せ方（requirements 13）。既定は写真だけの壁（requirements 15）で、
  // 料理名・タグ・メモまで読みたければ くわしく に切り替える
  const [view, setView] = useState<"list" | "grid">("grid");
  // 記録フォームは <dialog>（requirements 14）。押して開くまでページに出ない
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    const r = await listSpaceTags(space.id);
    if (r.isOk()) setTagList(r.value);
  }, [space.id]);
  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  // 絞り込みを続けて切り替えたときに、古い応答で上書きしない
  useEffect(() => {
    let live = true;
    void listMeals(space.id, filter).then((r) => {
      if (!live) return;
      if (r.isOk()) setMeals(r.value);
      else setError(describeFailure(r.error));
    });
    return () => {
      live = false;
    };
  }, [space.id, filter]);

  // eaten_on DESC, created_at DESC のサーバー順を、手元の挿入でも保つ
  const insert = (m: Meal) => setMeals((prev) => sortByRecency([m, ...(prev ?? [])]));
  const onCreated = (m: Meal) => {
    insert(m);
    void loadTags();
    // 絞り込み中に記録すると、新しい記録は絞り込みに合わず壁に出ないことが多い。
    // 既定に戻せば URL の変化が一覧を読み直し、新しい記録は先頭にいる（ADR-009 §6）
    if (!isEmptyMealFilter(filter)) onFilterChange(EMPTY_MEAL_FILTER);
  };

  return (
    <>
      <section className="card stack" aria-labelledby="feedHeading">
        <div className="row row--between">
          <h1 id="feedHeading" className="feed-title">
            {space.name}
          </h1>
          {/* 見出しの横に収まる短い表示（スマホ幅で折り返すと写真が 1 行ぶん下がる）。名前は読み上げ用に補う */}
          <button
            type="button"
            className="btn btn--primary"
            aria-label="たべたものを記録する"
            onClick={() => setComposing(true)}
          >
            ＋ 記録する
          </button>
        </div>
        <MealSearch
          filter={filter}
          tagList={tagList}
          view={view}
          onFilterChange={onFilterChange}
          onViewChange={setView}
        />
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {meals === null ? (
          <p className="muted">読み込み中…</p>
        ) : meals.length === 0 ? (
          <p className="muted">{emptyMessage(filter)}</p>
        ) : (
          <MealList
            spaceId={space.id}
            meals={meals}
            view={view}
            onMealsChange={(update) => setMeals((prev) => update(prev ?? []))}
            onError={setError}
          />
        )}
      </section>
      <MealFormDialog
        spaceId={space.id}
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={onCreated}
      />
    </>
  );
}

function emptyMessage(filter: MealFilter): string {
  if (filter.q !== "" || filter.tags.length > 0) return "この絞り込みに合う記録はまだありません。";
  if (filter.mataTabetai) return "またたべたいはまだありません。「くわしく」で ♡ を押すとここに並びます。";
  return "まだ記録がありません。最初のたべたものを記録してみましょう。";
}

// 検索と絞り込み（ADR-009 §1-2）。料理名は「さがす」（Enter・スマホの検索キー）で確定し、
// 空にした瞬間だけ即座に解除する — 消したのに前の結果が残るのは変（× でも Backspace でも）。
// ♥ とタグの札は押した瞬間に効く。「くわしく」は絞り込みではなく描き方なので URL には出ない
function MealSearch({
  filter,
  tagList,
  view,
  onFilterChange,
  onViewChange,
}: {
  filter: MealFilter;
  tagList: MealTag[];
  view: "list" | "grid";
  onFilterChange: (next: MealFilter) => void;
  onViewChange: (next: "list" | "grid") => void;
}) {
  // 入力中の値。確定した q が外から変わったら（URL の遷移・記録後の解除）欄も合わせる
  const [draft, setDraft] = useState(filter.q);
  const [seenQ, setSeenQ] = useState(filter.q);
  if (seenQ !== filter.q) {
    setSeenQ(filter.q);
    setDraft(filter.q);
  }

  return (
    <search className="stack stack--tight">
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          onFilterChange({ ...filter, q: draft.trim() });
        }}
      >
        <label htmlFor="mealSearch" className="visually-hidden">
          料理名でさがす
        </label>
        <input
          id="mealSearch"
          name="q"
          type="search"
          placeholder="料理名でさがす"
          maxLength={100}
          enterKeyHint="search"
          value={draft}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setDraft(value);
            if (value.trim() === "" && filter.q !== "") onFilterChange({ ...filter, q: "" });
          }}
        />
        <button type="submit" className="btn">
          さがす
        </button>
      </form>
      <div className="filter-bar">
        <button
          type="button"
          className="chip"
          aria-pressed={filter.mataTabetai}
          onClick={() => onFilterChange({ ...filter, mataTabetai: !filter.mataTabetai })}
        >
          <span aria-hidden="true">♥</span> またたべたい
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={view === "list"}
          onClick={() => onViewChange(view === "list" ? "grid" : "list")}
        >
          くわしく
        </button>
        <TagFilter
          tagList={tagList}
          selected={filter.tags}
          onToggle={(name) => onFilterChange(toggleFilterTag(filter, name))}
        />
        {!isEmptyMealFilter(filter) && (
          <button
            type="button"
            className="btn btn--ghost btn--small filter-bar__reset"
            onClick={() => onFilterChange(EMPTY_MEAL_FILTER)}
          >
            絞り込みを解除
          </button>
        )}
      </div>
    </search>
  );
}

// 選択済みでまだ送っていない写真。preview はサムネ blob の object URL（外したら revoke）
type PendingPhoto = { key: string; prepared: PreparedPhoto; previewUrl: string };

// 記録フォーム（requirements 14）。ページ上部に常駐せず、「たべたものを記録する」で <dialog> として
// 開く（showModal — Esc・Android の戻る・広い画面では背景のタップで閉じる。拡大表示と同じ流儀）。
// 閉じても入力は捨てない: フォームは閉じた dialog の中にそのまま残るので、途中で閉じても
// やり直しにならない（送れたときだけ空にする）。
// サジェストは開いている間だけ読む — ホームを眺めるだけの読み込みにリクエストを足さないし、
// 開くたびに読み直すので、記録の増減に追従させる再読込の配線が要らない（modal の間、記録は動かない）
function MealFormDialog({
  spaceId,
  open,
  onClose,
  onCreated,
}: {
  spaceId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (m: Meal) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const [form, setForm] = useState<MealFormState>(() => emptyMealForm(todayLocalDate()));
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 引き継いだことの知らせ（読み上げは role="status"）
  const [carriedOver, setCarriedOver] = useState<string | null>(null);

  const set = <K extends keyof MealFormState>(key: K, value: MealFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onPickPhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    // currentTarget は await の後で使えない。FileList も value 消去で空になるので先に配列へ
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    let unreadable = false;
    for (const file of files) {
      const prepared = await preparePhoto(file);
      if (!prepared) {
        unreadable = true;
        continue;
      }
      setPending((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          prepared,
          previewUrl: URL.createObjectURL(prepared.thumb.blob),
        },
      ]);
    }
    if (unreadable) {
      setError(
        "読み込めない写真がありました（HEIC の可能性）。iPhone は 設定 → カメラ → フォーマット → 互換性優先 にするか、JPEG で共有してください。",
      );
    }
    setBusy(false);
  };
  const removePending = (key: string) => {
    setPending((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createMeal(spaceId, toMealContentBody(form));
    if (r.isErr()) {
      setBusy(false);
      setError(describeFailure(r.error));
      return;
    }
    // meal は出来ているので、写真が一部失敗しても投稿は一覧に出す（失敗分だけ知らせる）
    const photos: MealPhoto[] = [];
    let photoFailure: string | null = null;
    for (const p of pending) {
      const up = await uploadMealPhoto(spaceId, r.value.id, p.prepared);
      if (up.isOk()) photos.push(up.value);
      else photoFailure = describeFailure(up.error);
    }
    setBusy(false);
    onCreated({ ...r.value, photos });
    for (const p of pending) URL.revokeObjectURL(p.previewUrl);
    setPending([]);
    setForm(emptyMealForm(todayLocalDate()));
    setCarriedOver(null);
    // 送れたら閉じて、一覧に並んだ記録を見せる。写真が送れなかったときだけ開いたまま知らせる
    // （閉じてしまうと知らせを読む場が無い）
    if (photoFailure) setError(`記録は保存しましたが、写真を送れませんでした: ${photoFailure}`);
    else onClose();
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="mealFormHeading"
      closedby="any"
      onClose={onClose}
      onClick={(e) => {
        // closedby="any" の無い Safari のための背景タップ。中身（form）が dialog を満たしているので、
        // target が dialog そのものになるのは背景だけ
        if (e.target === ref.current) onClose();
      }}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="sheet__head">
          <h2 id="mealFormHeading">たべたものを記録</h2>
          <button type="button" className="btn btn--small" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="sheet__body stack">
          <MealFields
            idPrefix="newMeal"
            form={form}
            onChange={set}
            afterName={
              <>
                {open && (
                  <SuggestionPicker
                    spaceId={spaceId}
                    onPick={(s) => {
                      setForm((f) => applySuggestion(f, s));
                      setCarriedOver(s.name);
                    }}
                  />
                )}
                {/* 空でも要素を残す（後から現れる live region は読み上げられないことがある） */}
                <p className="hint status-line" role="status">
                  {carriedOver &&
                    `「${carriedOver}」の前回の内容を引き継ぎました。日付とひとことメモは今回の分をどうぞ。`}
                </p>
              </>
            }
            photos={
              <>
                <div className="field">
                  <label htmlFor="newMealPhotos">写真</label>
                  <span id="newMealPhotosHint" className="hint">
                    複数選べます。この端末で縮小してから送ります（位置情報は残りません）
                  </span>
                  <input
                    id="newMealPhotos"
                    type="file"
                    accept="image/*"
                    multiple
                    aria-describedby="newMealPhotosHint"
                    disabled={busy}
                    onChange={(e) => void onPickPhotos(e)}
                  />
                </div>
                {pending.length > 0 && (
                  <ul className="photo-strip" role="list">
                    {pending.map((p, i) => (
                      <li key={p.key} className="photo-pending">
                        <img src={p.previewUrl} alt={`選択中の写真 ${i + 1}`} />
                        <button
                          type="button"
                          className="btn btn--small"
                          disabled={busy}
                          onClick={() => removePending(p.key)}
                        >
                          外す<span className="visually-hidden">（選択中の写真 {i + 1}）</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            }
          />
          <button type="submit" className="btn btn--primary" disabled={busy}>
            記録する
          </button>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </dialog>
  );
}

// 投稿フォームのサジェスト（requirements 8）。料理名ごとの直近 1 件を新しい順に並べ、
// 選ぶと前回のリンク 2 種 / 作り方メモ / タグをフォームに複製する（編集してから新規投稿 — ADR-003 §5）。
// dialog が開いている間だけ mount されるので、読むのは開いたとき（と絞り込みを変えたとき）だけ
function SuggestionPicker({ spaceId, onPick }: { spaceId: string; onPick: (s: MealSuggestion) => void }) {
  const [suggestions, setSuggestions] = useState<MealSuggestion[] | null>(null);
  const [tagList, setTagList] = useState<MealTag[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void listSpaceTags(spaceId).then((r) => {
      if (live && r.isOk()) setTagList(r.value);
    });
    return () => {
      live = false;
    };
  }, [spaceId]);

  // 絞り込みを続けて切り替えたときに、古い応答で上書きしない
  useEffect(() => {
    let live = true;
    void listMealSuggestions(spaceId, selected).then((r) => {
      if (!live) return;
      setFailed(r.isErr());
      if (r.isOk()) setSuggestions(r.value);
    });
    return () => {
      live = false;
    };
  }, [spaceId, selected]);

  const toggleTag = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));

  if (failed) return <p className="hint">最近のたべたものを読み込めませんでした。</p>;
  // 記録がまだ無いスペースでは出さない（絞り込み中は 0 件でも枠を残す — 解除できなくなるので）
  if (suggestions === null || (suggestions.length === 0 && selected.length === 0)) return null;

  return (
    <div className="field">
      <h3>最近のたべたもの</h3>
      <span className="hint">タップすると前回のリンク・作り方メモ・タグを引き継ぎます</span>
      <TagFilter tagList={tagList} selected={selected} onToggle={toggleTag} />
      {suggestions.length === 0 ? (
        <p className="hint">このタグの記録はまだありません。</p>
      ) : (
        <ul className="suggest-strip" role="list">
          {suggestions.map((s) => (
            <li key={s.mealId}>
              <button type="button" className="suggest-card" onClick={() => onPick(s)}>
                {s.photo ? (
                  <img
                    className="suggest-card__media"
                    src={mealPhotoUrl(spaceId, s.mealId, s.photo.id, s.photo.hasThumb ? "thumb" : undefined)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="suggest-card__media suggest-card__media--blank" aria-hidden="true">
                    🍚
                  </span>
                )}
                <span className="suggest-card__name">{s.name}</span>
                <span className="suggest-card__meta" aria-hidden="true">
                  {s.mataTabetai && <span className="suggest-card__mata">♥</span>}
                  {formatShortDate(s.lastEatenOn)}
                </span>
                <span className="visually-hidden">
                  {`${s.mataTabetai ? "またたべたい。" : ""}前回 ${formatEatenOn(s.lastEatenOn)}。前回の内容を引き継ぐ`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
