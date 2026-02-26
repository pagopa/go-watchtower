import type { Metadata } from 'next'
import { NewUserPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Nuovo Utente',
}

export default function Page() {
  return <NewUserPage />
}
