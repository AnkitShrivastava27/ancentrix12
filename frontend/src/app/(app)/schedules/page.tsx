'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { schedulesApi, batchesApi } from '@/lib/api'
import { Button, Input, Tabs, StatusBadge, Spinner, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

// datetime-local input gives a naive string like "2026-06-19T11:59" in the
// BROWSER's local timezone (IST for the user). The backend compares
// start_datetime against datetime.utcnow(), so we must convert to UTC
// before sending — otherwise IST times appear "in the future" to UTC
// comparisons and never fire (off by ~5.5 hours).
function localToUTCString(localDatetimeStr: string): string {
  if (!localDatetimeStr) return ''
  // new Date() parses "2026-06-19T11:59" as local browser time automatically
  const d = new Date(localDatetimeStr)
  return d.toISOString()  // always UTC, e.g. "2026-06-19T06:29:00.000Z"
}

// Reverse: convert a UTC ISO string from backend back to a local
// datetime-local input value (for editing existing schedules)
function utcToLocalInputValue(utcStr: string): string {
  if (!utcStr) return ''
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

export default function SchedulesPage() {
  const [tab, setTab]           = useState('list')
  const [schedules, setSchedules] = useState<any[]>([])
  const [batches, setBatches]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<any>(null)
  const [form, setForm]         = useState(defaultForm())

  function defaultForm() {
    return { batch_id:'', start_datetime:'', end_datetime:'', window_start_time:'09:00', window_end_time:'18:00', base_timezone:'Asia/Kolkata', use_lead_timezone:true, allowed_days:['Monday','Tuesday','Wednesday','Thursday','Friday'] as string[], max_per_hour:'20', delay_between_seconds:'30' }
  }
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const toggleDay = (d: string) => set('allowed_days', form.allowed_days.includes(d) ? form.allowed_days.filter(x=>x!==d) : [...form.allowed_days, d])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, b] = await Promise.all([schedulesApi.list(), batchesApi.list()])
      setSchedules(Array.isArray(s) ? s : [])
      setBatches(Array.isArray(b) ? b : [])
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const batchName = (id: string) => batches.find(b => b.id === id)?.name || id.slice(0,8)

  const openEdit = (s: any) => {
    setEditing(s)
    setForm({ batch_id:s.batch_id, start_datetime:utcToLocalInputValue(s.start_datetime)||'', end_datetime:utcToLocalInputValue(s.end_datetime)||'', window_start_time:s.window_start_time||'09:00', window_end_time:s.window_end_time||'18:00', base_timezone:s.base_timezone||'Asia/Kolkata', use_lead_timezone:s.use_lead_timezone??true, allowed_days:s.allowed_days||['Monday','Tuesday','Wednesday','Thursday','Friday'], max_per_hour:String(s.max_per_hour||20), delay_between_seconds:String(s.delay_between_seconds||30) })
    setTab('form')
  }

  const resetAndList = () => { setEditing(null); setForm(defaultForm()); setTab('list') }

  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.batch_id || !form.start_datetime) { toast.error('Batch and start date required'); return }
    setSaving(true)
    try {
      const payload = { batch_id:form.batch_id, start_datetime:localToUTCString(form.start_datetime), end_datetime:form.end_datetime?localToUTCString(form.end_datetime):undefined, window_start_time:form.window_start_time, window_end_time:form.window_end_time, base_timezone:form.base_timezone, use_lead_timezone:form.use_lead_timezone, allowed_days:form.allowed_days, max_per_hour:Number(form.max_per_hour), delay_between_seconds:Number(form.delay_between_seconds) }
      if (editing) { await schedulesApi.update(editing.id, payload); toast.success('Updated') }
      else { await schedulesApi.create(payload); toast.success('Created') }
      resetAndList(); load()
    } catch (e: any) { toast.error(e.message||'Failed') } finally { setSaving(false) }
  }

  const deleteS = async (id: string) => {
    if (!confirm('Delete schedule?')) return
    try { await schedulesApi.delete(id); toast.success('Deleted'); load() }
    catch { toast.error('Failed') }
  }

  const toggleActive = async (s: any) => {
    try { await schedulesApi.update(s.id, { is_active: !s.is_active }); toast.success(s.is_active ? 'Paused' : 'Activated'); load() }
    catch { toast.error('Failed') }
  }

  const inp: React.CSSProperties = { background: '#13141a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#f0f1f5', outline: 'none', width: '100%', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#4a4d5e', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Schedules</h1>
        <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>Control when batches run — time windows, days, rate limits</p>
      </div>

      <Tabs active={tab} onChange={t => { if (t === 'list') resetAndList(); else setTab(t) }}
        tabs={[{ id:'list', label:'All Schedules', count:schedules.length }, { id:'form', label: editing ? '✏ Edit Schedule' : '+ New Schedule' }]} />

      {/* ── LIST ── */}
      {tab === 'list' && (
        <div style={{ background: '#181920', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 160px 90px 120px', padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            {['Batch','Window','Days','Rate','Actions'].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
            ))}
          </div>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:48 }}><Spinner size={24} /></div>
          ) : schedules.length === 0 ? (
            <EmptyState icon="◷" title="No schedules yet" description="Attach a schedule to a batch to control when it runs"
              action={<Button variant="primary" onClick={() => setTab('form')}>+ New Schedule</Button>} />
          ) : schedules.map((s, i) => {
            const batch = batches.find(b => b.id === s.batch_id)
            return (
              <div key={s.id} style={{ display:'grid', gridTemplateColumns:'1fr 110px 160px 90px 120px', alignItems:'center', padding:'12px 16px', borderBottom: i < schedules.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: s.is_active ? 'rgba(62,207,142,0.02)' : 'transparent', transition:'background 0.1s' }}>
                {/* Batch */}
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <span style={{ fontSize:14 }}>{batch?.batch_type==='voice'?'📞':'✉️'}</span>
                    <span style={{ fontSize:13, fontWeight:500, color:'#e8eaf0' }}>{batchName(s.batch_id)}</span>
                    {batch && <StatusBadge status={batch.status} />}
                    {!s.is_active && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background:'rgba(245,166,35,0.1)', color:'#f5a623' }}>paused</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#4a4d5e', paddingLeft:22 }}>
                    {new Date(s.start_datetime).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                    {s.end_datetime && ` → ${new Date(s.end_datetime).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}`}
                  </div>
                </div>
                {/* Window */}
                <div>
                  <div style={{ fontSize:12, color:'#8a8d9e' }}>{s.window_start_time}–{s.window_end_time}</div>
                  <div style={{ fontSize:10, color:'#4a4d5e', marginTop:2 }}>{s.base_timezone}</div>
                </div>
                {/* Days */}
                <div>
                  <div style={{ fontSize:11, color:'#8a8d9e' }}>{(s.allowed_days||[]).map((d: string)=>d.slice(0,3)).join(', ')}</div>
                  {s.use_lead_timezone && <div style={{ fontSize:10, color:'#3ecf8e', marginTop:2 }}>✓ per-lead TZ</div>}
                </div>
                {/* Rate */}
                <div>
                  <div style={{ fontSize:12, color:'#8a8d9e' }}>{s.max_per_hour}/hr</div>
                  <div style={{ fontSize:10, color:'#4a4d5e', marginTop:2 }}>{s.delay_between_seconds}s gap</div>
                </div>
                {/* Actions */}
                <div style={{ display:'flex', gap:5 }}>
                  <button onClick={() => toggleActive(s)} title={s.is_active?'Pause':'Activate'} style={{ width:28, height:28, borderRadius:6, border:'none', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', background: s.is_active ? 'rgba(245,166,35,0.1)' : 'rgba(62,207,142,0.1)', color: s.is_active ? '#f5a623' : '#3ecf8e', transition:'all 0.1s' }}>{s.is_active?'⏸':'▶'}</button>
                  <button onClick={() => openEdit(s)} style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(255,255,255,0.07)', background:'transparent', cursor:'pointer', fontSize:11, color:'#8a8d9e', display:'flex', alignItems:'center', justifyContent:'center' }}>✏</button>
                  <button onClick={() => deleteS(s.id)} style={{ width:28, height:28, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', fontSize:12, color:'#3a3d4e', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.1s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='rgba(242,87,87,0.1)'; el.style.color='#f25757' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color='#3a3d4e' }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── FORM ── */}
      {tab === 'form' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 240px', gap:16, maxWidth:820 }}>
          <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#f0f1f5' }}>{editing ? 'Edit Schedule' : 'New Schedule'}</div>

            {/* Batch picker */}
            <div>
              <label style={lbl}>Batch *</label>
              <select value={form.batch_id} onChange={e => set('batch_id', e.target.value)} disabled={!!editing} style={{ ...inp, opacity: editing ? 0.5 : 1 }}>
                <option value="">Select a batch…</option>
                {batches.filter(b => !['completed','failed'].includes(b.status)).map(b => (
                  <option key={b.id} value={b.id}>{b.batch_type==='voice'?'📞':'✉️'} {b.name} ({b.lead_count} leads · {b.status})</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Start *</label><input type="datetime-local" value={form.start_datetime} onChange={e => set('start_datetime', e.target.value)} style={inp} /></div>
              <div><label style={lbl}>End (optional)</label><input type="datetime-local" value={form.end_datetime} onChange={e => set('end_datetime', e.target.value)} style={inp} /></div>
            </div>

            {/* Window */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div><label style={lbl}>Window start</label><input type="time" value={form.window_start_time} onChange={e => set('window_start_time', e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Window end</label><input type="time" value={form.window_end_time} onChange={e => set('window_end_time', e.target.value)} style={inp} /></div>
            </div>

            {/* Timezone */}
            <div>
              <label style={lbl}>Timezone</label>
              <select value={form.base_timezone} onChange={e => set('base_timezone', e.target.value)} style={inp}>
                {['Asia/Kolkata','Asia/Dubai','Asia/Singapore','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles','UTC'].map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>

            {/* Per-lead TZ */}
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid rgba(255,255,255,0.05)' }}>
              <input type="checkbox" checked={form.use_lead_timezone} onChange={e => set('use_lead_timezone', e.target.checked)} style={{ accentColor:'#7c6eff', width:14, height:14 }} />
              <div>
                <div style={{ fontSize:13, color:'#c8cad8', fontWeight:500 }}>Per-lead timezone</div>
                <div style={{ fontSize:11, color:'#4a4d5e', marginTop:1 }}>Override base TZ with each lead's own timezone</div>
              </div>
            </label>

            {/* Days */}
            <div>
              <label style={lbl}>Allowed days</label>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => toggleDay(d)} style={{ padding:'4px 11px', borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${form.allowed_days.includes(d) ? 'rgba(124,110,255,0.5)' : 'rgba(255,255,255,0.07)'}`, background:form.allowed_days.includes(d) ? 'rgba(124,110,255,0.12)' : 'transparent', color:form.allowed_days.includes(d) ? '#c4b5fd' : '#5a5d70', transition:'all 0.1s' }}>{d.slice(0,3)}</button>
                ))}
              </div>
            </div>

            {/* Rate */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Input label="Max per hour" type="number" value={form.max_per_hour} onChange={e => set('max_per_hour', e.target.value)} />
              <Input label="Delay between (sec)" type="number" value={form.delay_between_seconds} onChange={e => set('delay_between_seconds', e.target.value)} />
            </div>

            <div style={{ display:'flex', gap:8, paddingTop:4 }}>
              <Button onClick={resetAndList}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!form.batch_id || !form.start_datetime} onClick={save} style={{ flex:1, justifyContent:'center' }}>
                {editing ? 'Save Changes' : 'Create Schedule'}
              </Button>
            </div>
          </div>

          {/* Preview panel */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {form.batch_id && (
              <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Preview</div>
                {[['Batch', batchName(form.batch_id)], ['Window', `${form.window_start_time}–${form.window_end_time}`], ['Days', form.allowed_days.map(d=>d.slice(0,3)).join(', ')||'—'], ['Rate', `${form.max_per_hour}/hr · ${form.delay_between_seconds}s`]].map(([l,v]) => (
                  <div key={l as string} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                    <span style={{ color:'#4a4d5e' }}>{l}</span>
                    <span style={{ color:'#c8cad8', fontWeight:500 }}>{v}</span>
                  </div>
                ))}
                {form.use_lead_timezone && <div style={{ fontSize:11, color:'#3ecf8e', marginTop:4 }}>✓ Per-lead timezone enabled</div>}
              </div>
            )}
            <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:14 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>How it works</div>
              {[['🕒','Window','Calls only go out in the set daily window'],['🗓','Days','Block weekends or specific days'],['🌏','Lead TZ','Call each lead in their own timezone'],['⚡','Rate','Cap calls/hr and add delay between']].map(([ic,t,d]) => (
                <div key={t as string} style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{ic}</span>
                  <div><div style={{ fontSize:12, fontWeight:500, color:'#8a8d9e' }}>{t}</div><div style={{ fontSize:11, color:'#4a4d5e', lineHeight:1.4, marginTop:1 }}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}