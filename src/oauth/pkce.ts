import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

export function generateState(): string {
  return base64Url(randomBytes(32));
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(64));
}

export function createCodeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier, "ascii").digest());
}

export function validateState(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function isStateFresh(createdAt: number, now = Date.now(), ttlMs = 10 * 60_000): boolean {
  return createdAt <= now && now - createdAt <= ttlMs;
}
