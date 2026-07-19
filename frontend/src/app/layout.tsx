import type { Metadata } from 'next'
// Ignore missing type declarations for CSS side-effect import in this project setup
// @ts-ignore
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'AI Call Center',
  description: 'AI-powered call center platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" toastOptions={{
          style: {
            background: '#111318',
            color: '#edeef2',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            fontSize: '14px',
            padding: '10px 14px',
          },
        }} />
        {children}
      </body>
    </html>
  )
}