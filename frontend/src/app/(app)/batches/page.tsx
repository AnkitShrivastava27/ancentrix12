'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { batchesApi, schedulesApi } from '@/lib/api'
import { Button, Input, Select, Tabs, StatusBadge, Spinner, EmptyState, StatCard } from '@/components/ui'
import toast from 'react-hot-toast'

const LEAD_STATUSES = ['new','contacted','interested','warm','cold']
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const S_COL = { fontSize: 10, fontWeight: 600, color: '#3a3d4e', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }
const HDR: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 140px 80px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const ROW: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 80px 80px 110px 140px 80px', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.1s' }

function Bar({ done, total, color }: { done: number; total: number; color: string }) {
  const p = total > 0 ? Math.min(100, (done / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#5a5d70', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>{Math.round(p)}%</span>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = { running: '#3ecf8e', scheduled: '#4da6ff', completed: '#a594ff', failed: '#f25757', paused: '#f5a623', draft: '#5a5d70' }

export default function BatchesPage() {
  const [tab, setTab]         = useState('list')
  const [batches, setBatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail]   = useState<any>(null)
  const [filter, setFilter]   = useState('all')

  const load = useCallback(async () => {
    try { const d = await batchesApi.list(); setBatches(Array.isArray(d) ? d : []) }
    catch { setBatches([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const deleteBatch = async (id: string) => {
    if (!confirm('Delete this batch? Cannot be undone.')) return
    try { await batchesApi.delete(id); toast.success('Deleted'); setBatches(b => b.filter(x => x.id !== id)); setDetail(null) }
    catch { toast.error('Delete failed') }
  }

  const visible = filter === 'all' ? batches : batches.filter(b => b.status === filter)
  const counts: Record<string, number> = { all: batches.length }
  batches.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1 })

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Batches</h1>
        <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>Group leads into voice or email campaigns</p>
      </div>

      <Tabs active={tab} onChange={setTab}
        tabs={[{ id: 'list', label: 'All Batches', count: batches.length }, { id: 'create', label: '+ New Batch' }]} />

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            <StatCard label="Total"     value={batches.length}                                 color="#a594ff" loading={loading} />
            <StatCard label="Running"   value={batches.filter(b=>b.status==='running').length}   color="#3ecf8e" loading={loading} />
            <StatCard label="Scheduled" value={batches.filter(b=>b.status==='scheduled').length} color="#4da6ff" loading={loading} />
            <StatCard label="Completed" value={batches.filter(b=>b.status==='completed').length} color="#f5a623" loading={loading} />
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {['all','running','scheduled','paused','draft','completed','failed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${filter === f ? 'rgba(124,110,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                background: filter === f ? 'rgba(124,110,255,0.1)' : 'transparent',
                color: filter === f ? '#a594ff' : '#5a5d70', transition: 'all 0.1s',
              }}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase()+f.slice(1)} <span style={{ opacity: 0.5 }}>{counts[f]||0}</span>
              </button>
            ))}
          </div>

          <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={HDR}>
              {['Batch','Leads','Done','Status','Progress',''].map(h => <div key={h} style={S_COL}>{h}</div>)}
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
            ) : visible.length === 0 ? (
              <EmptyState icon="▤" title="No batches yet" description="Create a batch to start running voice or email campaigns at scale"
                action={<Button variant="primary" onClick={() => setTab('create')}>+ New Batch</Button>} />
            ) : visible.map((b, i) => {
              const col = STATUS_COLOR[b.status] || '#5a5d70'
              return (
                <div key={b.id} style={{ ...ROW, background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e1f28' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  onClick={() => setDetail(b)}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14 }}>{b.batch_type === 'voice' ? '📞' : '✉️'}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    </div>
                    {b.campaign_name && <div style={{ fontSize: 11, color: '#4a4d5e', paddingLeft: 22 }}>{b.campaign_name}</div>}
                  </div>
                  <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#c8cad8' }}>{b.lead_count?.toLocaleString()}</div>
                  <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#5a5d70' }}>{b.leads_processed?.toLocaleString()}</div>
                  <div><StatusBadge status={b.status} /></div>
                  <Bar done={b.leads_processed} total={b.lead_count} color={col} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => deleteBatch(b.id)} style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#3a3d4e', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(242,87,87,0.1)'; el.style.color = '#f25757' }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = '#3a3d4e' }}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CREATE ── */}
      {tab === 'create' && (
        <CreateBatchForm onDone={() => { setTab('list'); load() }} onCancel={() => setTab('list')} />
      )}

      {/* Detail panel */}
      {detail && (
        <BatchDetail batch={detail} onClose={() => setDetail(null)} onDelete={() => deleteBatch(detail.id)} onRefresh={load} />
      )}
    </div>
  )
}

function CreateBatchForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<1|2|3>(1)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [f, setF] = useState({
    name: '', campaign_name: '', product_focus: '',
    batch_type: 'voice' as 'voice'|'email', call_mode: 'sales' as 'sales'|'support',
    statuses: [] as string[], limit: '', exclude_done: true,
    email_subject: '', email_body: '',
    withSchedule: false,
    start_datetime: '', end_datetime: '',
    window_start: '09:00', window_end: '18:00',
    base_timezone: 'Asia/Kolkata', use_lead_timezone: true,
    allowed_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[],
    max_per_hour: '20', delay_s: '30',
  })
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => set('allowed_days', f.allowed_days.includes(d) ? f.allowed_days.filter(x=>x!==d) : [...f.allowed_days, d])
  const toggleStatus = (s: string) => set('statuses', f.statuses.includes(s) ? f.statuses.filter(x=>x!==s) : [...f.statuses, s])

  const doPreview = async () => {
    setPreviewing(true)
    try { const d = await batchesApi.preview({ limit: Number(f.limit)||200, status: f.statuses.join(',')||undefined }); setPreview(d) }
    catch { toast.error('Preview failed') }
    finally { setPreviewing(false) }
  }

  const submit = async () => {
    setSaving(true)
    try {
      const b: any = await batchesApi.create({
        name: f.name, batch_type: f.batch_type, call_mode: f.call_mode,
        campaign_name: f.campaign_name || undefined, product_focus: f.product_focus || undefined,
        email_subject_template: f.email_subject || undefined, email_body_template: f.email_body || undefined,
        filter_criteria: { status: f.statuses.length ? f.statuses : undefined, limit: f.limit ? Number(f.limit) : undefined, exclude_statuses: f.exclude_done ? ['closed_won','closed_lost','do_not_call'] : undefined },
      })
      if (f.withSchedule && f.start_datetime) {
        await schedulesApi.create({ batch_id: b.id, start_datetime: f.start_datetime, end_datetime: f.end_datetime||undefined, window_start_time: f.window_start, window_end_time: f.window_end, base_timezone: f.base_timezone, use_lead_timezone: f.use_lead_timezone, allowed_days: f.allowed_days, max_per_hour: Number(f.max_per_hour), delay_between_seconds: Number(f.delay_s) })
      }
      toast.success(`Batch created — ${b.lead_count} leads`); onDone()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { background: '#13141a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f0f1f5', outline: 'none', width: '100%', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, maxWidth: 860 }}>
      {/* Form card */}
      <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Step nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ n: 1, l: 'Setup' }, { n: 2, l: 'Filter' }, { n: 3, l: 'Confirm' }].map(({ n, l }, i) => (
            <React.Fragment key={n}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: n === step ? 500 : 400,
                background: n === step ? 'rgba(124,110,255,0.15)' : n < step ? 'rgba(62,207,142,0.1)' : 'transparent',
                color: n === step ? '#a594ff' : n < step ? '#3ecf8e' : '#4a4d5e' }}>
                <span>{n < step ? '✓' : n}</span> {l}
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />}
            </React.Fragment>
          ))}
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* ── Step 1 ── */}
          {step === 1 && <>
            <Input label="Batch Name *" value={f.name} onChange={e => set('name', e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input label="Campaign" value={f.campaign_name} onChange={e => set('campaign_name', e.target.value)} />
              <Input label="Product Focus" value={f.product_focus} onChange={e => set('product_focus', e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[{ v: 'voice', icon: '📞', title: 'Voice Calls', desc: 'AI calls leads' }, { v: 'email', icon: '✉️', title: 'Email Campaign', desc: 'AI emails leads' }].map(t => (
                  <button key={t.v} onClick={() => set('batch_type', t.v)} style={{ padding: '12px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer', background: f.batch_type === t.v ? 'rgba(124,110,255,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${f.batch_type === t.v ? '#7c6eff' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.1s', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#5a5d70', marginTop: 2 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {f.batch_type === 'voice' && (
              <div>
                <label style={lbl}>Call Mode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'sales', l: '💰 Sales' }, { v: 'support', l: '🎧 Support' }].map(m => (
                    <button key={m.v} onClick={() => set('call_mode', m.v)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: f.call_mode === m.v ? 500 : 400, background: f.call_mode === m.v ? 'rgba(124,110,255,0.1)' : 'transparent', border: `1px solid ${f.call_mode === m.v ? 'rgba(124,110,255,0.4)' : 'rgba(255,255,255,0.07)'}`, color: f.call_mode === m.v ? '#c4b5fd' : '#6a6d7e', transition: 'all 0.1s' }}>{m.l}</button>
                  ))}
                </div>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <input type="checkbox" checked={f.withSchedule} onChange={e => set('withSchedule', e.target.checked)} style={{ accentColor: '#7c6eff', width: 14, height: 14 }} />
              <span style={{ fontSize: 13, color: '#c8cad8' }}>Create a schedule for this batch</span>
            </label>
          </>}

          {/* ── Step 2 ── */}
          {step === 2 && <>
            <div>
              <label style={lbl}>Filter by lead status (empty = all active)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {LEAD_STATUSES.map(s => (
                  <button key={s} onClick={() => toggleStatus(s)} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${f.statuses.includes(s) ? 'rgba(124,110,255,0.5)' : 'rgba(255,255,255,0.07)'}`, background: f.statuses.includes(s) ? 'rgba(124,110,255,0.12)' : 'transparent', color: f.statuses.includes(s) ? '#c4b5fd' : '#5a5d70', transition: 'all 0.1s' }}>{s}</button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#c8cad8' }}>
              <input type="checkbox" checked={f.exclude_done} onChange={e => set('exclude_done', e.target.checked)} style={{ accentColor: '#7c6eff', width: 14, height: 14 }} />
              Exclude closed / do-not-call leads
            </label>
            <Input label="Max leads (leave blank for all matching)" type="number" value={f.limit} onChange={e => set('limit', e.target.value)} />
            <Button onClick={doPreview} loading={previewing}>🔍 Preview matching leads</Button>
            {preview && (
              <div style={{ background: 'rgba(62,207,142,0.05)', border: '1px solid rgba(62,207,142,0.15)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#3ecf8e', marginBottom: 6 }}>{preview.total_matching.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 400 }}>leads match</span></div>
                {preview.sample?.slice(0,3).map((l: any) => (
                  <div key={l.id} style={{ fontSize: 12, color: '#5a5d70', marginBottom: 2 }}>• {l.name} — {l.phone} — {l.status}</div>
                ))}
                {preview.total_matching > 3 && <div style={{ fontSize: 11, color: '#4a4d5e', marginTop: 4 }}>+{preview.total_matching - 3} more</div>}
              </div>
            )}
          </>}

          {/* ── Step 3 ── */}
          {step === 3 && <>
            {f.batch_type === 'email' && <>
              <Input label="Email Subject *" value={f.email_subject} onChange={e => set('email_subject', e.target.value)} placeholder="Hi {lead_name}, introducing {company_name}" />
              <div>
                <label style={lbl}>Email Body *</label>
                <textarea value={f.email_body} onChange={e => set('email_body', e.target.value)} rows={6} placeholder={"Namaste {lead_name} ji,\n\nMain {agent_name} hoon…"} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            </>}
            {f.withSchedule && <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Start *</label><input type="datetime-local" value={f.start_datetime} onChange={e => set('start_datetime', e.target.value)} style={inp} /></div>
                <div><label style={lbl}>End (optional)</label><input type="datetime-local" value={f.end_datetime} onChange={e => set('end_datetime', e.target.value)} style={inp} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={lbl}>Window start</label><input type="time" value={f.window_start} onChange={e => set('window_start', e.target.value)} style={inp} /></div>
                <div><label style={lbl}>Window end</label><input type="time" value={f.window_end} onChange={e => set('window_end', e.target.value)} style={inp} /></div>
              </div>
              <div>
                <label style={lbl}>Allowed days</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {DAYS.map(d => (
                    <button key={d} onClick={() => toggleDay(d)} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${f.allowed_days.includes(d) ? 'rgba(124,110,255,0.5)' : 'rgba(255,255,255,0.07)'}`, background: f.allowed_days.includes(d) ? 'rgba(124,110,255,0.12)' : 'transparent', color: f.allowed_days.includes(d) ? '#c4b5fd' : '#5a5d70' }}>{d.slice(0,3)}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Input label="Max per hour" type="number" value={f.max_per_hour} onChange={e => set('max_per_hour', e.target.value)} />
                <Input label="Delay (sec)" type="number" value={f.delay_s} onChange={e => set('delay_s', e.target.value)} />
              </div>
            </>}
            {!f.withSchedule && f.batch_type !== 'email' && (
              <div style={{ background: '#13141a', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[['Name', f.name], ['Type', `${f.batch_type} / ${f.call_mode}`], ['Leads', f.limit || 'all matching'], ['Campaign', f.campaign_name||'—'], ['Filter', f.statuses.join(', ')||'all active']].map(([l,v]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#4a4d5e' }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#c8cad8' }}>{v as string}</span>
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Button onClick={step === 1 ? onCancel : () => setStep(s => (s - 1) as any)}>{step === 1 ? 'Cancel' : '← Back'}</Button>
          {step < 3
            ? <Button variant="primary" disabled={step === 1 && !f.name} onClick={() => { if (step === 2 && !preview) { doPreview() } else { setStep(s => (s + 1) as any) } }}>
                {step === 2 && !preview ? 'Preview & Next →' : 'Next →'}
              </Button>
            : <Button variant="primary" loading={saving} onClick={submit}>🚀 {f.withSchedule ? 'Create & Schedule' : 'Create Batch'}</Button>
          }
        </div>
      </div>

      {/* Tips */}
      <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, height: 'fit-content' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#3a3d4e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Guide</div>
        {step === 1 && [['📞','Voice','AI dials leads and has live conversations.'], ['✉️','Email','AI sends and replies to emails automatically.'], ['📅','Schedule','Set a time window and rate limit.']].map(([ic,t,d]) => (
          <div key={t as string} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{ic}</span>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: '#8a8d9e', marginBottom: 2 }}>{t}</div><div style={{ fontSize: 11, color: '#4a4d5e', lineHeight: 1.4 }}>{d}</div></div>
          </div>
        ))}
        {step === 2 && [['🎯','Status filter','Choose which leads to include.'], ['🔍','Preview','Check the count before creating.'], ['⚡','Limit','Cap the batch size.']].map(([ic,t,d]) => (
          <div key={t as string} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{ic}</span>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: '#8a8d9e', marginBottom: 2 }}>{t}</div><div style={{ fontSize: 11, color: '#4a4d5e', lineHeight: 1.4 }}>{d}</div></div>
          </div>
        ))}
        {step === 3 && [['✅','Review','Confirm settings before creating.'], ['🕒','Schedule','Time window controls when calls go out.']].map(([ic,t,d]) => (
          <div key={t as string} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{ic}</span>
            <div><div style={{ fontSize: 12, fontWeight: 500, color: '#8a8d9e', marginBottom: 2 }}>{t}</div><div style={{ fontSize: 11, color: '#4a4d5e', lineHeight: 1.4 }}>{d}</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BatchDetail({ batch, onClose, onDelete, onRefresh }: any) {
  const [showSched, setShowSched] = useState(false)
  const [sf, setSf] = useState({ start_datetime:'', end_datetime:'', window_start:'09:00', window_end:'18:00', base_timezone:'Asia/Kolkata', use_lead_timezone:true, allowed_days:['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[], max_per_hour:'20', delay_s:'30' })
  const [saving, setSaving] = useState(false)
  const setSF = (k: string, v: any) => setSf(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => setSF('allowed_days', sf.allowed_days.includes(d) ? sf.allowed_days.filter(x=>x!==d) : [...sf.allowed_days, d])
  const col = STATUS_COLOR[batch.status] || '#5a5d70'
  const pct = batch.lead_count > 0 ? Math.round((batch.leads_processed / batch.lead_count) * 100) : 0
  const inp: React.CSSProperties = { background: '#0f1016', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#f0f1f5', outline: 'none', width: '100%', fontFamily: 'inherit' }

  const saveSched = async () => {
    if (!sf.start_datetime) { toast.error('Start date required'); return }
    setSaving(true)
    try {
      await schedulesApi.create({ batch_id: batch.id, start_datetime: sf.start_datetime, end_datetime: sf.end_datetime||undefined, window_start_time: sf.window_start, window_end_time: sf.window_end, base_timezone: sf.base_timezone, use_lead_timezone: sf.use_lead_timezone, allowed_days: sf.allowed_days, max_per_hour: Number(sf.max_per_hour), delay_between_seconds: Number(sf.delay_s) })
      toast.success('Scheduled!'); setShowSched(false); onRefresh()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{batch.batch_type === 'voice' ? '📞' : '✉️'}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f1f5' }}>{batch.name}</div>
              {batch.campaign_name && <div style={{ fontSize: 11, color: '#4a4d5e', marginTop: 1 }}>{batch.campaign_name}</div>}
            </div>
            <StatusBadge status={batch.status} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4d5e', fontSize: 18, lineHeight: 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f0f1f5' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#4a4d5e' }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Progress */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: '#5a5d70' }}>Progress</span>
              <span style={{ color: col, fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[['Total',batch.lead_count,'#a594ff'],['Processed',batch.leads_processed,'#4da6ff'],['Won',batch.leads_succeeded,'#3ecf8e'],['Failed',batch.leads_failed,'#f25757']].map(([l,v,c]) => (
              <div key={l as string} style={{ background: '#13141a', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: c as string }}>{v as number}</div>
              </div>
            ))}
          </div>
          {/* Details */}
          {[['Type', batch.batch_type], ['Mode', batch.call_mode||'—'], ['Product', batch.product_focus||'—']].map(([l,v]) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#4a4d5e' }}>{l}</span>
              <span style={{ color: '#c8cad8', fontWeight: 500, textTransform: 'capitalize' }}>{v}</span>
            </div>
          ))}

          {/* Schedule button */}
          {!['completed','running'].includes(batch.status) && !showSched && (
            <button onClick={() => setShowSched(true)} style={{ padding: '9px 0', borderRadius: 8, background: 'rgba(124,110,255,0.08)', border: '1px solid rgba(124,110,255,0.25)', color: '#a594ff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ◷ Add / Update Schedule
            </button>
          )}

          {showSched && (
            <div style={{ background: '#13141a', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#f0f1f5', marginBottom: 2 }}>Schedule Settings</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Start *</div><input type="datetime-local" value={sf.start_datetime} onChange={e => setSF('start_datetime', e.target.value)} style={inp} /></div>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>End</div><input type="datetime-local" value={sf.end_datetime} onChange={e => setSF('end_datetime', e.target.value)} style={inp} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Window start</div><input type="time" value={sf.window_start} onChange={e => setSF('window_start', e.target.value)} style={inp} /></div>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Window end</div><input type="time" value={sf.window_end} onChange={e => setSF('window_end', e.target.value)} style={inp} /></div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {DAYS.map(d => <button key={d} onClick={() => toggleDay(d)} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${sf.allowed_days.includes(d) ? 'rgba(124,110,255,0.5)' : 'rgba(255,255,255,0.07)'}`, background: sf.allowed_days.includes(d) ? 'rgba(124,110,255,0.12)' : 'transparent', color: sf.allowed_days.includes(d) ? '#c4b5fd' : '#5a5d70' }}>{d.slice(0,3)}</button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Max/hr</div><input type="number" value={sf.max_per_hour} onChange={e => setSF('max_per_hour', e.target.value)} style={inp} /></div>
                <div><div style={{ fontSize: 10, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Delay (s)</div><input type="number" value={sf.delay_s} onChange={e => setSF('delay_s', e.target.value)} style={inp} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button onClick={() => setShowSched(false)}>Cancel</Button>
                <Button variant="primary" loading={saving} onClick={saveSched} style={{ flex: 1, justifyContent: 'center' }}>Save Schedule</Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Button variant="danger" onClick={onDelete}>Delete Batch</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}