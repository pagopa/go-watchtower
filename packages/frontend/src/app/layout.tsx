import type { Metadata } from 'next'
import { Figtree, Cinzel } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import './globals.css'

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
})

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
  weight: ['400', '700', '900'],
})

const appEnv = process.env.NEXT_PUBLIC_APP_ENV
const appName = appEnv ? `Watchtower [${appEnv.toUpperCase()}]` : 'Watchtower'

export const metadata: Metadata = {
  title: {
    template: `%s | ${appName}`,
    default: appName,
  },
  description: "Watchtower veglia sull'infrastruttura digitale di PagoPa 24 ore su 24. Un punto unico di osservazione per allarmi, incidenti e azioni — perché nessun problema passi inosservato.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${figtree.variable} ${cinzel.variable} font-sans`}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster richColors position="top-right" />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
