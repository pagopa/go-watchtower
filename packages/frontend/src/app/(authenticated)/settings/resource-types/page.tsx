import type { Metadata } from 'next'
import { ResourceTypesPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Tipi Risorsa',
}

export default function Page() {
  return <ResourceTypesPage />
}
