import type { Metadata } from 'next'
import { SystemParametersPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Configurazioni',
}

export default function Page() {
  return <SystemParametersPage />
}
