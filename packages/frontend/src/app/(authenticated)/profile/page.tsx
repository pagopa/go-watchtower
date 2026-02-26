import type { Metadata } from 'next'
import { ProfilePageContent } from './_page-content'

export const metadata: Metadata = {
  title: 'Profilo',
  description: 'Gestisci i tuoi dati e le preferenze dell\'interfaccia.',
}

export default function ProfilePage() {
  return <ProfilePageContent />
}
