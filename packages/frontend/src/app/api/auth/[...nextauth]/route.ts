import { handlers } from '@/lib/auth'
import { NextRequest } from 'next/server'

function lastForwardedValue(value: string | null): string | null {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1) ?? null
}

function isAllowedAuthHost(host: string): boolean {
  const hostname = host.split(':')[0]?.toLowerCase()
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.ngrok-free.dev')
  )
}

function originFromHeaders(request: NextRequest): string | null {
  const forwardedHost = lastForwardedValue(request.headers.get('x-forwarded-host'))
  const host = forwardedHost ?? request.headers.get('host')
  if (!host || !isAllowedAuthHost(host)) return null

  const forwardedProto = lastForwardedValue(request.headers.get('x-forwarded-proto'))
  const protocol = forwardedProto ?? request.nextUrl.protocol.replace(/:$/, '')

  if (protocol !== 'http' && protocol !== 'https') return null
  return `${protocol}://${host}`
}

function originFromReferer(request: NextRequest): string | null {
  const referer = request.headers.get('referer')
  if (!referer) return null

  try {
    const url = new URL(referer)
    return isAllowedAuthHost(url.host) ? url.origin : null
  } catch {
    return null
  }
}

function normalizeAuthRequest(request: NextRequest): NextRequest {
  const origin = originFromHeaders(request) ?? originFromReferer(request)
  if (!origin || origin === request.nextUrl.origin) return request

  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, origin)
  const headers = new Headers(request.headers)
  headers.set('host', url.host)
  headers.set('x-forwarded-host', url.host)
  headers.set('x-forwarded-proto', url.protocol.replace(/:$/, ''))

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    body: request.body,
  }
  if (request.body) init.duplex = 'half'

  return new NextRequest(url, init as never)
}

export const GET = (request: NextRequest) => handlers.GET(normalizeAuthRequest(request))
export const POST = (request: NextRequest) => handlers.POST(normalizeAuthRequest(request))
