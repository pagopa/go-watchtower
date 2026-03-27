import type { Metadata } from 'next'
import { AlarmRankingContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - Classifica allarmi' }

export default function Page() {
  return <AlarmRankingContent />
}
