'use client'
import { useEffect, useState } from 'react'
import { callsApi, leadsApi } from '@/lib/api'
import { StatCard, Card, T, Spinner, StatusBadge, PageHeader } from '@/components/ui'
import { useAuthStore } from '@/store'
import Link from 'next/link'

const PIPELINE = [
  { key: 'interested', label: 'Hot 🔥',    color: '#e85454' },
  { key: 'warm',       label: 'Warm',       color: '#f0a500' },
  { key: 'new',        label: 'New',        color: '#6c5ce7' },
  { key: 'contacted',  label: 'Contacted',  color: '#4d9ef5' },
  { key: 'cold',       label: 'Cold',       color: '#545868' },
  { key: 'closed_won', label: 'Won ✓',      color: '#00d4aa' },
]

const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

function Row({ label, value, color }: { label: string; value: string|number; color?: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontSize:14, color:T.text2 }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:600, color:color||T.text, fontVariantNumeric:'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const { license, company } = useAuthStore()
  const [ls, setLs] = useState<any>(null)
  const [cs, setCs] = useState<any>(null)
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      leadsApi.stats().catch(() => null),
      callsApi.stats().catch(() => null),
      callsApi.list({ limit: 8 }).catch(() => ({ calls: [] })),
    ]).then(([l, c, cl]: any) => {
      setLs(l); setCs(c); setCalls(cl?.calls || [])
      setLoading(false)
    })
  }, [])

  //const pct  = license && license.minutes_total > 0 ? Math.min(100, Math.round((license.minutes_used / license.minutes_total) * 100)) : 0
  //const bar  = pct > 85 ? T.red : pct > 60 ? T.amber : T.green

  return (
    <div>
      <PageHeader
        title={`Welcome back${company?.name ? `, ${company.name}` : ''}`}
        subtitle="Your AI call center at a glance"
      />

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14, marginBottom:20 }}>
        <StatCard label="Total Leads"   value={ls?.total || 0}               color={T.accent} loading={loading} sub={`${ls?.by_status?.new || 0} new`} />
        <StatCard label="Total Calls"   value={cs?.total || 0}               color={T.green}  loading={loading} sub={`${cs?.completed || 0} completed`} />
        <StatCard label="Avg Duration"  value={cs ? `${cs.avg_duration_seconds || 0}s` : '—'} color={T.blue}   loading={loading} sub="per call" />
        <StatCard label="Converted"     value={ls?.by_status?.closed_won || 0} color={T.amber} loading={loading} sub="closed won" />
      </div>

      {/* License / minutes banner
      {license && (
        <div style={{ background:T.surface, border:`1px solid ${license.status==='active' ? T.border : 'rgba(232,84,84,0.3)'}`, borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:20 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:14, fontWeight:600, color:T.text }}>
                {license.status === 'active' ? '✓ License Active' : '⚠ License Inactive'}
              </span>
              <span style={{ fontSize:13, color: bar, fontWeight:700 }}>{license.minutes_remaining?.toLocaleString()} min remaining</span>
            </div>
            <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:bar, borderRadius:3, transition:'width 0.5s' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
              <span style={{ fontSize:12, color:T.text3 }}>{license.minutes_used?.toLocaleString()} / {license.minutes_total?.toLocaleString()} used</span>
              {license.expires_at && <span style={{ fontSize:12, color:T.text3 }}>Expires {new Date(license.expires_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>}
            </div>
          </div>
        </div>
      )} */}

      {/* Middle row: pipeline + call stats + recent */}
      <div style={{ display:'grid', gridTemplateColumns:'300px 280px 1fr', gap:14, marginBottom:20 }}>
        <Card title="Lead Pipeline">
          <div style={{ padding:'14px 20px' }}>
            {PIPELINE.map(s => {
              const count = ls?.by_status?.[s.key] || 0
              const p = ls?.total > 0 ? (count / ls.total) * 100 : 0
              return (
                <div key={s.key} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:14, color:T.text2 }}>{s.label}</span>
                    <span style={{ fontSize:14, fontWeight:600, color:s.color, fontVariantNumeric:'tabular-nums' }}>{loading ? '—' : count}</span>
                  </div>
                  <div style={{ height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${p}%`, background:s.color, borderRadius:2, transition:'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Call Activity">
          <div style={{ padding:'14px 20px' }}>
            <Row label="Completed"    value={loading ? '—' : cs?.completed || 0}  color={T.green} />
            <Row label="Inbound"      value={loading ? '—' : cs?.inbound || 0}     color={T.blue} />
            <Row label="Outbound"     value={loading ? '—' : cs?.outbound || 0}    color={T.accent} />
            <Row label="No Answer"    value={loading ? '—' : cs?.no_answer || 0}   color={T.text3} />
            <Row label="Transferred"  value={loading ? '—' : cs?.transferred || 0} color={T.amber} />
            <Row label="Avg Duration" value={loading ? '—' : `${cs?.avg_duration_seconds || 0}s`} />
          </div>
        </Card>

        <Card title="Quick Actions">
          <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { href:'/leads',     icon:'👤', label:'Add a Lead',        sub:'Import CSV or add manually' },
              { href:'/batches',   icon:'📋', label:'Create a Batch',    sub:'Group leads for outbound' },
              { href:'/schedules', icon:'🕐', label:'Schedule Calls',    sub:'Set time windows and frequency' },
              { href:'/knowledge', icon:'📚', label:'Upload Knowledge',  sub:'PDFs, docs for your AI agent' },
              { href:'/settings',  icon:'⚙',  label:'Configure Agent',   sub:'Voice, language, prompts' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:9, background:T.surface2, textDecoration:'none', transition:'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(108,92,231,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = T.surface2}>
                <span style={{ fontSize:18, width:28, textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, color:T.text }}>{item.label}</div>
                  <div style={{ fontSize:12, color:T.text3, marginTop:1 }}>{item.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent calls full-width */}
      <Card title="Recent Calls" action={<Link href="/calls" style={{ fontSize:13, color:T.accent, textDecoration:'none' }}>View all →</Link>}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={24} /></div>
        ) : calls.length === 0 ? (
          <div style={{ padding:'40px 20px', textAlign:'center', color:T.text3, fontSize:14 }}>
            No calls yet — connect your Telnyx number in <Link href="/settings" style={{ color:T.accent }}>Settings</Link>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Dir','Phone Number','Duration','Status','Sentiment','Summary','When'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:T.text3, textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < calls.length-1 ? `1px solid ${T.border}` : 'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:12, fontWeight:500, padding:'3px 9px', borderRadius:20, color: c.direction==='inbound' ? T.blue : T.accent, background: c.direction==='inbound' ? 'rgba(77,158,245,0.1)' : T.accentL }}>
                      {c.direction==='inbound' ? '↙' : '↗'} {c.direction}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:14, color:T.text, fontFamily:'monospace' }}>{c.direction==='inbound' ? c.from_number : c.to_number}</td>
                  <td style={{ padding:'12px 16px', fontSize:14, color:T.text2, fontVariantNumeric:'tabular-nums' }}>{fmt(c.duration_seconds||0)}</td>
                  <td style={{ padding:'12px 16px' }}><StatusBadge status={c.status} /></td>
                  <td style={{ padding:'12px 16px', fontSize:18 }}>{c.sentiment==='positive'?'😊':c.sentiment==='negative'?'😟':c.sentiment==='neutral'?'😐':'—'}</td>
                  <td style={{ padding:'12px 16px', fontSize:14, color:T.text2, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.summary||'—'}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color:T.text3, whiteSpace:'nowrap' }}>{c.started_at ? new Date(c.started_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
