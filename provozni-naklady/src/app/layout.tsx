import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Provozní náklady',
  description: 'Přehled a porovnání provozních nákladů s Costlockerem',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  )
}
