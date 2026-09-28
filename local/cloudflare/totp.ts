const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function createTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let output = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeSecret(secret: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of secret.toUpperCase().replace(/\s|=/g, "")) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function codeAt(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", decodeSecret(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const payload = new ArrayBuffer(8);
  new DataView(payload).setBigUint64(0, BigInt(counter));
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret: string, input: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(input)) return false;
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) {
    const expected = await codeAt(secret, counter + drift);
    let difference = 0;
    for (let index = 0; index < 6; index++) difference |= expected.charCodeAt(index) ^ input.charCodeAt(index);
    if (difference === 0) return true;
  }
  return false;
}

export function totpUri(username: string, secret: string): string {
  const params = new URLSearchParams({ secret, issuer: "SubBoost", algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(`SubBoost:${username}`)}?${params}`;
}
