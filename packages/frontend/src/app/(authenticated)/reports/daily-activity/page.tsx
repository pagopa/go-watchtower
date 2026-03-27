import type { Metadata } from 'next'
import { DailyActivityContent } from './_page-content'

export const metadata: Metadata = { title: 'Report - Timesheet' }

export default function Page() {
  return <DailyActivityContent />
}
