// 写真グリッド（requirements 13）: タイムラインを写真だけの壁にする。
// 1 投稿 = 1 セル（インスタの流儀。同じ料理の別アングルで壁が埋まらず、1 セル = 1 品なので
// 「次に食べたいもの」を目で探せる）。写真の無い投稿はセルを持たない — 絵のない枠は
// 「眺めて楽しむ」の邪魔で、その記録は「くわしく」にちゃんといる。
// 並びは一覧のまま（eaten_on DESC, created_at DESC）、代表はカルーセルの先頭と同じ 1 枚目
export type PhotoGridItem<M, P> = { meal: M & { photos: readonly P[] }; cover: P };

export function photoGridItems<M, P>(
  meals: readonly (M & { photos: readonly P[] })[],
): PhotoGridItem<M, P>[] {
  return meals.flatMap((meal) => {
    const cover = meal.photos[0];
    return cover === undefined ? [] : [{ meal, cover }];
  });
}
