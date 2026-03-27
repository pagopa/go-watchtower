import type { Metadata } from 'next'
import { OperatorWorkloadContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - Carico operatori' }

export default function Page() {
  return <OperatorWorkloadContent />
}
