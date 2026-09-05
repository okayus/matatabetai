import { mealPhotoUrl, type Meal } from "../api";
import { formatEatenOn } from "../format";
import { photoGridItems } from "../lib/photo-grid";

// タイムラインの写真グリッド（requirements 13）。1 投稿 1 セルで代表は 1 枚目、
// タップでその投稿の拡大表示へ（lib/photo-grid.ts に決めの理由）。
// 日付見出しは置かない — 連続した壁として眺める場で、いつのものかは拡大の中に出る。
// セルはサムネ（320px）を使う: スマホ 3 列のセル幅なら DPR 3 でもほぼ等倍で、
// カード幅いっぱいに出す一覧（本体 1600px — #51）とは要る解像度が違う
export function PhotoGrid({
  spaceId,
  meals,
  onOpenCell,
}: {
  spaceId: string;
  meals: Meal[];
  onOpenCell: (meal: Meal) => void;
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
      {items.map(({ meal, cover }) => (
        <li key={meal.id}>
          <button type="button" className="photo-cell" onClick={() => onOpenCell(meal)}>
            <img
              src={mealPhotoUrl(spaceId, meal.id, cover.id, cover.hasThumb ? "thumb" : undefined)}
              alt=""
              loading="lazy"
              decoding="async"
            />
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
              {meal.photos.length > 1 ? `、写真 ${meal.photos.length} 枚` : ""}）を拡大
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
