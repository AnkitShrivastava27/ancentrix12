'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { authApi, apiClient } from '@/lib/api'

const T = {
  bg: '#0a0b0f', surface: '#111318', surface2: '#181b22',
  border: 'rgba(255,255,255,0.07)', text: '#edeef2', text2: '#9095a8',
  text3: '#545868', accent: '#6c5ce7', red: '#e85454',
}

export default function LoginPage() {
  const router  = useRouter()
  const { setToken } = useAuthStore()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true

    ;(async () => {
      try {
        const data: any = await authApi.setupStatus()
        if (!activeRef.current) return

        if (!data.setup_complete) {
          router.replace('/setup')
          return
        }

        // Check if already logged in via stored token
        const stored = localStorage.getItem('aical-auth-v2')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            const token  = parsed?.state?.token
            if (token) {
              apiClient.setToken(token)
              await authApi.me()           // throws 401 if expired
              if (!activeRef.current) return
              router.replace('/dashboard')
              return
            }
          } catch {
            // Token invalid or expired — clear it and show login form
            localStorage.removeItem('aical-auth-v2')
            apiClient.setToken(null)
          }
        }
      } catch {
        // setupStatus failed (network down etc) — still show the form
      } finally {
        // Always runs — guarantees spinner never gets permanently stuck
        if (activeRef.current) setLoading(false)
      }
    })()

    return () => { activeRef.current = false }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Enter your email and password'); return }
    setLoading(true); setError('')
    try {
      const data: any = await authApi.login({ email, password })
      const storeData = { state: { token: data.token, user: data.user, company: null, license: null }, version: 0 }
      localStorage.setItem('aical-auth-v2', JSON.stringify(storeData))
      apiClient.setToken(data.token)
      setToken(data.token)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your credentials.')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9,
    padding: '11px 14px', fontSize: 15, color: T.text, outline: 'none',
    fontFamily: 'inherit', width: '100%',
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(108,92,231,0.2)', borderTopColor: '#6c5ce7', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`* { box-sizing: border-box } @keyframes spin { to { transform: rotate(360deg) } } input:focus { border-color: #6c5ce7 !important; outline: none }`}</style>
      <div style={{ width: '100%', maxWidth: 420 }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg, #6c5ce7, #a594ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>AI</div>
            <span style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: '-0.02em' }}>Call Center</span>
          </div>
          <p style={{ fontSize: 15, color: T.text2, margin: 0 }}>Sign in to your workspace</p>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 28px', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@yourcompany.com" style={inputStyle} autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
            </div>
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(232,84,84,0.08)', border: '1px solid rgba(232,84,84,0.2)', borderRadius: 9, fontSize: 14, color: T.red }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{ background: '#6c5ce7', border: 'none', borderRadius: 9, padding: '13px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Sign in
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: T.text3, marginTop: 20 }}>
          AI Call Center v2 · White-Label Edition
        </p>
      </div>
    </div>
  )
}