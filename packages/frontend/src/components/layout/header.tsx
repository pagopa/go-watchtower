'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { api } from '@/lib/api-client'
import { useTheme } from 'next-themes'
import { LogOut, Moon, Sun, User } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { usePreferences } from '@/hooks/use-preferences'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export function Header() {
  const { data: session, status } = useSession()
  const { setTheme, resolvedTheme } = useTheme()
  const { preferences, updatePreferences } = usePreferences()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Sync theme from saved preferences on first load (cross-device)
  useEffect(() => {
    if (preferences.theme) {
      setTheme(preferences.theme)
    }
  }, [preferences.theme, setTheme])

  const toggleTheme = () => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    updatePreferences({ theme: newTheme })
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch {
      // ignore — backend may be unreachable, proceed with local signout anyway
    }
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-2.5">
        <Image src="/logo1.png" alt="" width={28} height={28} quality={100} sizes="28px" className="drop-shadow-sm" />
        <h1 className="font-display text-xl font-bold tracking-wide">Watchtower</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={mounted ? (resolvedTheme === 'dark' ? 'Attiva tema chiaro' : 'Attiva tema scuro') : 'Tema'}
        >
          {mounted
            ? resolvedTheme === 'dark'
              ? <Sun className="h-5 w-5" />
              : <Moon className="h-5 w-5" />
            : <Sun className="h-5 w-5 opacity-0" />}
        </Button>

        {status === 'loading' ? (
          <Skeleton className="h-10 w-32" />
        ) : session?.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2">
                <User className="h-4 w-4" />
                <span className="max-w-32 truncate">{session.user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session.user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ruolo: {session.user.roleName}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  Profilo
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  )
}
