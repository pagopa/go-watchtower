import type { Metadata } from 'next'
import { ProductDetailPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Dettaglio Prodotto',
}

export default function Page() {
  return <ProductDetailPage />
}
