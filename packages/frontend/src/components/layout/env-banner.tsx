'use client'

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV

const ENV_CONFIG: Record<string, { label: string; className: string }> = {
  development: {
    label: 'DEVELOPMENT',
    className: 'bg-orange-500 text-white',
  },
  staging: {
    label: 'STAGING',
    className: 'bg-amber-500 text-white',
  },
  test: {
    label: 'TEST',
    className: 'bg-purple-500 text-white',
  },
}

export function EnvBanner() {
  if (!APP_ENV) return null
  const config = ENV_CONFIG[APP_ENV] ?? { label: APP_ENV.toUpperCase(), className: 'bg-orange-500 text-white' }

  return (
    <div className={`flex h-6 items-center justify-center text-[10px] font-bold tracking-[0.2em] ${config.className}`}>
      {config.label}
    </div>
  )
}
