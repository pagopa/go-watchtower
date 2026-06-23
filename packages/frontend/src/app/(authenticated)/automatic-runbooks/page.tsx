import type { Metadata } from 'next'
import { AutomaticRunbooksPageContent } from './_page-content'

export const metadata: Metadata = {
  title: 'Runbook automatici',
}

export default function AutomaticRunbooksPage() {
  return <AutomaticRunbooksPageContent />
}
