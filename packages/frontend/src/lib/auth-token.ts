/**
 * Module-level access token store.
 *
 * The SessionProvider (via TokenSync in auth-provider.tsx) keeps this in sync
 * with the NextAuth session. The api-client reads the token synchronously
 * instead of calling getSession() (which makes an HTTP round-trip every time).
 *
 * This eliminates the N+1 session call problem: N API requests no longer
 * produce N extra GET /api/auth/session calls.
 */

let _accessToken = ''

export function setAccessToken(token: string): void {
  _accessToken = token
}

export function getAccessToken(): string {
  return _accessToken
}
