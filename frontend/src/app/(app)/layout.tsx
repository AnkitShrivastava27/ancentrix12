'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, license, checkSetup, fetchMe, fetchLicense, fetchCompany } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      if (!token) {
        const needsSetup = await checkSetup()
        if (needsSetup) { router.replace('/setup'); return }
        router.replace('/login')
        return
      }
      // Token exists — set ready immediately, fetch data in background
      setReady(true)
      // Background refresh — non-blocking
      Promise.all([fetchMe(), fetchLicense(), fetchCompany()]).catch(() => {
        // If fetchMe fails (bad token), log out and redirect
        useAuthStore.getState().logout()
        router.replace('/login')
      })
    })()
  }, [])

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(108,92,231,0.2)', borderTopColor: '#6c5ce7', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 14, color: '#545868' }}>Loading…</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0b0f' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', minWidth: 0 }}>
        {license && license.active && license.days_remaining !== null && license.days_remaining < 30 && (
          <div style={{ padding: '10px 16px', borderRadius: 9, background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)', color: '#f0a500', fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠ Your license expires in <strong>{license.days_remaining} days</strong>. Contact your vendor to renew.</span>
            <a href="/license" style={{ color: '#f0a500', fontSize: 12, textDecoration: 'underline' }}>View details</a>
          </div>
        )}
        {license && !license.active && (
          <div style={{ padding: '10px 16px', borderRadius: 9, background: 'rgba(232,84,84,0.07)', border: '1px solid rgba(232,84,84,0.25)', color: '#e85454', fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>❌ License expired — outbound calls are blocked. Contact your vendor to renew.</span>
            <a href="/license" style={{ color: '#e85454', fontSize: 12, textDecoration: 'underline' }}>View license</a>
          </div>
        )}
        {children}
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box }
        body { margin: 0 }
        ::-webkit-scrollbar { width: 6px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15) }
      `}</style>
    </div>
  )
}