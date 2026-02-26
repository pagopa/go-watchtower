import type { Metadata } from 'next'
import { NewProductPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Nuovo Prodotto',
}

export default function Page() {
  return <NewProductPage />
}
