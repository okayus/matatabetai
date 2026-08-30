import type { CDPSession, Page } from "@playwright/test";

// Chromium の virtual authenticator（CDP）。DEV_BYPASS では register / login の配線を通らないので使わない。
// ページが navigator.credentials.create / get を呼ぶ前に有効にすること。
export type VirtualAuthenticator = { cdp: CDPSession; authenticatorId: string };

export async function enableVirtualAuthenticator(page: Page): Promise<VirtualAuthenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return { cdp, authenticatorId };
}
