import type { Metadata } from 'next'
import { EditUserPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Modifica Utente',
}

export default function Page() {
  return <EditUserPage />
}
