'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Authenticated section error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-destructive">Errore</CardTitle>
          <CardDescription>
            Si è verificato un errore durante il caricamento della pagina.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Qualcosa è andato storto.
          </p>
          <Button onClick={reset} className="w-full">
            Riprova
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
