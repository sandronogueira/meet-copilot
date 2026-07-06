import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Bricolage_Grotesque, Instrument_Sans, Spline_Sans_Mono } from 'next/font/google'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['500', '700', '800'],
})

const instrument = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument',
})

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Meet Copilot',
  description: 'Entre na reunião sem saber nada e saia como especialista.',
  robots: { index: false }, // remover quando a landing oficial entrar
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${instrument.variable} ${splineMono.variable}`}>
      <body>
        <div className="atmosphere" aria-hidden />
        {children}
      </body>
    </html>
  )
}
