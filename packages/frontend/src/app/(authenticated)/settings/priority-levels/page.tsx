import type { Metadata } from 'next'
import { PriorityLevelsPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Priority Allarmi',
}

export default function Page() {
  return <PriorityLevelsPage />
}
