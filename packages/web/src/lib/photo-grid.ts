// 写真グリッド（requirements 13）: タイムラインを写真だけの壁にする。
// 1 投稿 = 1 セル（インスタの流儀。同じ料理の別アングルで壁が埋まらず、1 セル = 1 品なので
// 「次に食べたいもの」を目で探せる）。写真の無い投稿はセルを持たない — 絵のない枠は
// 「眺めて楽しむ」の邪魔で、その記録は「くわしく」にちゃんといる。
// 並びは一覧のまま（eaten_on DESC, created_at DESC）、セルが最初に見せるのはカルーセルの先頭と同じ 1 枚目。
// 写真が 1 枚以上あることを型で持つ（tuple）ので、セルは先頭の 1 枚を確かめずに出せる
export type PhotoGridItem<M, P> = M & { photos: readonly [P, ...P[]] };

export function photoGridItems<M, P>(
  meals: readonly (M & { photos: readonly P[] })[],
): PhotoGridItem<M, P>[] {
  return meals.filter((meal): meal is PhotoGridItem<M, P> => meal.photos.length > 0);
}

// 複数枚のセルはこの間隔で次の 1 枚へ送り、最後の次は先頭へ戻る（壁の前を離れずに全部を眺められる）。
// 手で送るカルーセルは端で止まる（carousel.ts の clampIndex）が、自動の送りは止まると
// 1 枚目以外を見せ続けるので巡らせる。範囲の外からは先頭へ — 巡っている途中で写真が消されると
// いまの index が count を越える
export const PHOTO_CYCLE_INTERVAL_MS = 1000;

export function nextCycleIndex(index: number, count: number): number {
  const next = index + 1;
  return 0 < next && next < count ? next : 0;
}
