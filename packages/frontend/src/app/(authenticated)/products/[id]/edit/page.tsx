import type { Metadata } from 'next'
import { EditProductPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Modifica Prodotto',
}

export default function Page() {
  return <EditProductPage />
}
