import type { Metadata } from 'next'
import { UserDetailPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Dettaglio Utente',
}

export default function Page() {
  return <UserDetailPage />
}
