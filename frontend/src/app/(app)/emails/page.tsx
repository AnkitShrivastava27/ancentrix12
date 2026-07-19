'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { emailsApi, batchesApi } from '@/lib/api'
import { Modal, Button, Spinner, EmptyState, Tabs, StatCard } from '@/components/ui'
import toast from 'react-hot-toast'

const S_STYLE: Record<string, { color: string; bg: string }> = {
  queued:    { color:'#5a5d70', bg:'rgba(90,93,112,0.1)'  },
  sent:      { color:'#4da6ff', bg:'rgba(77,166,255,0.1)' },
  delivered: { color:'#3ecf8e', bg:'rgba(62,207,142,0.1)' },
  opened:    { color:'#a594ff', bg:'rgba(165,148,255,0.1)'},
  replied:   { color:'#3ecf8e', bg:'rgba(62,207,142,0.15)'},
  bounced:   { color:'#f25757', bg:'rgba(242,87,87,0.1)'  },
  failed:    { color:'#f25757', bg:'rgba(242,87,87,0.1)'  },
}
const REPLY_COLOR: Record<string, string> = {
  unread:'#5a5d70', ai_replied:'#3ecf8e', queued_for_review:'#f5a623', human_replied:'#a594ff', ignored:'#3a3d4e',
}

