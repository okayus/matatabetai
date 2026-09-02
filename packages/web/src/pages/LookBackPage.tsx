import { useEffect, useState } from "react";
import {
  describeFailure,
  listMeals,
  listMealStats,
  listSpaceTags,
  type Me,
  type Meal,
  type MealNameStat,
  type MealTag,
  type SpaceSummary,
} from "../api";
import { MealList } from "../components/MealList";
import { TagFilter } from "../components/TagFilter";
import { formatEatenOn } from "../format";
import { primarySpace } from "../lib/space";

// 振り返りのページ（roadmap Phase 3）: またたべたい一覧・タグ検索（AND）・料理名の期間集計。
// 開いた既定は「またたべたい」— 次の献立の起点を前に出す（requirements 9）
export function LookBackPage({ me }: { me: Me }) {
  const space = primarySpace(me.spaces);
  return (
    <section className="stack">
      <h1>ふりかえり</h1>
      {space ? (
        <>
          <RecordsSection space={space} />
          <StatsSection spaceId={space.id} />
        </>
      ) : (
        <p className="muted">まだどのスペースにも入っていません。</p>
      )}
    </section>
  );
}

function RecordsSection({ space }: { space: SpaceSummary }) {
  const [mataOnly, setMataOnly] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [tagList, setTagList] = useState<MealTag[]>([]);
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listSpaceTags(space.id).then((r) => {
      if (live && r.isOk()) setTagList(r.value);
    });
    return () => {
      live = false;
    };
  }, [space.id]);

  // フィルタを続けて切り替えたときに、古い応答で上書きしない
  useEffect(() => {
    let live = true;
    void listMeals(space.id, { tags: selected, mataTabetai: mataOnly }).then((r) => {
      if (!live) return;
      if (r.isOk()) setMeals(r.value);
      else setError(describeFailure(r.error));
    });
    return () => {
      live = false;
    };
  }, [space.id, mataOnly, selected]);

  const toggleTag = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));

  return (
    <section className="card stack" aria-labelledby="lookBackRecordsHeading">
      <h2 id="lookBackRecordsHeading">記録をさがす</h2>
      <fieldset className="chips">
        <legend className="visually-hidden">どの記録を見るか</legend>
        <button
          type="button"
          className="chip"
          aria-pressed={mataOnly}
          onClick={() => setMataOnly(true)}
        >
          <span aria-hidden="true">♥</span> またたべたい
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={!mataOnly}
          onClick={() => setMataOnly(false)}
        >
          ぜんぶの記録
        </button>
      </fieldset>
      <TagFilter tagList={tagList} selected={selected} onToggle={toggleTag} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {meals === null ? (
        <p className="muted">読み込み中…</p>
      ) : meals.length === 0 ? (
        <p className="muted">{emptyMessage(mataOnly, selected.length > 0)}</p>
      ) : (
        <MealList
          spaceId={space.id}
          meals={meals}
          onMealsChange={(update) => setMeals((prev) => update(prev ?? []))}
          onError={setError}
        />
      )}
    </section>
  );
}

function emptyMessage(mataOnly: boolean, filtered: boolean): string {
  if (filtered) return "この絞り込みに合う記録はまだありません。";
  if (mataOnly) return "またたべたいはまだありません。みんなの記録で ♡ を押すとここに並びます。";
  return "まだ記録がありません。";
}

// 料理名の期間集計（requirements 7）。期間は任意で、空のままなら全期間
function StatsSection({ spaceId }: { spaceId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stats, setStats] = useState<MealNameStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // date picker は min/max でほぼ防げるが、キーボード入力の逆転はここで止める（サーバーも弾く）
  const inverted = from !== "" && to !== "" && to < from;

  useEffect(() => {
    if (from !== "" && to !== "" && to < from) return;
    let live = true;
    void listMealStats(spaceId, { from: from || undefined, to: to || undefined }).then((r) => {
      if (!live) return;
      if (r.isOk()) {
        setStats(r.value);
        setError(null);
      } else setError(describeFailure(r.error));
    });
    return () => {
      live = false;
    };
  }, [spaceId, from, to]);

  return (
    <section className="card stack" aria-labelledby="statsHeading">
      <h2 id="statsHeading">よく食べているもの</h2>
      <div className="row">
        <div className="field field--grow">
          <label htmlFor="statsFrom">いつから</label>
          <input
            id="statsFrom"
            type="date"
            value={from}
            max={to || undefined}
            aria-describedby="statsRangeHint"
            onChange={(e) => setFrom(e.currentTarget.value)}
          />
        </div>
        <div className="field field--grow">
          <label htmlFor="statsTo">いつまで</label>
          <input
            id="statsTo"
            type="date"
            value={to}
            min={from || undefined}
            aria-describedby="statsRangeHint"
            onChange={(e) => setTo(e.currentTarget.value)}
          />
        </div>
      </div>
      <p id="statsRangeHint" className="hint">
        空のままなら、ぜんぶの記録から数えます。
      </p>
      {inverted && (
        <p role="alert" className="alert">
          「いつから」が「いつまで」より後になっています。
        </p>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {stats === null ? (
        <p className="muted">読み込み中…</p>
      ) : stats.length === 0 ? (
        <p className="muted">この期間の記録はまだありません。</p>
      ) : (
        <ul className="list" role="list">
          {stats.map((s) => (
            <li key={s.name} className="list-item">
              <div className="stack stack--tight">
                <div className="row">
                  {s.mataTabetai && (
                    <>
                      <span className="stat-mata" aria-hidden="true">
                        ♥
                      </span>
                      <span className="visually-hidden">またたべたい。</span>
                    </>
                  )}
                  <strong>{s.name}</strong>
                </div>
                <span className="muted">最後は {formatEatenOn(s.lastEatenOn)}</span>
              </div>
              <span className="badge">{s.count} 回</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
