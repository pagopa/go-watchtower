import type { Metadata } from 'next'
import { RolesPage } from './_page-content'

export const metadata: Metadata = { title: 'Gestione Ruoli' }

export default function Page() {
  return <RolesPage />
}
