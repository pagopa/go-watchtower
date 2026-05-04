import crypto from "node:crypto";

const REFRESH_TOKEN_ROTATION_CONTEXT =
  "go-watchtower:refresh-token-rotation:v1";

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function deriveRotatedRefreshToken(
  token: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(REFRESH_TOKEN_ROTATION_CONTEXT)
    .update("\0")
    .update(token)
    .digest("base64url");
}

export function isRecentRotationReuse(
  refreshToken: { revokedAt: Date | null; replacedBy: string | null },
  expectedReplacementHash: string,
  graceSeconds: number,
  now = new Date(),
): boolean {
  if (!refreshToken.revokedAt || !refreshToken.replacedBy) {
    return false;
  }

  return (
    refreshToken.replacedBy === expectedReplacementHash &&
    now.getTime() - refreshToken.revokedAt.getTime() <= graceSeconds * 1000
  );
}
