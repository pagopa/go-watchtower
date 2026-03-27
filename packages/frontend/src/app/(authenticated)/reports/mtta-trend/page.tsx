import type { Metadata } from 'next'
import { MttaTrendContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - Trend MTTA/MTTR' }

export default function Page() {
  return <MttaTrendContent />
}
