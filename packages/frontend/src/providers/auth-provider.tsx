'use client'

import { useEffect } from 'react'
import { SessionProvider, useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { setAccessToken } from '@/lib/auth-token'
import type { ReactNode } from 'react'

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Keeps the module-level access token in sync with the NextAuth session.
 * This allows api-client.ts to read the token synchronously instead of
 * calling getSession() (which makes an HTTP round-trip every time).
 */
function TokenSync({ children }: { children: ReactNode }) {
  const { data: session } = useSession()

  useEffect(() => {
    setAccessToken(session?.user?.accessToken ?? '')
  }, [session?.user?.accessToken])

  return <>{children}</>
}

/**
 * Watches the session for cleared/expired tokens and redirects to /login.
 *
 * When the JWT callback detects an expired refresh token it clears the token
 * fields (accessToken becomes empty string). The session callback then marks
 * the session with `expired: true`. This component detects that and performs
 * a single hard navigation to /login -- no signOut() call, no polling race.
 */
function ExpiredSessionRedirect({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()

  useEffect(() => {
    if (
      status === 'authenticated' &&
      !pathname.startsWith('/login') &&
      (session as { expired?: boolean } | null)?.expired
    ) {
      // signOut clears the NextAuth cookie and redirects to /login.
      // Using router.replace() would leave the stale cookie in place,
      // causing unnecessary JWT callback calls on every session poll.
      signOut({ callbackUrl: '/login' })
    }
  }, [status, session, pathname])

  return <>{children}</>
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <SessionProvider
      // Poll every 4 minutes to keep the access token fresh.
      // The access token expires after 14 minutes (backend: 15m, we use 14m
      // as margin). Without polling, the token expires silently and API calls
      // start failing with 401.
      //
      // Why this is safe:
      //  - Most polls just return the existing valid token (no refresh needed)
      //  - Actual refresh only happens every ~14 min (when the token expires)
      //  - The pendingRefreshes dedup Map + refreshCache in auth.ts prevent
      //    concurrent and near-concurrent refresh calls from triggering
      //    token-reuse detection on the backend
      //  - After laptop sleep: refetchOnWindowFocus fires first and refreshes
      //    the token; late-arriving requests get the cached result → no reuse
      refetchInterval={4 * 60}
      refetchOnWindowFocus={true}
      refetchWhenOffline={false}
    >
      <TokenSync>
        <ExpiredSessionRedirect>{children}</ExpiredSessionRedirect>
      </TokenSync>
    </SessionProvider>
  )
}
