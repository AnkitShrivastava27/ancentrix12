'use client'
import { useEffect, useState } from 'react'
import { licenseApi } from '@/lib/api'
import { Card, StatCard, Button, T, PageHeader, Spinner } from '@/components/ui'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store'

export default function LicensePage() {
  const { license, fetchLicense } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)
  const [loading,    setLoading]    = useState(!license)

  useEffect(() => {
    if (!license) {
      fetchLicense().then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await licenseApi.refresh()
      await fetchLicense()
      toast.success('License refreshed')
    } catch (e: any) {
      toast.error(e.message || 'Refresh failed')
    } finally {
      setRefreshing(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner size={28} /></div>

  const lic     = license
  const daysLeft = lic?.days_remaining ?? 0
  const barColor = !lic?.active ? T.red : daysLeft < 30 ? T.amber : T.green
  const barPct   = lic?.expires_at ? Math.max(0, Math.min(100, (daysLeft / 365) * 100)) : 0

  return (
    <div>
      <PageHeader
        title="License"
        subtitle="Your AI Call Center deployment license status"
        action={<Button variant="secondary" loading={refreshing} onClick={refresh}>↻ Refresh from server</Button>}
      />

      {/* Status banner */}
      <div style={{ background: T.surface, border: `1px solid ${lic?.active ? 'rgba(0,212,170,0.2)' : 'rgba(232,84,84,0.3)'}`, borderRadius: 12, padding: '20px 24px', marginBottom: 20, borderLeft: `4px solid ${barColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{lic?.active ? '✅' : '❌'}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{lic?.active ? 'License Active' : 'License Inactive'}</span>
            {lic?.tier && (
              <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(108,92,231,0.12)', color: '#a594ff', textTransform: 'capitalize' }}>
                {lic.tier} Plan
              </span>
            )}
          </div>
          {daysLeft > 0 && (
            <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{daysLeft} days remaining</span>
          )}
        </div>
        {lic?.expires_at && (
          <>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text3 }}>
              <span>Expires {new Date(lic.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              {lic.last_verified && <span>Last verified {new Date(lic.last_verified).toLocaleString('en-IN')}</span>}
            </div>
          </>
        )}
        {lic?.message && !lic.active && (
          <div style={{ marginTop: 8, fontSize: 13, color: T.red }}>{lic.message}</div>
        )}
        {lic?.grace_until && (
          <div style={{ marginTop: 8, fontSize: 13, color: T.amber }}>⚠ Operating in grace period until {new Date(lic.grace_until).toLocaleDateString('en-IN')}</div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Plan Tier"      value={lic?.tier || '—'}        color={T.accent}  sub="your subscription tier" />
        <StatCard label="Days Remaining" value={daysLeft || '—'}          color={barColor}  sub="until renewal needed" />
        <StatCard label="Max Leads"      value={lic?.max_leads?.toLocaleString() || '—'} color={T.blue} sub="lead capacity" />
        <StatCard label="Max Calls/Mo"   value={lic?.max_calls_month?.toLocaleString() || '—'} color={T.green} sub="monthly call limit" />
      </div>

      {/* Details card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card title="License Details">
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Client',        lic?.client_name || '—'],
              ['Tier',          lic?.tier || '—'],
              ['Status',        lic?.active ? 'Active' : 'Inactive'],
              ['Expires',       lic?.expires_at ? new Date(lic.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
              ['Days Left',     daysLeft ? `${daysLeft} days` : '—'],
              ['Last Verified', lic?.last_verified ? new Date(lic.last_verified).toLocaleString('en-IN') : 'Never'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 14, color: T.text3 }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: T.text, textTransform: 'capitalize' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Renewal & Support">
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {daysLeft < 60 && daysLeft > 0 && (
              <div style={{ padding: '12px 16px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 9 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.amber, marginBottom: 4 }}>⚠ Renewal reminder</div>
                <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>Your license expires in {daysLeft} days. Contact your vendor to renew and avoid service interruption.</div>
              </div>
            )}
            {!lic?.active && (
              <div style={{ padding: '12px 16px', background: 'rgba(232,84,84,0.08)', border: '1px solid rgba(232,84,84,0.2)', borderRadius: 9 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 4 }}>❌ License inactive</div>
                <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>Outbound calls are blocked. Contact your vendor to renew your license.</div>
              </div>
            )}
            <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.8 }}>
              <strong style={{ color: T.text, display: 'block', marginBottom: 6 }}>How renewal works</strong>
              Your vendor will provide a new license key when you renew. Click <em>Refresh from server</em> above after renewal — it will automatically pick up your new expiry date.
            </div>
            <div style={{ fontSize: 13, color: T.text3, lineHeight: 1.6, padding: '12px 14px', background: T.surface2, borderRadius: 9 }}>
              📧 To renew or for support, contact your AI Call Center vendor. Include your client name: <strong style={{ color: T.text }}>{lic?.client_name || 'Unknown'}</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
