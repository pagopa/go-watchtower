import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Login',
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel skeleton */}
      <div className="hidden lg:flex lg:w-[42%] items-center justify-center"
        style={{ background: '#070b17' }}>
        <div className="flex flex-col items-center gap-8 opacity-20">
          <div className="h-36 w-36 rounded-2xl bg-white/30" />
          <div className="space-y-3 text-center">
            <div className="mx-auto h-3 w-16 rounded bg-white/30" />
            <div className="mx-auto h-8 w-48 rounded bg-white/30" />
          </div>
        </div>
      </div>
      {/* Form panel skeleton */}
      <div className="flex flex-1 items-center justify-center bg-white px-8 py-16 lg:px-14">
        <div className="w-full max-w-[340px] space-y-4">
          <div className="h-7 w-24 rounded bg-gray-100" />
          <div className="h-4 w-48 rounded bg-gray-100" />
          <div className="pt-4 space-y-3">
            <div className="h-11 w-full rounded-lg bg-gray-100" />
            <div className="h-11 w-full rounded-lg bg-gray-100" />
            <div className="h-11 w-full rounded-lg bg-gray-200" />
          </div>
          <div className="pt-2 h-11 w-full rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
