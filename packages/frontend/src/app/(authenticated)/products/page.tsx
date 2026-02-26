import type { Metadata } from 'next'
import { ProductsPage } from './_page-content'

export const metadata: Metadata = {
  title: 'Prodotti',
}

export default function Page() {
  return <ProductsPage />
}
