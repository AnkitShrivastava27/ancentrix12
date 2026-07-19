'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { billingApi } from '@/lib/api'
import toast from 'react-hot-toast'

const PLANS = [
  { id: 'monthly', label: 'Monthly',  usd: 50,  minutes: 3000, period: '1 month',   badge: null,            highlight: false },
  { id: 'annual',  label: 'Annual',   usd: 400, minutes: 3000, period: '12 months', badge: 'Save $200 (33%)', highlight: true  },
]
const EXTRA = { usd: 10, minutes: 500 }

type Gateway = 'cashfree' | 'paypal'

function Spinner({ white }: { white?: boolean }) {
  return <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${white?'#fff':'#7c6eff'}`, borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
}

export default function PricingPage() {
  const router = useRouter()
  const { user, plan, fetchPlan, logout } = useAuthStore()
  const [inrRate, setInrRate]   = useState<number | null>(null)
  const [gateway, setGateway]   = useState<Gateway>('cashfree')
  const [selected, setSelected] = useState<string | null>(null)
  const [extraQty, setExtraQty] = useState(1)
  const [loading, setLoading]   = useState(false)
  const [rateLoading, setRateLoading] = useState(true)

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then(r => r.json())
      .then(d => setInrRate(d.rates?.INR || 83))
      .catch(() => setInrRate(83))
      .finally(() => setRateLoading(false))
  }, [])

  useEffect(() => {
    if (plan?.status === 'active') router.replace('/dashboard')
  }, [plan, router])

  useEffect(() => {
    // Load Cashfree JS SDK dynamically
    if (typeof window !== 'undefined' && !(window as any).Cashfree) {
      const script = document.createElement('script')
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  if (!user) { router.replace('/login'); return null }

  const showINR = gateway === 'cashfree'
  const rate    = inrRate || 83
  function fmt(usd: number) {
    return showINR ? `₹${Math.round(usd * rate).toLocaleString('en-IN')}` : `$${usd}`
  }

  async function handleBuyPlan(planId: string) {
    setSelected(planId); setLoading(true)
    try {
      const planDef = PLANS.find(p => p.id === planId)!
      if (gateway === 'cashfree') {
        const res: any = await billingApi.initCashfree({
          plan_id: planId, currency: 'INR',
          amount_inr: Math.round(planDef.usd * rate),
        })
        await openCashfree(res, planId)
      } else {
        const res: any = await billingApi.initPaypal({
          plan_id: planId, currency: 'USD', amount_usd: planDef.usd,
        })
        window.location.href = res.approval_url
      }
    } catch (e: any) {
      toast.error(e.message || 'Payment init failed')
      setLoading(false); setSelected(null)
    }
  }

  async function handleBuyExtra() {
    if (plan?.status !== 'active') { toast.error('Buy a plan first'); return }
    setSelected('extra'); setLoading(true)
    try {
      const totalUsd = EXTRA.usd * extraQty
      if (gateway === 'cashfree') {
        const res: any = await billingApi.initCashfree({
          plan_id: 'extra_minutes', currency: 'INR',
          amount_inr: Math.round(totalUsd * rate), extra_qty: extraQty,
        })
        await openCashfree(res, 'extra_minutes')
      } else {
        const res: any = await billingApi.initPaypal({
          plan_id: 'extra_minutes', currency: 'USD',
          amount_usd: totalUsd, extra_qty: extraQty,
        })
        window.location.href = res.approval_url
      }
    } catch (e: any) {
      toast.error(e.message || 'Payment init failed')
      setLoading(false); setSelected(null)
    }
  }

  async function openCashfree(res: any, planId: string) {
    // Cashfree returns either payment_link (redirect) or payment_session_id (JS SDK)
    if (res.payment_link && res.payment_link.startsWith('http')) {
      // Direct redirect — production mode
      window.location.href = res.payment_link
      return
    }

    if (res.payment_session_id || res.payment_link) {
      const sessionId = res.payment_session_id || res.payment_link
      // Use Cashfree JS SDK — sandbox mode
      const cf = (window as any).Cashfree
      if (!cf) {
        toast.error('Cashfree SDK not loaded. Please refresh and try again.')
        setLoading(false); setSelected(null)
        return
      }
      const cashfree = cf({ mode: process.env.NEXT_PUBLIC_CASHFREE_ENV || 'sandbox' })
      const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/payment-success?gateway=cashfree&order_id=${res.order_id}&plan_id=${planId}`
      try {
        await cashfree.checkout({
          paymentSessionId: sessionId,
          returnUrl,
          redirectTarget: '_self',
        })
      } catch (e: any) {
        toast.error(e.message || 'Cashfree checkout failed')
        setLoading(false); setSelected(null)
      }
      return
    }

    toast.error('Invalid response from payment server')
    setLoading(false); setSelected(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0c0d10', padding: '48px 16px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #7c6eff, #a594ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 auto 16px' }}>AI</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f1f5', margin: '0 0 8px', letterSpacing: '-0.03em' }}>Choose a Plan</h1>
          <p style={{ fontSize: 14, color: '#5a5d70', margin: 0 }}>Welcome, {user.full_name || user.email}! Select a plan to activate your account.</p>
        </div>

        {/* Gateway selector */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', gap: 3, padding: 3, background: '#181920', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { id: 'cashfree', label: '🇮🇳 Pay in ₹ (Cashfree)', sub: 'UPI, Cards, NetBanking' },
              { id: 'paypal',   label: '🌍 Pay in $ (PayPal)',    sub: 'International cards' },
            ].map(g => (
              <button key={g.id} onClick={() => setGateway(g.id as Gateway)} style={{
                padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left',
                background: gateway === g.id ? '#1e1f28' : 'transparent',
                boxShadow: gateway === g.id ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none',
              }}>
                <div style={{ fontSize: 13, fontWeight: gateway === g.id ? 500 : 400, color: gateway === g.id ? '#f0f1f5' : '#5a5d70' }}>{g.label}</div>
                <div style={{ fontSize: 11, color: '#4a4d5e', marginTop: 2 }}>{g.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {PLANS.map(p => (
            <div key={p.id} style={{
              background: '#181920', borderRadius: 14, padding: 28, position: 'relative',
              border: `1px solid ${p.highlight ? 'rgba(124,110,255,0.5)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: p.highlight ? '0 0 0 1px rgba(124,110,255,0.2), 0 8px 32px rgba(124,110,255,0.08)' : 'none',
            }}>
              {p.badge && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#7c6eff', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                  {p.badge}
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#8a8d9e', marginBottom: 6 }}>{p.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 36, fontWeight: 700, color: '#f0f1f5', letterSpacing: '-0.03em' }}>
                  {rateLoading ? '…' : fmt(p.usd)}
                </span>
                <span style={{ fontSize: 13, color: '#5a5d70' }}>/ {p.period}</span>
              </div>
              {showINR && <div style={{ fontSize: 11, color: '#4a4d5e', marginBottom: 16 }}>(≈ ${p.usd} USD at live rate)</div>}

              <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  `${p.minutes.toLocaleString()} minutes / month`,
                  'Voice + Email campaigns',
                  'Bring your own Telnyx number',
                  'Knowledge base + AI prompts',
                  ...(p.id === 'annual' ? ['Priority support'] : []),
                ].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#3ecf8e', fontSize: 14, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: '#c8cad8' }}>{f}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => handleBuyPlan(p.id)} disabled={loading} style={{
                width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, transition: 'opacity 0.15s',
                background: p.highlight ? '#7c6eff' : 'rgba(124,110,255,0.12)',
                color: p.highlight ? '#fff' : '#a594ff',
                opacity: loading && selected !== p.id ? 0.4 : 1,
              }}>
                {loading && selected === p.id ? <Spinner white={p.highlight} /> : null}
                {gateway === 'cashfree' ? '🇮🇳 Pay with Cashfree' : '🌍 Pay with PayPal'}
              </button>
            </div>
          ))}
        </div>

        {/* Extra minutes — only shown if plan is active */}
        {plan?.status === 'active' && (
          <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f1f5', marginBottom: 4 }}>Need more minutes?</div>
            <div style={{ fontSize: 12, color: '#5a5d70', marginBottom: 16 }}>Extra minutes add on top of your plan and never expire</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#4a4d5e', marginBottom: 6 }}>{EXTRA.minutes} min per pack</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setExtraQty(q => Math.max(1, q-1))} style={{ width:30, height:30, borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#f0f1f5', cursor:'pointer', fontSize:16 }}>−</button>
                  <span style={{ fontSize:20, fontWeight:600, color:'#f0f1f5', minWidth:28, textAlign:'center' }}>{extraQty}</span>
                  <button onClick={() => setExtraQty(q => q+1)} style={{ width:30, height:30, borderRadius:6, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#f0f1f5', cursor:'pointer', fontSize:16 }}>+</button>
                  <span style={{ fontSize:13, color:'#5a5d70' }}>= {(extraQty * EXTRA.minutes).toLocaleString()} min</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#f0f1f5' }}>{rateLoading ? '…' : fmt(EXTRA.usd * extraQty)}</div>
                {showINR && <div style={{ fontSize: 11, color: '#4a4d5e' }}>${EXTRA.usd * extraQty} USD</div>}
              </div>
              <button onClick={handleBuyExtra} disabled={loading} style={{ padding:'10px 20px', borderRadius:8, background:'#7c6eff', border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity: loading && selected==='extra' ? 0.6 : 1 }}>
                {loading && selected === 'extra' ? <Spinner white /> : null}
                Buy Now
              </button>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#3a3d4e' }}>
          No auto-renewal · One-time payment · Contact us to renew
          {' · '}
          <button onClick={() => logout()} style={{ background:'none', border:'none', color:'#4a4d5e', cursor:'pointer', fontSize:11, fontFamily:'inherit', textDecoration:'underline' }}>Sign out</button>
        </p>
      </div>
    </div>
  )
}