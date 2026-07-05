import type { Metadata } from 'next'
import { SlackIngestorPageContent } from './_page-content'

export const metadata: Metadata = {
  title: 'Slack Ingestor',
}

export default function SlackIngestorPage() {
  return <SlackIngestorPageContent />
}
