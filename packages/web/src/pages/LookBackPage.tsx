import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  describeFailure,
  listMealStats,
  listMealTagStats,
  type Me,
  type MealNameStat,
  type MealTagStat,
} from "../api";
import { Link } from "../components/Link";
import { formatDateRange, formatEatenOn, formatMonth, todayLocalDate } from "../format";
import { EMPTY_MEAL_FILTER, mealFilterSearch, type MealFilter } from "../lib/meal-filter";
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

// 振り返りのページ（roadmap Phase 3）: 期間の集計だけを持つ「まとめ」（ADR-009 §3）。
// 記録を探す・眺めるはホーム（検索 + 写真の壁）に一本化し、ここの札と行はホームへの入口
export function LookBackPage({ me }: { me: Me }) {
  const space = primarySpace(me.spaces);
  return (
    <section className="stack">
      <h1>ふりかえり</h1>
      {space ? (
        <StatsSection spaceId={space.id} />
      ) : (
        <p className="muted">まだどのスペースにも入っていません。</p>
      )}
    </section>
  );
}

// ホームをこの絞り込みで開く URL（絞り込みの状態は URL のクエリ — ADR-009 §4）
const homeWith = (filter: Partial<MealFilter>) =>
  `/${mealFilterSearch({ ...EMPTY_MEAL_FILTER, ...filter })}`;

// 期間の集計（requirements 7）。プリセットが期間を組み、← → で 1 つずつ遡れる。
// 料理名のランキングと食材タグのクラウドは同じ期間を見る（API は別、操作は 1 つ）
function StatsSection({ spaceId }: { spaceId: string }) {
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
          <TagCloud stats={tagStats} />
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

// 料理名はホームをその名前で絞る入口（部分一致の q — ADR-009 §3。「カレー」が「カレーうどん」も
// 拾うのは、検索欄に語が入って見えるので混乱しない）
function NameRanking({ stats }: { stats: MealNameStat[] }) {
  return (
    <div className="stack stack--tight">
      <h3>よく食べているもの</h3>
      <p className="hint">タップすると、ホームでその料理の記録をさがせます。</p>
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
                <strong>
                  <Link href={homeWith({ q: s.name })}>{s.name}</Link>
                </strong>
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
// 並びは多い順なので、端の 2 つが最大・最小。札はホームをそのタグ 1 つで絞る入口
// （ADR-006 §8 の飛び先がページ内からホームに変わった — ADR-009 §3。URL への遷移なので <a>）
function TagCloud({ stats }: { stats: MealTagStat[] }) {
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
          <p className="hint">タップすると、ホームでその食材の記録をさがせます。</p>
          <ul className="chips tag-cloud" role="list">
            {stats.map((t) => (
              <li key={t.id}>
                <Link
                  className="chip"
                  href={homeWith({ tags: [t.name] })}
                  style={{ "--weight": weight(t.count) } as CSSProperties}
                >
                  {t.name}
                  <span className="tag-cloud__count" aria-hidden="true">
                    {t.count}
                  </span>
                  <span className="visually-hidden">{t.count} 回つかいました</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
