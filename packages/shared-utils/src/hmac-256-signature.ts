const encoder = new TextEncoder();

export async function createSignature(secret: string = "", payload: string) {
  if (!secret) {
    secret = "DEFAULT";
  }

  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

  const keyBytes = encoder.encode(secret);
  const extractable = false;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    algorithm,
    extractable,
    ["sign", "verify"]
  );

  const signature = await crypto.subtle.sign(
    algorithm,
    key,
    encoder.encode(payload)
  );

  return `sha256=${toHexString(signature)}`;
}

function toHexString(signature: ArrayBuffer) {
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySignature(
  secret: string,
  header: string,
  payload: string
) {
  if (!secret) {
    secret = "DEFAULT";
  }

  const parts = header.split("=");
  const sigHex = parts[1]!;

  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

  const keyBytes = encoder.encode(secret);
  const extractable = false;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    algorithm,
    extractable,
    ["sign", "verify"]
  );

  const sigBytes = hexToBytes(sigHex);
  const dataBytes = encoder.encode(payload);
  const equal = await crypto.subtle.verify(
    algorithm.name,
    key,
    sigBytes,
    dataBytes
  );

  return equal;
}

function hexToBytes(hex: string) {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);

  let index = 0;
  for (let i = 0; i < hex.length; i += 2) {
    const c = hex.slice(i, i + 2);
    const b = parseInt(c, 16);
    bytes[index] = b;
    index += 1;
  }

  return bytes;
}