export default function EmailsPage() {
  const [tab, setTab]           = useState('logs')
  const [logs, setLogs]         = useState<any[]>([])
  const [queue, setQueue]       = useState<any[]>([])
  const [stats, setStats]       = useState<any>(null)
  const [batches, setBatches]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [draft, setDraft]       = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [polling, setPolling]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, q, s, b] = await Promise.all([
        emailsApi.logs({ batch_id:batchFilter||undefined, status:statusFilter||undefined, limit:100 }),
        emailsApi.queue(),
        emailsApi.stats(batchFilter ? { batch_id:batchFilter } : undefined),
        batchesApi.list({ batch_type:'email' }),
      ])
      setLogs(Array.isArray(l) ? l : [])
      setQueue(Array.isArray(q) ? q : [])
      setStats(s)
      setBatches(Array.isArray(b) ? b : [])
    } catch {} finally { setLoading(false) }
  }, [batchFilter, statusFilter])
  useEffect(() => { load() }, [load])

  const approve = async () => {
    try { await emailsApi.approveReply({ email_log_id: selected.id, edited_body: draft||undefined }); toast.success('Reply sent!'); setSelected(null); load() }
    catch { toast.error('Failed') }
  }
  const manualReply = async () => {
    if (!draft) return
    try { await emailsApi.send({ email_log_id: selected.id, reply_body: draft }); toast.success('Sent!'); setSelected(null); load() }
    catch { toast.error('Failed') }
  }
  const pollReplies = async () => {
    setPolling(true)
    try { await emailsApi.pollReplies(); toast.success('Polling… refreshing in 5s'); setTimeout(load, 5000) }
    catch { toast.error('Poll failed') }
    finally { setPolling(false) }
  }

  const display = tab === 'review' ? queue : logs

  return (
    <div style={{ maxWidth: 1060 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600, color:'#f0f1f5', margin:0, letterSpacing:'-0.02em' }}>Email Campaigns</h1>
          <p style={{ fontSize:13, color:'#5a5d70', marginTop:3 }}>AI-powered email outreach and reply management</p>
        </div>
        <button onClick={pollReplies} disabled={polling} style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'#8a8d9e', fontSize:13, cursor:'pointer', fontFamily:'inherit', opacity:polling?0.5:1 }}>
          {polling ? <Spinner size={12} /> : '📬'} Poll Replies
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:8, marginBottom:20 }}>
          {[['Sent',stats.sent,'#4da6ff'],['Opened',stats.opened,'#a594ff'],['Replied',stats.replied,'#3ecf8e'],['Bounced',stats.bounced,'#f25757'],['Open %',`${stats.open_rate||0}%`,'#a594ff'],['Reply %',`${stats.reply_rate||0}%`,'#3ecf8e'],['Auto-replied',stats.ai_auto_replied,'#f5a623'],['For review',stats.pending_review,'#f5a623']].map(([l,v,c]) => (
            <div key={l as string} style={{ background:'#181920', border:`1px solid ${(stats.pending_review>0 && l==='For review') ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
              <div style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:600, color:c as string, letterSpacing:'-0.01em' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab + filters */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <Tabs active={tab} onChange={setTab}
          tabs={[{ id:'logs', label:'All Emails' }, { id:'review', label:`Review Queue${queue.length>0?` (${queue.length})`:''}` }]} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'7px 12px', fontSize:12, color:batchFilter?'#f0f1f5':'#5a5d70', outline:'none', cursor:'pointer', fontFamily:'inherit' }}>
            <option value="">All batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'7px 12px', fontSize:12, color:statusFilter?'#f0f1f5':'#5a5d70', outline:'none', cursor:'pointer', fontFamily:'inherit' }}>
            <option value="">All statuses</option>
            {['queued','sent','delivered','opened','replied','bounced','failed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 160px 90px 70px 140px 50px 80px', padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          {['To','Subject','Status','Sent','Reply Status','Mood','Action'].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:48 }}><Spinner size={24} /></div>
        ) : display.length === 0 ? (
          <EmptyState icon="✉️" title={tab==='review' ? 'No emails pending review' : 'No emails yet'} description={tab==='review' ? 'AI is handling all replies automatically' : 'Send an email batch to see logs here'} />
        ) : display.map((log, i) => {
          const sm = S_STYLE[log.status] || { color:'#5a5d70', bg:'rgba(90,93,112,0.1)' }
          return (
            <div key={log.id}
              style={{ display:'grid', gridTemplateColumns:'1.2fr 160px 90px 70px 140px 50px 80px', alignItems:'center', padding:'10px 16px', borderBottom: i < display.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor:'pointer', transition:'background 0.1s', background:'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#1e1f28' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent' }}
              onClick={() => { setSelected(log); setDraft(log.ai_reply_draft||'') }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, color:'#e8eaf0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.to_name||log.to_email}</div>
                <div style={{ fontSize:11, color:'#4a4d5e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.to_email}</div>
              </div>
              <div style={{ fontSize:12, color:'#6a6d7e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.subject}</div>
              <div><span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, color:sm.color, background:sm.bg }}>{log.status}</span></div>
              <div style={{ fontSize:11, color:'#4a4d5e' }}>{log.sent_at ? new Date(log.sent_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'}</div>
              <div style={{ fontSize:12, fontWeight:500, color:REPLY_COLOR[log.reply_status]||'#4a4d5e' }}>{log.reply_status ? log.reply_status.replace(/_/g,' ') : '—'}</div>
              <div style={{ fontSize:16 }}>{log.reply_sentiment==='positive'?'😊':log.reply_sentiment==='negative'?'😟':log.reply_sentiment==='neutral'?'😐':'—'}</div>
              <div onClick={e => e.stopPropagation()}>
                {log.reply_status==='queued_for_review' ? (
                  <button onClick={() => { setSelected(log); setDraft(log.ai_reply_draft||'') }} style={{ padding:'4px 10px', borderRadius:6, background:'#f5a623', border:'none', color:'#000', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Review</button>
                ) : log.status==='replied' && !log.ai_reply_sent ? (
                  <button onClick={() => { setSelected(log); setDraft('') }} style={{ padding:'4px 10px', borderRadius:6, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#8a8d9e', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Reply</button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <Modal open title="Email Thread" onClose={() => setSelected(null)} size="lg"
          footer={
            <div style={{ display:'flex', gap:8 }}>
              {selected.reply_status==='queued_for_review' && <Button variant="primary" onClick={approve}>✅ Approve & Send</Button>}
              {draft && <Button onClick={manualReply}>📤 Send Manual Reply</Button>}
              <Button onClick={() => setSelected(null)}>Close</Button>
            </div>
          }>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Meta */}
            <div style={{ background:'#13141a', borderRadius:8, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:'#e8eaf0' }}>{selected.to_name} <span style={{ color:'#4a4d5e', fontWeight:400 }}>&lt;{selected.to_email}&gt;</span></div>
                <div style={{ fontSize:12, color:'#5a5d70', marginTop:3 }}>Subject: {selected.subject}</div>
                {selected.reply_sentiment && (
                  <div style={{ display:'flex', gap:12, marginTop:6, fontSize:11 }}>
                    <span style={{ color:'#5a5d70' }}>Mood: {selected.reply_sentiment==='positive'?'😊':selected.reply_sentiment==='negative'?'😟':'😐'} {selected.reply_sentiment}</span>
                    {selected.reply_intent && <span style={{ color:'#a594ff' }}>Intent: {selected.reply_intent}</span>}
                  </div>
                )}
              </div>
              <div style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, ...(S_STYLE[selected.status]||{ color:'#5a5d70', bg:'rgba(90,93,112,0.1)' }) }}>{selected.status}</div>
            </div>

            {/* Thread */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:260, overflowY:'auto' }}>
              {(selected.email_thread||[{ role:'ai', body:selected.body_text }]).map((m: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent: m.role==='ai' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth:'80%', padding:'10px 14px', borderRadius:10, fontSize:13, lineHeight:1.5, whiteSpace:'pre-wrap',
                    background: m.role==='ai' ? 'rgba(62,207,142,0.07)' : 'rgba(77,166,255,0.07)',
                    border: `1px solid ${m.role==='ai' ? 'rgba(62,207,142,0.15)' : 'rgba(77,166,255,0.12)'}`, color:'#e8eaf0' }}>
                    <div style={{ fontSize:10, color:'#4a4d5e', marginBottom:6 }}>{m.role==='ai'?'🤖 AI Agent':'👤 Lead'}</div>
                    {m.body}
                  </div>
                </div>
              ))}
            </div>

            {/* AI confidence */}
            {selected.ai_reply_confidence > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, color:'#4a4d5e', whiteSpace:'nowrap' }}>AI confidence</span>
                <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.round(selected.ai_reply_confidence*100)}%`, background:selected.ai_reply_confidence>=0.75?'#3ecf8e':'#f5a623', borderRadius:2 }} />
                </div>
                <span style={{ fontSize:11, color:selected.ai_reply_confidence>=0.75?'#3ecf8e':'#f5a623', fontFamily:'monospace' }}>{Math.round(selected.ai_reply_confidence*100)}%</span>
              </div>
            )}

            {/* Reply editor */}
            {(selected.reply_status==='queued_for_review' || (selected.status==='replied' && !selected.ai_reply_sent)) && (
              <div>
                <div style={{ fontSize:11, fontWeight:500, color:'#4a4d5e', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
                  {selected.reply_status==='queued_for_review' ? 'Edit AI draft' : 'Write reply'}
                </div>
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
                  placeholder={selected.ai_reply_draft || 'Write reply here…'}
                  style={{ width:'100%', background:'#13141a', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#f0f1f5', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}