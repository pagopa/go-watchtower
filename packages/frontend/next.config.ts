import path from 'node:path'
import { execSync } from 'node:child_process'
import type { NextConfig } from 'next'

function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'dev'
  }
}

function splitCsv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function toAllowedHost(value: string): string | undefined {
  try {
    return new URL(value).hostname
  } catch {
    return value
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0]
  }
}

function unique(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  )
}

function normalizePathPrefix(
  value: string | undefined,
  fallback: string
): string {
  const trimmed = value?.trim() || fallback
  const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return prefixed.replace(/\/+$/, '') || fallback
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function isAbsoluteHttpUrl(value: string | undefined): boolean {
  return (
    value?.startsWith('http://') === true ||
    value?.startsWith('https://') === true
  )
}

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
const apiProxyPrefix = normalizePathPrefix(
  process.env.NEXT_PUBLIC_API_PROXY_PREFIX,
  '/watchtower-api'
)
const apiProxyTarget = stripTrailingSlash(
  process.env.API_PROXY_TARGET ??
    process.env.API_URL_INTERNAL ??
    'http://localhost:3001'
)
const usesApiProxy =
  !publicApiUrl || stripTrailingSlash(publicApiUrl) === apiProxyPrefix
const allowedDevOrigins = unique([
  '192.168.178.118',
  '127.0.0.1',
  '*.ngrok-free.dev',
  ...splitCsv(process.env.NEXT_ALLOWED_DEV_ORIGINS).map(toAllowedHost),
  toAllowedHost(process.env.NEXTAUTH_URL ?? ''),
])
const serverActionAllowedOrigins =
  process.env.NODE_ENV === 'production'
    ? splitCsv(process.env.SERVER_ACTIONS_ALLOWED_ORIGINS)
        .map(toAllowedHost)
        .filter((host): host is string => Boolean(host))
    : allowedDevOrigins

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '0.0.0',
    NEXT_PUBLIC_BUILD_ID: process.env.BUILD_ID ?? getGitHash(),
  },
  reactStrictMode: process.env.NODE_ENV === 'production',
  transpilePackages: ['@go-watchtower/shared'],
  turbopack: {
    root: path.resolve(__dirname, '../../'),
  },
  images: {
    qualities: [75, 85, 100],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    ...(serverActionAllowedOrigins.length > 0 && {
      serverActions: {
        allowedOrigins: serverActionAllowedOrigins,
      },
    }),
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              [
                'connect-src',
                "'self'",
                ...(isAbsoluteHttpUrl(publicApiUrl)
                  ? [stripTrailingSlash(publicApiUrl)]
                  : []),
                'https://accounts.google.com',
                'https://oauth2.googleapis.com',
              ].join(' '),
              "frame-src 'self' https://accounts.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Redirect root to dashboard
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },

  async rewrites() {
    if (!usesApiProxy) return []

    return [
      {
        source: `${apiProxyPrefix}/:path*`,
        destination: `${apiProxyTarget}/:path*`,
      },
    ]
  },
}

export default nextConfig
