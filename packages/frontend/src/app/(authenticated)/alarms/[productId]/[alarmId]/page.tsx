import type { Metadata } from 'next'
import { AlarmDetailPageContent } from './_page-content'

export const metadata: Metadata = {
  title: 'Dettaglio Allarme',
}

export default function AlarmDetailPage() {
  return <AlarmDetailPageContent />
}
