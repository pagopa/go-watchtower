import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const token = req.auth
  // A session exists only if it contains a non-empty accessToken.
  // When a refresh token expires, the JWT callback clears all token fields
  // but the cookie may still exist briefly. We must treat that as
  // unauthenticated to avoid redirect loops.
  const isAuthenticated = !!token?.user?.accessToken

  const isLoginPage = req.nextUrl.pathname.startsWith('/login')

  // Allow login page (public)
  if (isLoginPage) {
    // Redirect authenticated users away from login page
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Redirect unauthenticated users to login
  if (!isAuthenticated) {
    const callbackUrl = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.url))
  }

  // Server-side authorization: block GUEST users from admin-only routes.
  // This is defense-in-depth — the backend also enforces permissions on every API call.
  const roleName = token?.user?.roleName
  const pathname = req.nextUrl.pathname
  const adminOnlyRoutes = ['/settings/parameters', '/users/new']
  const isAdminRoute = adminOnlyRoutes.some((r) => pathname.startsWith(r)) ||
    /^\/users\/[^/]+\/edit$/.test(pathname)
  if (isAdminRoute && roleName === 'GUEST') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth endpoints — handled by their own route handlers;
     *   running the middleware's auth() wrapper on these causes a double
     *   JWT-callback invocation that triggers refresh-token rotation twice,
     *   which the backend treats as token reuse and revokes ALL tokens)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
