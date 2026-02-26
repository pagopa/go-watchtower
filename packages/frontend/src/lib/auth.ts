import NextAuth, { type NextAuthConfig } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import type { JWT } from 'next-auth/jwt'

// API URL for server-side requests (internal Docker network or external)
const API_URL = process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Session duration must cover the full refresh-token lifetime (7 days).
// The NextAuth JWT cookie holds the refresh token — if the cookie expires
// before the refresh token, the user loses the ability to silently renew.
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

// Access token margin: refresh a bit before the backend expires it (15m).
// Using 14 minutes to account for clock skew and network latency.
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000

// Refresh token lifetime on the backend (7 days). Used to track expiry
// client-side so we know when a refresh is hopeless (avoid pointless calls).
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

interface ExtendedJWT extends JWT {
  id: string
  email: string
  name: string
  roleName: string
  accessToken: string
  refreshToken: string
  accessTokenExpires: number
  // Timestamp when the current refresh token was issued. Used to compute
  // whether the refresh token has likely expired, avoiding a doomed refresh
  // call that would trigger token-reuse detection on the backend.
  refreshTokenIssuedAt: number
}

// Deduplicates concurrent refresh calls for the same refresh token AND
// caches results for a short window to handle late-arriving requests.
//
// Race condition this solves:
//   1. User returns from inactivity → refetchOnWindowFocus fires Request A
//   2. Request A refreshes → new tokens → promise resolves → Map entry deleted
//   3. Browser hasn't processed Set-Cookie yet (old cookie still in jar)
//   4. refetchInterval fires Request B with the OLD cookie
//   5. Without cache: Request B sends the old (rotated) refresh token → backend
//      detects reuse → revokes all tokens → user logged out
//   6. With cache: Request B finds the cached result → gets the new tokens → OK
const pendingRefreshes = new Map<string, Promise<ExtendedJWT | null>>()
const refreshCache = new Map<string, { result: ExtendedJWT | null; expiresAt: number }>()
const REFRESH_CACHE_TTL_MS = 60_000 // keep result for 60s after resolution

async function refreshAccessToken(token: ExtendedJWT): Promise<ExtendedJWT | null> {
  // If the refresh token itself has expired, don't even try — it would fail
  // and the backend would see a revoked/expired token.
  if (token.refreshTokenIssuedAt) {
    const refreshAge = Date.now() - token.refreshTokenIssuedAt
    if (refreshAge >= REFRESH_TOKEN_LIFETIME_MS) {
      console.error('[auth] Refresh token lifetime exceeded, clearing session')
      return null
    }
  }

  const key = token.refreshToken

  // 1. Check resolved cache (handles late-arriving requests after cookie lag)
  const cached = refreshCache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result
  }

  // 2. If a refresh is already in-flight for this exact token, reuse it
  const existing = pendingRefreshes.get(key)
  if (existing) return existing

  const promise = doRefreshAccessToken(token)
    .then((result) => {
      // Cache the result so late-arriving requests with the same old token
      // get the new tokens instead of attempting another (doomed) refresh
      refreshCache.set(key, { result, expiresAt: Date.now() + REFRESH_CACHE_TTL_MS })
      return result
    })
    .finally(() => {
      pendingRefreshes.delete(key)
    })
  pendingRefreshes.set(key, promise)
  return promise
}

async function doRefreshAccessToken(token: ExtendedJWT): Promise<ExtendedJWT | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error(`[auth] Refresh failed: ${response.status} ${body}`)
      throw new Error('Refresh token failed')
    }

    const data = await response.json()

    return {
      ...token,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
      refreshTokenIssuedAt: Date.now(),
    }
  } catch (err) {
    console.error('[auth] Refresh token expired or invalid, clearing session', err)
    return null
  }
}

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
            signal: AbortSignal.timeout(10_000),
          })

          if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.message || 'Credenziali non valide')
          }

          const data = await response.json()

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            roleName: data.user.role,  // Backend returns 'role', not 'roleName'
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          }
        } catch (error) {
          console.error('Login error:', error)
          return null
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          hd: 'pagopa.it', // Restrict to pagopa.it domain
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // For Google OAuth, we need to call our backend to create/get user
      if (account?.provider === 'google') {
        try {
          const response = await fetch(`${API_URL}/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: account.id_token,
              accessToken: account.access_token,
            }),
            signal: AbortSignal.timeout(10_000),
          })

          if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            console.error('API response error:', response.status, error)
            throw new Error(error.error || error.message || 'Autenticazione Google fallita')
          }

          const data = await response.json()

          // Update user object with backend data
          user.id = data.user.id
          user.email = data.user.email
          user.name = data.user.name
          user.roleName = data.user.role  // Backend returns 'role', not 'roleName'
          user.accessToken = data.accessToken
          user.refreshToken = data.refreshToken

          return true
        } catch (error) {
          console.error('Google auth error:', error)
          return `/login?error=${encodeURIComponent((error as Error).message || 'Errore autenticazione Google')}`
        }
      }

      return true
    },
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user && account) {
        return {
          ...token,
          id: user.id,
          email: user.email ?? '',
          name: user.name ?? '',
          roleName: user.roleName,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_LIFETIME_MS,
          refreshTokenIssuedAt: Date.now(),
        } as ExtendedJWT
      }

      const extendedToken = token as ExtendedJWT

      // If the token was previously cleared (no accessToken), return as-is
      // so the session remains null until the cookie expires naturally.
      if (!extendedToken.accessToken) {
        return token
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < extendedToken.accessTokenExpires) {
        return extendedToken
      }

      // Access token has expired, try to refresh it.
      // If refresh fails, returns null -- we clear the token fields so the
      // session callback will produce an empty/invalid session, and the
      // middleware will treat the user as unauthenticated.
      const refreshed = await refreshAccessToken(extendedToken)
      if (!refreshed) {
        // Clear all auth-related fields. The JWT cookie still exists but
        // contains no usable tokens. The session callback checks for
        // accessToken and returns a session without user data, causing
        // useSession() to report unauthenticated status.
        return {
          ...token,
          id: '',
          email: '',
          name: '',
          roleName: '',
          accessToken: '',
          refreshToken: '',
          accessTokenExpires: 0,
          refreshTokenIssuedAt: 0,
        } as ExtendedJWT
      }

      return refreshed
    },
    async session({ session, token }) {
      const extendedToken = token as ExtendedJWT

      // If the token has been cleared (refresh failed), return a minimal
      // session with no user data. This causes useSession() to report
      // { status: "unauthenticated" } on the client.
      if (!extendedToken.accessToken) {
        return {
          ...session,
          user: {
            ...session.user,
            id: '',
            email: '',
            name: '',
            roleName: '',
            accessToken: '',
            refreshToken: '',
          },
          expired: true,
        }
      }

      return {
        ...session,
        user: {
          ...session.user,
          id: extendedToken.id,
          email: extendedToken.email,
          name: extendedToken.name,
          roleName: extendedToken.roleName,
          accessToken: extendedToken.accessToken,
          refreshToken: extendedToken.refreshToken,
        },
      }
    },
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
