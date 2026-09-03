import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import {
  describeFailure,
  listMeals,
  listMealStats,
  listMealTagStats,
  listSpaceTags,
  type Me,
  type Meal,
  type MealNameStat,
  type MealTag,
  type MealTagStat,
  type SpaceSummary,
} from "../api";
import { MealList } from "../components/MealList";
import { TagFilter } from "../components/TagFilter";
import { formatDateRange, formatEatenOn, formatMonth, todayLocalDate } from "../format";
import { primarySpace } from "../lib/space";
import {
  canStepForward,
  isInvertedRange,
  periodName,
  periodRange,
  stepPeriod,
  stepUnitName,
  stepUnitOf,
  type StatsPeriod,
} from "../lib/stats-period";

// 振り返りのページ（roadmap Phase 3）: またたべたい一覧・タグ検索（AND）・期間の集計。
// 開いた既定は「またたべたい」— 次の献立の起点を前に出す（requirements 9）
export function LookBackPage({ me }: { me: Me }) {
  const space = primarySpace(me.spaces);
  return (
    <section className="stack">
      <h1>ふりかえり</h1>
      {space ? (
        <LookBack space={space} />
      ) : (
        <p className="muted">まだどのスペースにも入っていません。</p>
      )}
    </section>
  );
}

// 一覧の絞り込みはページで持つ。タグクラウドが「その食材の記録を見る」の入口になるので、
// 集計から一覧へ値が流れる（クラウドは下にあるため、飛び先へスクロールと focus を移す）
function LookBack({ space }: { space: SpaceSummary }) {
  const [mataOnly, setMataOnly] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const records = useRef<HTMLElement>(null);

  const showTag = (name: string) => {
    // クラウドから来た「この食材が見たい」は またたべたい の外まで含めた 1 タグの絞り込み
    setMataOnly(false);
    setSelected([name]);
    records.current?.focus({ preventScroll: true });
    records.current?.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <RecordsSection
        space={space}
        sectionRef={records}
        mataOnly={mataOnly}
        onMataOnlyChange={setMataOnly}
        selected={selected}
        onSelectedChange={setSelected}
      />
      <StatsSection spaceId={space.id} onTagSelect={showTag} />
    </>
  );
}

