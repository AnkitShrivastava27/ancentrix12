'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { knowledgeApi } from '@/lib/api'
import { Spinner, EmptyState } from '@/components/ui'
import toast from 'react-hot-toast'

const FILE_ICON: Record<string, string> = { pdf:'📄', csv:'📊', docx:'📝', txt:'📃' }
const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  completed:  { color:'#3ecf8e', bg:'rgba(62,207,142,0.1)' },
  processing: { color:'#f5a623', bg:'rgba(245,166,35,0.1)' },
  pending:    { color:'#5a5d70', bg:'rgba(90,93,112,0.1)' },
  failed:     { color:'#f25757', bg:'rgba(242,87,87,0.1)' },
}

export default function KnowledgePage() {
  const [docs, setDocs]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag]       = useState(false)
  const [deleting, setDeleting] = useState<string|null>(null)

  const load = useCallback(async () => {
    try { const d: any = await knowledgeApi.list(); setDocs(Array.isArray(d) ? d : []) }
    catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const upload = async (files: File[]) => {
    setUploading(true)
    let ok = 0
    for (const f of files) {
      try { const fd = new FormData(); fd.append('file', f); await knowledgeApi.upload(fd); ok++ }
      catch { toast.error(`Failed: ${f.name}`) }
    }
    if (ok) { toast.success(`${ok} file(s) uploaded`); load() }
    setUploading(false)
  }

  const del = async (id: string) => {
    if (!confirm('Remove this document?')) return
    setDeleting(id)
    try { await knowledgeApi.delete(id); setDocs(d => d.filter(x => x.id !== id)); toast.success('Removed') }
    catch { toast.error('Failed') }
    finally { setDeleting(null) }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#f0f1f5', margin: 0, letterSpacing: '-0.02em' }}>Knowledge Base</h1>
        <p style={{ fontSize: 13, color: '#5a5d70', marginTop: 3 }}>Documents the AI uses during calls and emails</p>
      </div>

      {/* Drop zone */}
      <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const files = Array.from(e.dataTransfer.files); if (files.length) upload(files) }}
        style={{ borderRadius: 12, border: `2px dashed ${drag ? '#7c6eff' : 'rgba(255,255,255,0.08)'}`, background: drag ? 'rgba(124,110,255,0.05)' : '#181920', padding: '36px 24px', textAlign: 'center', marginBottom: 20, transition: 'all 0.15s', cursor: 'pointer' }}>
        {uploading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <Spinner size={28} /><p style={{ fontSize:13, color:'#8a8d9e', margin:0 }}>Uploading…</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:32, opacity:0.3 }}>◈</div>
            <div style={{ fontSize:14, fontWeight:500, color:'#8a8d9e' }}>{drag ? 'Drop to upload' : 'Drop files here or click Browse'}</div>
            <div style={{ fontSize:12, color:'#4a4d5e' }}>PDF, TXT, DOCX, CSV · max 50MB</div>
            <label style={{ cursor:'pointer' }}>
              <input type="file" multiple accept=".pdf,.txt,.docx,.csv" onChange={e => { const files = Array.from(e.target.files||[]); if(files.length) upload(files) }} style={{ display:'none' }} />
              <span style={{ fontSize:12, padding:'6px 16px', borderRadius:20, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'#8a8d9e', cursor:'pointer' }}>Browse Files</span>
            </label>
          </div>
        )}
      </div>

      {/* Docs list */}
      <div style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, fontWeight:500, color:'#8a8d9e', textTransform:'uppercase', letterSpacing:'0.06em' }}>Documents ({docs.length})</span>
        </div>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={22} /></div>
        ) : docs.length === 0 ? (
          <EmptyState icon="◈" title="No documents yet" description="Upload PDFs, TXT, DOCX or CSV files to power your AI" />
        ) : (
          docs.map((doc, i) => {
            const sm = STATUS_STYLE[doc.status] || STATUS_STYLE.pending
            return (
              <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom: i < docs.length-1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition:'background 0.1s', background:'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#1e1f28' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent' }}>
                <div style={{ width:36, height:36, borderRadius:8, background:'rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                  {FILE_ICON[doc.file_type]||'📄'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#e8eaf0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.filename}</div>
                  <div style={{ display:'flex', gap:10, marginTop:3 }}>
                    <span style={{ fontSize:11, color:'#4a4d5e' }}>{fmtSize(doc.file_size||0)}</span>
                    {doc.chunks_count > 0 && <span style={{ fontSize:11, color:'#4a4d5e' }}>{doc.chunks_count} chunks</span>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {doc.status==='processing' && <Spinner size={12} />}
                  <span style={{ fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:20, color:sm.color, background:sm.bg }}>{doc.status}</span>
                  <button onClick={() => del(doc.id)} disabled={deleting===doc.id} style={{ width:26, height:26, borderRadius:6, background:'transparent', border:'none', cursor:'pointer', color:'#3a3d4e', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.1s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='rgba(242,87,87,0.1)'; el.style.color='#f25757' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color='#3a3d4e' }}>
                    {deleting===doc.id ? <Spinner size={10} /> : '✕'}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Tips */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16 }}>
        {[['◈','What to upload','Product catalogs, FAQs, pricing sheets, support docs'],['◉','Best format','Clean PDFs or plain text. CSV tables also work well.'],['⚡','How it works','Docs are chunked, embedded, and retrieved live during calls.']].map(([ic,t,d]) => (
          <div key={t as string} style={{ background:'#181920', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:20, marginBottom:8, color:'#4a4d5e' }}>{ic}</div>
            <div style={{ fontSize:12, fontWeight:500, color:'#8a8d9e', marginBottom:4 }}>{t}</div>
            <div style={{ fontSize:11, color:'#4a4d5e', lineHeight:1.4 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  )
}