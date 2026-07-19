'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store'
import { billingApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

function Spinner() {
  return <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #7c6eff', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite', display: 'inline-block' }} />
}

export default function BillingPage() {
  const router   = useRouter()
  const { plan, fetchPlan, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchPlan().finally(() => setLoading(false))
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await fetchPlan()
    setRefreshing(false)
    toast.success('Minutes refreshed')
  }

  const pct = plan && plan.minutes_total > 0
    ? Math.min(100, Math.round((plan.minutes_used / plan.minutes_total) * 100))
    : 0

  const barColor = pct > 85 ? '#f25757' : pct > 60 ? '#f5a623' : '#3ecf8e'
  const isExpired = plan?.status === 'expired' || plan?.status === 'none' || !plan
  const isActive  = plan?.status === 'active'

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Billing & Minutes</h1>
        <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>Track your platform usage minutes and manage your plan</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Plan status card */}
          <div style={{ background: '#181920', border: `1px solid ${isActive ? 'rgba(62,207,142,0.2)' : 'rgba(242,87,87,0.2)'}`, borderRadius: 12, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 12, color: '#5a5d70', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Current Plan</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f1f5', letterSpacing: '-0.02em' }}>
                  {!plan || plan.status === 'none' ? 'No Plan' : plan.plan_id === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
                color: isActive ? '#3ecf8e' : '#f25757',
                background: isActive ? 'rgba(62,207,142,0.1)' : 'rgba(242,87,87,0.1)' }}>
                {isActive ? '● Active' : '● ' + (plan?.status || 'None')}
              </span>
            </div>

            {isExpired && (
              <div style={{ padding: '12px 14px', background: 'rgba(242,87,87,0.07)', border: '1px solid rgba(242,87,87,0.18)', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#f25757', fontWeight: 500, marginBottom: 3 }}>⚠ Plan Expired or Not Active</div>
                <div style={{ fontSize: 12, color: '#8a8d9e' }}>Scheduled calls, batches, and campaigns are paused. Buy a plan to resume.</div>
              </div>
            )}

            {isActive && plan && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5a5d70', marginBottom: 8 }}>
                  <span>Minutes used</span>
                  <span style={{ color: barColor, fontWeight: 600 }}>{pct}% used</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#f0f1f5', letterSpacing: '-0.02em' }}>{plan.minutes_remaining.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: '#5a5d70' }}>minutes remaining</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#8a8d9e', letterSpacing: '-0.02em' }}>{plan.minutes_used.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: '#5a5d70' }}>minutes used</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#4a4d5e', letterSpacing: '-0.02em' }}>{plan.minutes_total.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: '#5a5d70' }}>total (incl. extras)</div>
                    </div>
                  </div>
                  <button onClick={refresh} disabled={refreshing} style={{ padding: '6px 14px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#8a8d9e', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {refreshing ? <Spinner /> : '↻'} Refresh
                  </button>
                </div>

                {plan.extra_minutes > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#5a5d70', padding: '8px 12px', background: 'rgba(165,148,255,0.06)', borderRadius: 7 }}>
                    Includes <strong style={{ color: '#a594ff' }}>{plan.extra_minutes.toLocaleString()}</strong> extra purchased minutes
                  </div>
                )}

                {plan.expires_at && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#4a4d5e' }}>
                    Expires: {new Date(plan.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}

                {pct > 85 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(242,87,87,0.07)', border: '1px solid rgba(242,87,87,0.18)', borderRadius: 8, fontSize: 12, color: '#f25757' }}>
                    ⚠ You've used {pct}% of your minutes. Buy extra to avoid interruptions.
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button onClick={() => router.push('/pricing')} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: '#7c6eff', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {isExpired ? '🚀 Buy a Plan' : '➕ Buy Extra Minutes'}
              </button>
              {!isExpired && (
                <button onClick={() => router.push('/pricing')} style={{ padding: '10px 18px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8a8d9e', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Renew / Upgrade
                </button>
              )}
            </div>
          </div>

          {/* Plan feature lock info */}
          {isExpired && (
            <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f1f5', marginBottom: 12 }}>What's locked without a plan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['🔒', 'Outbound batch calls and schedules'],
                  ['🔒', 'Email campaign sending'],
                  ['🔒', 'Lead import (CSV)'],
                  ['✅', 'Dashboard and call logs — view only'],
                  ['✅', 'Settings and knowledge base editing'],
                  ['✅', 'Inbound calls — still receive calls'],
                ].map(([icon, label], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span>{icon}</span>
                    <span style={{ color: icon === '✅' ? '#3ecf8e' : '#8a8d9e' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan history placeholder */}
          <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#5a5d70', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Account</div>
            <div style={{ fontSize: 13, color: '#8a8d9e' }}>{user?.email}</div>
            <div style={{ fontSize: 11, color: '#4a4d5e', marginTop: 4 }}>For payment receipts or disputes, contact support</div>
          </div>
        </div>
      )}
    </div>
  )
}