function RecordsSection({
  space,
  sectionRef,
  mataOnly,
  onMataOnlyChange,
  selected,
  onSelectedChange,
}: {
  space: SpaceSummary;
  sectionRef: RefObject<HTMLElement | null>;
  mataOnly: boolean;
  onMataOnlyChange: (value: boolean) => void;
  selected: string[];
  onSelectedChange: (value: string[]) => void;
}) {
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
    onSelectedChange(
      selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name],
    );

  return (
    <section
      className="card stack"
      aria-labelledby="lookBackRecordsHeading"
      ref={sectionRef}
      tabIndex={-1}
    >
      <h2 id="lookBackRecordsHeading">記録をさがす</h2>
      <fieldset className="chips">
        <legend className="visually-hidden">どの記録を見るか</legend>
        <button
          type="button"
          className="chip"
          aria-pressed={mataOnly}
          onClick={() => onMataOnlyChange(true)}
        >
          <span aria-hidden="true">♥</span> またたべたい
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={!mataOnly}
          onClick={() => onMataOnlyChange(false)}
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

// 期間の集計（requirements 7）。プリセットが期間を組み、← → で 1 つずつ遡れる。
// 料理名のランキングと食材タグのクラウドは同じ期間を見る（API は別、操作は 1 つ）
function StatsSection({
  spaceId,
  onTagSelect,
}: {
  spaceId: string;
  onTagSelect: (name: string) => void;
}) {
  const today = useMemo(todayLocalDate, []);
  // 既定は今月。開いた瞬間にいまの食卓が出るほうが「ふりかえり」の入口として近い（ぜんぶは 1 タップ隣）
  const [period, setPeriod] = useState<StatsPeriod>({ unit: "month", offset: 0 });
  const [names, setNames] = useState<MealNameStat[] | null>(null);
  const [tagStats, setTagStats] = useState<MealTagStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inverted = isInvertedRange(period);
  const range = periodRange(period, today);

  useEffect(() => {
    if (inverted) return;
    let live = true;
    const asked = { from: range.from, to: range.to };
    void Promise.all([listMealStats(spaceId, asked), listMealTagStats(spaceId, asked)]).then(
      ([n, t]) => {
        if (!live) return;
        if (n.isOk()) setNames(n.value);
        if (t.isOk()) setTagStats(t.value);
        const failure = n.isErr() ? n.error : t.isErr() ? t.error : null;
        setError(failure === null ? null : describeFailure(failure));
      },
    );
    return () => {
      live = false;
    };
    // 期間の値そのものが問い合わせの鍵（DU の形ではなく from / to が変わったときだけ引き直す）
  }, [spaceId, range.from, range.to, inverted]);

  return (
    <section className="card stack" aria-labelledby="statsHeading">
      <h2 id="statsHeading">食べたもののまとめ</h2>
      <PeriodPicker period={period} today={today} onChange={setPeriod} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {inverted ? (
        <p role="alert" className="alert">
          「いつから」が「いつまで」より後になっています。
        </p>
      ) : names === null || tagStats === null ? (
        <p className="muted">読み込み中…</p>
      ) : names.length === 0 ? (
        <p className="muted">この期間の記録はまだありません。</p>
      ) : (
        <>
          <NameRanking stats={names} />
          <TagCloud stats={tagStats} onSelect={onTagSelect} />
        </>
      )}
    </section>
  );
}

// 期間の選択。プリセットは押した時点の「今週 / 今月」に戻す（何回遡っていても現在へ）
const PRESETS = [
  { label: "今週", period: { unit: "week", offset: 0 } },
  { label: "今月", period: { unit: "month", offset: 0 } },
  { label: "ぜんぶ", period: { unit: "all" } },
  { label: "日付を指定", period: { unit: "custom", from: "", to: "" } },
] as const satisfies readonly { label: string; period: StatsPeriod }[];

function PeriodPicker({
  period,
  today,
  onChange,
}: {
  period: StatsPeriod;
  today: string;
  onChange: (next: StatsPeriod) => void;
}) {
  const unit = stepUnitOf(period);
  const range = periodRange(period, today);
  const forward = canStepForward(period);

  return (
    <div className="stack stack--tight">
      <fieldset className="chips">
        <legend className="visually-hidden">集計する期間</legend>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            aria-pressed={period.unit === p.period.unit}
            onClick={() => onChange(p.period)}
          >
            {p.label}
          </button>
        ))}
      </fieldset>

      {unit !== null && (
        <div className="period-nav">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onChange(stepPeriod(period, -1))}
          >
            <span aria-hidden="true">←</span>
            <span className="visually-hidden">前の{stepUnitName(unit)}</span>
          </button>
          <p className="period-nav__label" role="status">
            <strong>{periodName(period)}</strong>{" "}
            <span className="muted">
              {unit === "month"
                ? formatMonth(range.from ?? today)
                : formatDateRange(range.from ?? today, range.to ?? today)}
            </span>
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-disabled={!forward}
            onClick={() => forward && onChange(stepPeriod(period, 1))}
          >
            <span aria-hidden="true">→</span>
            <span className="visually-hidden">次の{stepUnitName(unit)}</span>
          </button>
        </div>
      )}

      {period.unit === "custom" && (
        <>
          <div className="row">
            <div className="field field--grow">
              <label htmlFor="statsFrom">いつから</label>
              <input
                id="statsFrom"
                type="date"
                value={period.from}
                max={period.to || undefined}
                aria-describedby="statsRangeHint"
                onChange={(e) => onChange({ ...period, from: e.currentTarget.value })}
              />
            </div>
            <div className="field field--grow">
              <label htmlFor="statsTo">いつまで</label>
              <input
                id="statsTo"
                type="date"
                value={period.to}
                min={period.from || undefined}
                aria-describedby="statsRangeHint"
                onChange={(e) => onChange({ ...period, to: e.currentTarget.value })}
              />
            </div>
          </div>
          <p id="statsRangeHint" className="hint">
            空のままなら、その端は切りません。
          </p>
        </>
      )}
    </div>
  );
}

function NameRanking({ stats }: { stats: MealNameStat[] }) {
  return (
    <div className="stack stack--tight">
      <h3>よく食べているもの</h3>
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
    </div>
  );
}

// タグクラウド。札の大きさは使った回数で、大きさは飾りなので回数そのものは数字でも出す。
// 並びは多い順なので、端の 2 つが最大・最小
function TagCloud({ stats, onSelect }: { stats: MealTagStat[]; onSelect: (name: string) => void }) {
  const max = stats[0]?.count ?? 1;
  const min = stats[stats.length - 1]?.count ?? 1;
  // 回数に差が無ければ（1 回ずつの週など）大きさで嘘の強弱を作らない。
  // 差があるときだけ、面積が回数に比例するよう平方根で開く
  const weight = (count: number) => (max === min ? 0 : Math.sqrt(count / max));
  return (
    <div className="stack stack--tight">
      <h3>よく使ったタグ</h3>
      {stats.length === 0 ? (
        <p className="muted">この期間の記録にはタグが付いていません。</p>
      ) : (
        <>
          <p className="hint">タップすると、その食材の記録をさがせます。</p>
          <fieldset className="chips tag-cloud">
            <legend className="visually-hidden">
              よく使ったタグ（選ぶと、その食材の記録が上に並びます）
            </legend>
            {stats.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                style={{ "--weight": weight(t.count) } as CSSProperties}
                onClick={() => onSelect(t.name)}
              >
                {t.name}
                <span className="tag-cloud__count" aria-hidden="true">
                  {t.count}
                </span>
                <span className="visually-hidden">{t.count} 回つかいました</span>
              </button>
            ))}
          </fieldset>
        </>
      )}
    </div>
  );
}
