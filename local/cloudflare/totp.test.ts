import { describe, expect, it } from "vitest";
import { createTotpSecret, totpUri, verifyTotp } from "./totp";

describe("Cloudflare TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector with six digits and accepts one adjacent step", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    await expect(verifyTotp(secret, "287082", 59_000)).resolves.toBe(true);
    await expect(verifyTotp(secret, "287082", 89_000)).resolves.toBe(true);
    await expect(verifyTotp(secret, "287082", 119_000)).resolves.toBe(false);
    await expect(verifyTotp(secret, "28708", 59_000)).resolves.toBe(false);
  });

  it("creates a 160-bit secret and a standard authenticator URI", () => {
    const secret = createTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri("owner", secret)).toContain(`secret=${secret}`);
  });
});
