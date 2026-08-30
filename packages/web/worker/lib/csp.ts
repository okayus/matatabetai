// secureHeaders に渡す CSP。本番（https）は inline なし。
// http（vite dev / e2e）は Vite の HMR preamble（inline script）と <style> 注入が要るので緩める。
// スキームで分けるので本番 ORIGIN（https）に開発用の緩和が漏れることはない。
export function contentSecurityPolicy(https: boolean) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: https ? ["'self'"] : ["'self'", "'unsafe-inline'"],
    styleSrc: https ? ["'self'"] : ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: https ? ["'self'"] : ["'self'", "ws:", "wss:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };
}

export function securityHeaderOptions(https: boolean) {
  return {
    contentSecurityPolicy: contentSecurityPolicy(https),
    xFrameOptions: "DENY",
    referrerPolicy: "strict-origin-when-cross-origin",
    // 本番は同一ホストだけ。http のときは無意味なので出さない
    strictTransportSecurity: https ? "max-age=31536000; includeSubDomains" : false,
    crossOriginEmbedderPolicy: false,
    permissionsPolicy: { camera: [] as string[], microphone: [] as string[], geolocation: [] as string[] },
  };
}
