import type { Metadata } from 'next'
import { IgnoreReasonsPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Motivi di Esclusione',
}

export default function Page() {
  return <IgnoreReasonsPage />
}
