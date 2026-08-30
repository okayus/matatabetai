// cookie の属性はすべて ORIGIN から導く。`secure: true` の決め打ちは http のローカル / e2e で
// cookie が黙って落ちる。Domain は付けない: 兄弟 Worker が <account>.workers.dev を共有する。
export function isHttps(origin: string): boolean {
  return origin.startsWith("https://");
}

// __Host- はブラウザが Secure + Path=/ + Domain なしを強制する。平文 http では拒否されるので
// ローカル / e2e は素の名前。
export function sessionCookieName(origin: string): string {
  return isHttps(origin) ? "__Host-session" : "session";
}

export function challengeCookieName(origin: string): string {
  return isHttps(origin) ? "__Host-challenge" : "challenge";
}

// 削除（Max-Age=0）にも同じ属性が要る: Hono は __Host- 名で secure が無いと throw し、
// ブラウザも Secure の無い __Host- の Set-Cookie を捨てる。
export function cookieBase(origin: string) {
  return { httpOnly: true, secure: isHttps(origin), sameSite: "Lax" as const, path: "/" };
}
