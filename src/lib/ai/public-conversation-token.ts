import { createHash, randomBytes } from "node:crypto";

export function createPublicConversationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashPublicConversationToken(token) };
}

export function hashPublicConversationToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function isPlausiblePublicConversationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,86}$/.test(token.trim());
}
