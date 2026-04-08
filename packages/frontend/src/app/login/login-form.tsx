'use client'

import { useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(1, 'La password è obbligatoria'),
})

type LoginFormData = z.infer<typeof loginSchema>

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Al momento l'autenticazione Google non funziona o va in timeout, riprovare più tardi",
  AccessDenied: 'Accesso negato. Il tuo account potrebbe non essere autorizzato.',
  OAuthAccountNotLinked: 'Questo account è già associato a un altro metodo di accesso.',
}

const GoogleIcon = () => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginFormContent />
    </Suspense>
  )
}

function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)

  const rawCallback = searchParams.get('callbackUrl') || '/dashboard'
  // Prevent open redirect: only allow relative paths (no protocol-relative URLs)
  const callbackUrl = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/dashboard'
  const error = searchParams.get('error')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Show auth error toast once when the page loads with an error query param
  const shownErrorRef = useRef<string | null>(null)
  if (error && shownErrorRef.current !== error) {
    shownErrorRef.current = error
    const decoded = decodeURIComponent(error)
    toast.error(AUTH_ERROR_MESSAGES[decoded] ?? 'Si è verificato un errore durante l\'autenticazione.')
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        toast.error('Credenziali non valide')
      } else {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch {
      toast.error('Errore durante il login')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    try {
      await signIn('google', { callbackUrl })
    } catch {
      toast.error('Errore durante il login con Google')
      setIsGoogleLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glow-breathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.12); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .logo-float  { animation: logo-float 6s ease-in-out infinite; }
        .glow-breathe { animation: glow-breathe 5s ease-in-out infinite; }
        .fade-up-1 { animation: fade-up 0.45s ease both 0.05s; }
        .fade-up-2 { animation: fade-up 0.45s ease both 0.15s; }
        .fade-up-3 { animation: fade-up 0.45s ease both 0.25s; }
        .fade-up-4 { animation: fade-up 0.45s ease both 0.35s; }
      `}</style>

      <div className="flex min-h-screen">

        {/* ── LEFT: Brand panel ── */}
        <div
          className="hidden lg:flex lg:w-[42%] relative flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #070b17 0%, #0c1428 50%, #070b17 100%)' }}
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          {/* Ambient glow */}
          <div
            className="glow-breathe absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.11) 0%, transparent 70%)' }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl pointer-events-none opacity-35"
            style={{ background: 'radial-gradient(circle, rgba(99,170,255,0.28) 0%, transparent 70%)' }}
          />

          {/* Edge hairlines */}
          <div className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(99,170,255,0.22), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(99,170,255,0.14), transparent)' }} />
          <div className="absolute inset-y-0 right-0 w-px"
            style={{ background: 'linear-gradient(to bottom, transparent, rgba(99,170,255,0.2) 30%, rgba(99,170,255,0.28) 50%, rgba(99,170,255,0.2) 70%, transparent)' }} />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-8 px-16 text-center">
            <div className="logo-float drop-shadow-2xl">
              <Image
                src="/logo1.png"
                alt="Watchtower"
                width={148}
                height={148}
                className="h-auto"
                priority
              />
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <p
                className="font-mono text-[10px] tracking-[0.35em] uppercase"
                style={{ color: 'rgba(99,170,255,0.5)' }}
              >
                PagoPa · GO Team
              </p>
              <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-[0.06em] text-white">
                Watchtower
              </h1>
              <p
                className="mt-2 text-sm font-medium tracking-wide"
                style={{ color: 'rgba(203,213,225,0.8)' }}
              >
                Monitora. Analizza. Risolvi.
              </p>
              <p
                className="mt-1 max-w-[240px] text-xs leading-relaxed text-center"
                style={{ color: 'rgba(148,163,184,0.5)' }}
              >
                Veglia sull&apos;infrastruttura digitale di PagoPa 24 ore su 24.
                Un punto unico di osservazione per allarmi, incidenti e azioni.
              </p>
            </div>
          </div>

          {/* Bottom note */}
          <div className="absolute bottom-7 left-0 right-0 flex justify-center">
            <p className="font-mono text-[11px] tracking-[0.2em]"
              style={{ color: 'rgba(100,116,139,0.45)' }}>
              solo account @pagopa.it
            </p>
          </div>
        </div>

        {/* ── RIGHT: Form panel ── */}
        {/*
          Force light-mode CSS variable values on this container so that
          shadcn components (which read CSS vars) always render in light mode,
          regardless of the global dark theme set by ThemeProvider.
        */}
        <div
          className="flex flex-1 flex-col items-center justify-center px-8 py-16 lg:px-14"
          style={{
            backgroundColor: '#ffffff',
            '--background': '0 0% 100%',
            '--foreground': '222.2 84% 4.9%',
            '--card': '0 0% 100%',
            '--card-foreground': '222.2 84% 4.9%',
            '--primary': '222.2 47.4% 11.2%',
            '--primary-foreground': '210 40% 98%',
            '--secondary': '210 40% 96.1%',
            '--secondary-foreground': '222.2 47.4% 11.2%',
            '--muted': '210 40% 96.1%',
            '--muted-foreground': '215.4 16.3% 46.9%',
            '--accent': '210 40% 96.1%',
            '--accent-foreground': '222.2 47.4% 11.2%',
            '--destructive': '0 84.2% 60.2%',
            '--destructive-foreground': '210 40% 98%',
            '--border': '214.3 31.8% 91.4%',
            '--input': '214.3 31.8% 91.4%',
            '--ring': '222.2 84% 4.9%',
          } as React.CSSProperties}
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-10 fade-up-1">
            <Image src="/logo1.png" alt="" width={64} height={64} className="mb-3" priority />
            <h1 className="font-display text-lg font-bold tracking-[0.06em] uppercase" style={{ color: '#111827' }}>
              Watchtower
            </h1>
          </div>

          <div className="w-full max-w-[340px]">

            {/* Heading */}
            <div className="mb-7 fade-up-1">
              <h2 className="text-2xl font-semibold tracking-tight" style={{ color: '#111827' }}>
                Accedi
              </h2>
              <p className="mt-1 text-sm" style={{ color: '#9ca3af' }}>
                Accedi con il tuo account PagoPa
              </p>
            </div>

            {/* ── PRIMARY: Google SSO ── */}
            <div className="fade-up-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-md font-medium transition-colors"
                style={{
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #e5e7eb',
                  color: '#374151',
                  cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
                  opacity: isGoogleLoading ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!isGoogleLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff' }}
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#6b7280' }} />
                ) : (
                  <GoogleIcon />
                )}
                <span className="text-sm">Accedi con Google</span>
              </button>
            </div>

            {/* ── TOGGLE: show credentials form ── */}
            <div className="mt-5 fade-up-3">
              <button
                type="button"
                onClick={() => setShowCredentials((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 text-xs transition-colors"
                style={{ color: showCredentials ? '#6b7280' : '#9ca3af' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#374151' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = showCredentials ? '#6b7280' : '#9ca3af' }}
              >
                <span>{showCredentials ? 'Nascondi accesso con email' : 'Accedi con email e password'}</span>
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform duration-200"
                  style={{ transform: showCredentials ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
            </div>

            {/* ── SECONDARY: Credentials form (collapsible) ── */}
            <div
              style={{
                overflow: 'hidden',
                maxHeight: showCredentials ? '340px' : '0',
                transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4 pt-5"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium"
                    style={{ color: '#374151' }}
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="nome@pagopa.it"
                    {...register('email')}
                    disabled={isLoading}
                    className="block w-full rounded-md px-3 text-sm transition-colors outline-none"
                    style={{
                      height: '44px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      color: '#111827',
                    }}
                    onFocus={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#6b7280' }}
                    onBlur={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#e5e7eb' }}
                  />
                  {errors.email && (
                    <p className="text-xs" style={{ color: '#dc2626' }}>{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium"
                    style={{ color: '#374151' }}
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    {...register('password')}
                    disabled={isLoading}
                    className="block w-full rounded-md px-3 text-sm transition-colors outline-none"
                    style={{
                      height: '44px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      color: '#111827',
                    }}
                    onFocus={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#6b7280' }}
                    onBlur={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#e5e7eb' }}
                  />
                  {errors.password && (
                    <p className="text-xs" style={{ color: '#dc2626' }}>{errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center rounded-md text-sm font-medium tracking-wide transition-opacity"
                  style={{
                    backgroundColor: '#070b17',
                    color: '#ffffff',
                    opacity: isLoading ? 0.7 : 1,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLElement).style.backgroundColor = '#0c1428' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#070b17' }}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accedi con email
                </button>
              </form>
            </div>

            {/* Footer note */}
            <div className="fade-up-4 mt-8 text-center">
              <p className="text-xs" style={{ color: '#d1d5db' }}>
                Solo account @pagopa.it sono autorizzati
              </p>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
