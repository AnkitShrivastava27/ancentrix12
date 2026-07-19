'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { callsApi } from '@/lib/api'
import { Spinner, EmptyState, Modal, Button, Tabs } from '@/components/ui'
import toast from 'react-hot-toast'

const fmt = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
function timeAgo(s: string) {
  const d = Math.floor((Date.now()-new Date(s).getTime())/1000)
  return d < 60 ? `${d}s` : d < 3600 ? `${Math.floor(d/60)}m` : d < 86400 ? `${Math.floor(d/3600)}h` : `${Math.floor(d/86400)}d`
}

export default function CallsPage() {
  const [dir, setDir]       = useState('')
  const [calls, setCalls]   = useState<any[]>([])
  const [total, setTotal]   = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<any>(null)
  const LIMIT = 25

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r: any = await callsApi.list({ direction:dir||undefined, limit:LIMIT, offset })
      setCalls(r.calls||[]); setTotal(r.total||0)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [dir, offset])
  useEffect(() => { load() }, [load])

  const pages = Math.ceil(total / LIMIT)
  const page  = Math.floor(offset / LIMIT) + 1

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Call Logs</h1>
        <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>{total} total calls</p>
      </div>

      {/* Direction tabs + count */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <Tabs active={dir||'all'} onChange={v => { setDir(v==='all'?'':v); setOffset(0) }}
          tabs={[{ id:'all', label:'All' }, { id:'inbound', label:'↙ Inbound' }, { id:'outbound', label:'↗ Outbound' }]} />
      </div>

      <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'40px 130px 80px 80px 60px 1fr 70px', padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          {['','Number','Duration','Status','Mood','Summary','Time'].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:600, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:48 }}><Spinner size={24} /></div>
        ) : calls.length === 0 ? (
          <EmptyState icon="📞" title="No calls yet" description="Calls appear here once your Telnyx number is connected" />
        ) : calls.map((c, i) => (
          <div key={c.id}
            style={{ display:'grid', gridTemplateColumns:'40px 130px 80px 80px 60px 1fr 70px', alignItems:'center', padding:'10px 16px', borderBottom: i < calls.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor:'pointer', transition:'background 0.1s', background:'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#1e1f28' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent' }}
            onClick={() => setDetail(c)}>
            <div style={{ width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
              background: c.direction==='inbound' ? 'rgba(77,166,255,0.1)' : 'rgba(165,148,255,0.1)',
              color: c.direction==='inbound' ? '#4da6ff' : '#a594ff' }}>
              {c.direction==='inbound'?'↙':'↗'}
            </div>
            <div style={{ fontSize:12, color:'#8a8d9e', fontFamily:'monospace' }}>{c.direction==='inbound'?c.from_number:c.to_number}</div>
            <div style={{ fontSize:12, color:'#5a5d70', fontFamily:'monospace' }}>{fmt(c.duration_seconds||0)}</div>
            <div style={{ fontSize:12, fontWeight:500, color: c.status==='completed'?'#3ecf8e': c.status==='failed'?'#f25757':'#5a5d70' }}>{c.status}</div>
            <div style={{ fontSize:16 }}>{c.sentiment==='positive'?'😊':c.sentiment==='negative'?'😟':c.sentiment==='neutral'?'😐':'—'}</div>
            <div style={{ fontSize:12, color:'#4a4d5e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.summary||'—'}</div>
            <div style={{ fontSize:11, color:'#3a3d4e', textAlign:'right' }}>{c.created_at ? timeAgo(c.created_at) : '—'}</div>
          </div>
        ))}

        {pages > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
            <Button size="sm" disabled={page===1} onClick={() => setOffset(offset-LIMIT)}>← Prev</Button>
            <span style={{ fontSize:12, color:'#5a5d70' }}>Page {page} of {pages}</span>
            <Button size="sm" disabled={page===pages} onClick={() => setOffset(offset+LIMIT)}>Next →</Button>
          </div>
        )}
      </div>

      {detail && (
        <Modal open title="Call Details" onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Close</Button>} size="md">
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[['Direction',detail.direction],['Duration',fmt(detail.duration_seconds||0)],['Mode',detail.mode||'—'],['Sentiment',detail.sentiment||'—']].map(([l,v]) => (
                <div key={l as string} style={{ background:'#13141a', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#4a4d5e', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#e8eaf0', textTransform:'capitalize' }}>{v}</div>
                </div>
              ))}
            </div>
            {detail.summary && (
              <div style={{ background:'rgba(124,110,255,0.06)', border:'1px solid rgba(124,110,255,0.15)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'#a594ff', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>AI Summary</div>
                <p style={{ fontSize:13, color:'#d0d3e0', lineHeight:1.5, margin:0 }}>{detail.summary}</p>
              </div>
            )}
            {(detail.conversation_history||[]).length > 0 && (
              <div>
                <div style={{ fontSize:10, color:'#3a3d4e', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Conversation</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:280, overflowY:'auto' }}>
                  {detail.conversation_history.map((m: any, i: number) => (
                    <div key={i} style={{ display:'flex', justifyContent: m.role==='assistant' ? 'flex-start' : 'flex-end' }}>
                      <div style={{ maxWidth:'80%', padding:'8px 12px', borderRadius:10, fontSize:12, lineHeight:1.5,
                        background: m.role==='assistant' ? 'rgba(124,110,255,0.1)' : 'rgba(62,207,142,0.08)',
                        color: '#e8eaf0', border: `1px solid ${m.role==='assistant' ? 'rgba(124,110,255,0.15)' : 'rgba(62,207,142,0.12)'}` }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}