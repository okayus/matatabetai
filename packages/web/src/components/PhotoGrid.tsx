import { useEffect, useState } from "react";
import { mealPhotoUrl, type Meal, type MealPhoto } from "../api";
import { formatEatenOn } from "../format";
import { clampIndex } from "../lib/carousel";
import {
  nextCycleIndex,
  PHOTO_CYCLE_INTERVAL_MS,
  photoGridItems,
  type PhotoGridItem,
} from "../lib/photo-grid";

// タイムラインの写真グリッド（requirements 13）。1 投稿 1 セルで最初に見せるのは 1 枚目、
// 複数枚のセルは 1 秒ごとに次の 1 枚へ巡る。タップでその投稿の詳細へ（いま見えている 1 枚から。
// lib/photo-grid.ts に決めの理由）。
// 日付見出しは置かない — 連続した壁として眺める場で、いつのものかは詳細の中に出る。
// セルはサムネ（320px）を使う: スマホ 3 列のセル幅なら DPR 3 でもほぼ等倍で、
// カード幅いっぱいに出す一覧（本体 1600px — #51）とは要る解像度が違う
export function PhotoGrid({
  spaceId,
  meals,
  onOpenCell,
}: {
  spaceId: string;
  meals: Meal[];
  onOpenCell: (meal: Meal, index: number) => void;
}) {
  const items = photoGridItems(meals);
  // 記録はあるが写真が無い（絞り込みの結果に写真つきが無いときも同じ）。写真の無い記録は くわしく にいる
  if (items.length === 0) {
    return (
      <p className="muted">
        写真のついた記録はありません。写真をつけて記録するとここに並びます（写真のない記録は「くわしく」で見られます）。
      </p>
    );
  }
  return (
    <ul className="photo-grid" role="list">
      {items.map((meal) => (
        <li key={meal.id}>
          <PhotoCell spaceId={spaceId} meal={meal} onOpen={(index) => onOpenCell(meal, index)} />
        </li>
      ))}
    </ul>
  );
}

// 複数枚のセルは PHOTO_CYCLE_INTERVAL_MS ごとに次の 1 枚へ（最後の次は先頭 — lib/photo-grid.ts）。
// 動きを減らす設定の端末では巡らせず 1 枚目のまま: 勝手に変わり続けるものを止める口はこの設定に
// 預ける（modern-web-guidance accessibility §10「自動で動くものには止める手段を」。壁に止める
// ボタンを足すより、端末の設定のほうが家族の手に近い）。
// タイマーは 1 セル 1 本 — 壁で 1 本にして tick を配ると、毎秒すべてのセルが描き直される
function useCycleIndex(count: number): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (count <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(
      () => setIndex((i) => nextCycleIndex(i, count)),
      PHOTO_CYCLE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [count]);
  return clampIndex(index, count);
}

// 1 セル。複数枚は同じ枡に全部を重ねて置き、見せる 1 枚だけを不透明にする（styles.css .photo-cell__photo）—
// <img> の src を差し替える方式は、替わるたびに読み込みとデコードの空白が出る。
// 隠れている写真は先に取っておくが優先度は下げる（modern-web-guidance optimize-image-priority:
// 画面内にあるがまだ見えていない画像は fetchpriority="low"）。
// 名前はボタンが持ち、絵は装飾に落とす（alt=""）ので、巡っても読み上げは変わらない
function PhotoCell({
  spaceId,
  meal,
  onOpen,
}: {
  spaceId: string;
  meal: PhotoGridItem<Meal, MealPhoto>;
  onOpen: (index: number) => void;
}) {
  const shown = useCycleIndex(meal.photos.length);
  return (
    <button type="button" className="photo-cell" onClick={() => onOpen(shown)}>
      {meal.photos.map((p, i) => (
        <img
          key={p.id}
          className={i === shown ? "photo-cell__photo photo-cell__photo--shown" : "photo-cell__photo"}
          src={mealPhotoUrl(spaceId, meal.id, p.id, p.hasThumb ? "thumb" : undefined)}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority={i === 0 ? undefined : "low"}
        />
      ))}
      {meal.mataTabetai && (
        <span className="photo-cell__mata" aria-hidden="true">
          ♥
        </span>
      )}
      {meal.photos.length > 1 && (
        <span className="photo-cell__count" aria-hidden="true">
          {/* 重なった 2 枚 = 「まだある」の印。文字の ⧉ はフォント次第で出ない端末がある */}
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M4 1.5h5A1.5 1.5 0 0 1 10.5 3v5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect x="1" y="3.5" width="7.5" height="7.5" rx="1.5" fill="currentColor" />
          </svg>
        </span>
      )}
      <span className="visually-hidden">
        {meal.mataTabetai ? "またたべたい。" : ""}
        {meal.name}（{formatEatenOn(meal.eatenOn)}
        {meal.photos.length > 1 ? `、写真 ${meal.photos.length} 枚` : ""}）をひらく
      </span>
    </button>
  );
}
