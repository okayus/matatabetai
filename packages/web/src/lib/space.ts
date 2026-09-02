import type { SpaceSummary } from "../api";

// スペース切替 UI は当面持たない（requirements backlog）。ホームもふりかえりも
// 同じ規則で 1 つに決める: 自分が owner のスペース優先、なければ最初の所属先
export function primarySpace(spaces: readonly SpaceSummary[]): SpaceSummary | undefined {
  return spaces.find((s) => s.role === "owner") ?? spaces[0];
}
