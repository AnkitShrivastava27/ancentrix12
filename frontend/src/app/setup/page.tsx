'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import { apiClient } from '@/lib/api'

const T = {
  bg: '#0a0b0f', surface: '#111318', surface2: '#181b22',
  border: 'rgba(255,255,255,0.07)', text: '#edeef2', text2: '#9095a8',
  text3: '#545868', accent: '#6c5ce7', green: '#00d4aa', red: '#e85454',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 12, color: T.text3, lineHeight: 1.5 }}>{hint}</span>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9,
  padding: '10px 14px', fontSize: 14, color: T.text, outline: 'none',
  fontFamily: 'inherit', width: '100%',
}

const STEPS = [
  { id: 1, label: 'License Key',    icon: '🔑' },
  { id: 2, label: 'Admin Account',  icon: '👤' },
  { id: 3, label: 'Ready',          icon: '🚀' },
]

export default function SetupPage() {
  const router = useRouter()
  const { setToken } = useAuthStore()

  const [step,    setStep]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const [licenseKey, setLicenseKey] = useState('')
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', full_name: '' })
  const [result, setResult] = useState<any>(null)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const validateLicense = async () => {
    if (!licenseKey.trim()) { setError('Enter your license key'); return }
    setLoading(true); setError('')
    try {
      // Just check format for now — actual validation happens on submit
      if (!licenseKey.startsWith('AICAL-')) {
        setError('Invalid license key format. Should start with AICAL-')
        setLoading(false); return
      }
      setStep(2)
    } finally { setLoading(false) }
  }

  const submit = async () => {
    if (!form.email || !form.password || !form.full_name) { setError('All fields are required'); return }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true); setError('')
    try {
      const data: any = await authApi.setup({
        license_key: licenseKey,
        email:       form.email,
        password:    form.password,
        full_name:   form.full_name,
      })
      // Set token in both axios client and store immediately
      apiClient.setToken(data.token)
      setToken(data.token)
      setResult(data)
      setStep(3)
    } catch (e: any) {
      setError(e.message || 'Setup failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`* { box-sizing: border-box } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: '100%', maxWidth: 500 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6c5ce7, #a594ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff' }}>AI</div>
            <span style={{ fontSize: 22, fontWeight: 700, color: T.text }}>Call Center</span>
          </div>
          <p style={{ fontSize: 15, color: T.text2, margin: 0 }}>First-time setup — takes about 2 minutes</p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', borderRadius: 20, background: step === s.id ? 'rgba(108,92,231,0.15)' : step > s.id ? 'rgba(0,212,170,0.1)' : T.surface2, border: `1px solid ${step === s.id ? 'rgba(108,92,231,0.4)' : step > s.id ? 'rgba(0,212,170,0.3)' : T.border}` }}>
                <span style={{ fontSize: 13 }}>{step > s.id ? '✓' : s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: step === s.id ? '#a594ff' : step > s.id ? T.green : T.text3 }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: T.border }} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: '28px 28px', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>

          {/* Step 1 — License Key */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: '0 0 6px' }}>Enter your license key</h2>
                <p style={{ fontSize: 14, color: T.text2, margin: 0, lineHeight: 1.6 }}>Your license key was provided when you purchased AI Call Center. It looks like <code style={{ background: T.surface2, padding: '2px 7px', borderRadius: 5, fontSize: 13 }}>AICAL-XXXX-XXXX-XXXX-XXXX</code></p>
              </div>
              <Field label="License Key">
                <input value={licenseKey} onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                  placeholder="AICAL-XXXX-XXXX-XXXX-XXXX" style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 15, letterSpacing: '0.05em' }} />
              </Field>
              {error && <div style={{ padding: '10px 14px', background: 'rgba(232,84,84,0.08)', border: '1px solid rgba(232,84,84,0.2)', borderRadius: 9, fontSize: 14, color: T.red }}>{error}</div>}
              <button onClick={validateLicense} disabled={loading} style={{ background: '#6c5ce7', border: 'none', borderRadius: 9, padding: '12px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Validating…' : 'Continue →'}
              </button>
            </div>
          )}

          {/* Step 2 — Admin Account */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: '0 0 6px' }}>Create admin account</h2>
                <p style={{ fontSize: 14, color: T.text2, margin: 0 }}>This is the master login for your AI Call Center.</p>
              </div>
              <Field label="Full Name">
                <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your name" style={inputStyle} />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="admin@yourcompany.com" style={inputStyle} />
              </Field>
              <Field label="Password" hint="Minimum 8 characters">
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Choose a strong password" style={inputStyle} />
              </Field>
              <Field label="Confirm Password">
                <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Repeat password" style={inputStyle} />
              </Field>
              {error && <div style={{ padding: '10px 14px', background: 'rgba(232,84,84,0.08)', border: '1px solid rgba(232,84,84,0.2)', borderRadius: 9, fontSize: 14, color: T.red }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setStep(1); setError('') }} style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: '12px', fontSize: 14, fontWeight: 500, color: T.text2, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
                <button onClick={submit} disabled={loading} style={{ flex: 2, background: '#6c5ce7', border: 'none', borderRadius: 9, padding: '12px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Setting up…' : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 48 }}>🎉</div>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>You're all set!</h2>
                <p style={{ fontSize: 14, color: T.text2, margin: 0, lineHeight: 1.6 }}>
                  Welcome, <strong style={{ color: T.text }}>{form.full_name}</strong>.<br />
                  Your AI Call Center is ready.
                </p>
              </div>
              {result?.license && (
                <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 10, padding: '14px 20px', width: '100%', textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.green, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>License Active</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      ['Plan',    result.license.tier],
                      ['Client',  result.license.client_name],
                      ['Expires', result.license.expires_at ? new Date(result.license.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
                      ['Max Leads', result.license.max_leads?.toLocaleString()],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: T.text3 }}>{k}</span>
                        <span style={{ color: T.text, fontWeight: 500, textTransform: 'capitalize' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.6 }}>
                Next: go to <strong style={{ color: T.text }}>Settings → Integrations</strong> to add your Telnyx API key and phone number.
              </div>
              <button onClick={() => router.replace('/dashboard')} style={{ background: '#6c5ce7', border: 'none', borderRadius: 9, padding: '12px 32px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                Go to Dashboard →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}