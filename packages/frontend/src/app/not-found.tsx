import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Pagina non trovata</CardTitle>
          <CardDescription>
            La pagina che stai cercando non esiste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/dashboard">Torna alla Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
