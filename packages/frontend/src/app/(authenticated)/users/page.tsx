import type { Metadata } from 'next'
import { UsersPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Utenti',
}

export default function Page() {
  return <UsersPage />
}
