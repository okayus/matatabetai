// 横スクロール + scroll-snap のカルーセルで「いま見えている 1 枚」を出す。
// scroll-snap は位置しか教えてくれない（scrollsnapchange は Chrome だけ）ので、
// scrollLeft と 1 枚の幅から数える。スライドは 100% 幅・gap なしで並べるので
// 幅は scroller の clientWidth そのもの。

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

// slideWidth が 0 なのは、まだ描かれていない（dialog を開く前）とき。数えずに先頭とする
export function snapIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0) return 0;
  return clampIndex(Math.round(scrollLeft / slideWidth), count);
}
