import { useSyncExternalStore } from "react";

// 家族数人のアプリに要るのは pathname の購読と push/replace だけ。
// 招待トークンはフラグメント（#token=…）に置くので、ここでは扱わない（サーバーにも届かない）。
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

export function usePath(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  );
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  for (const l of listeners) l();
}

// "/spaces/:spaceId/settings" のような pattern を path に当てる。合わなければ null
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/");
  const s = path.split("/");
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] ?? "";
    const val = s[i] ?? "";
    if (seg.startsWith(":")) {
      if (val === "") return null;
      params[seg.slice(1)] = decodeURIComponent(val);
    } else if (seg !== val) {
      return null;
    }
  }
  return params;
}
