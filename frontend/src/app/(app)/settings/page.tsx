'use client'
import React, { useEffect, useState } from 'react'
import { companyApi, apiClient } from '@/lib/api'
import { Button, Input, Textarea, Select, Spinner, Tabs, Card, T, PageHeader } from '@/components/ui'
import toast from 'react-hot-toast'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const TABS = [
  { id:'company',      label:'Company'       },
  { id:'agent',        label:'AI Agent'      },
  { id:'products',     label:'Products'      },
  { id:'integrations', label:'Integrations'  },
  { id:'prompts',      label:'Prompts'       },
]

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [isNew,   setIsNew]   = useState(false)
  const [tab,     setTab]     = useState('company')

  const [f, setF] = useState({
    name:'', industry:'', description:'', services:'', faqs:'',
    location:'', contact_number:'', forward_number:'', website:'',
    agent_name:'Aria', voice_gender:'female', voice_language:'en-IN', tts_provider:'telnyx',
    greeting_inbound:'', greeting_outbound:'',
    inbound_system_prompt:'', outbound_sales_prompt:'',
    telnyx_phone_number:'', active_product:'',
    business_hours:{} as Record<string,string>,
    products:[] as any[],
  })

  // API keys — stored separately, never returned from GET (masked)
  const [keys, setKeys] = useState({
    telnyx_api_key:       '',
    telnyx_connection_id: '',
    deepgram_api_key:     '',
    groq_api_key:         '',
    webhook_base_url:     '',
  })
  const [keysSaving, setKeysSaving] = useState(false)
  const [keysStatus, setKeysStatus] = useState<'idle'|'saved'|'error'>('idle')

  useEffect(() => {
    ;(async () => {
      try {
        const d: any = await companyApi.get()
        if (d) { setF(p => ({ ...p, ...d, products: d.products||[] })) }
        else   { setIsNew(true) }
        // Load masked key status
        try {
          const ks: any = await apiClient.get('/company/integration-status')
          if (ks) setKeys(p => ({ ...p, ...ks }))
        } catch {}
      } catch { setIsNew(true) }
      finally { setLoading(false) }
    })()
  }, [])

  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      if (isNew) { await companyApi.create(f); setIsNew(false); toast.success('Company created!') }
      else       { await companyApi.update(f); toast.success('Settings saved') }
    } catch (e: any) { toast.error(e.message||'Failed to save') }
    finally { setSaving(false) }
  }

  const saveKeys = async () => {
    setKeysSaving(true); setKeysStatus('idle')
    try {
      await apiClient.patch('/company/integrations', keys)
      setKeysStatus('saved')
      toast.success('API keys saved securely')
    } catch (e: any) {
      setKeysStatus('error')
      toast.error(e.message||'Failed to save keys')
    } finally { setKeysSaving(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}><Spinner size={28} /></div>

  const g2 = (a: React.ReactNode, b: React.ReactNode) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>{a}{b}</div>
  )

  return (
    <div style={{ maxWidth:900 }}>
      <PageHeader title="Settings" subtitle="Company profile, AI agent, integrations, and prompts" />

      {isNew && (
        <div style={{ padding:'14px 18px', borderRadius:10, background:'rgba(108,92,231,0.07)', border:'1px solid rgba(108,92,231,0.2)', color:'#a594ff', fontSize:14, marginBottom:20, lineHeight:1.5 }}>
          👋 Welcome! Fill in your company details below and click Save to get started.
        </div>
      )}

      <Tabs active={tab} onChange={setTab} tabs={TABS} />

      {/* ── Company ── */}
      {tab === 'company' && (
        <Card>
          <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
            {g2(
              <Input label="Company Name *" value={f.name} onChange={e => set('name', e.target.value)} />,
              <Input label="Industry" value={f.industry} onChange={e => set('industry', e.target.value)} placeholder="SaaS, Real Estate, Healthcare…" />
            )}
            <Textarea label="Description" value={f.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="What your company does and who you serve…" />
            <Textarea label="Services" value={f.services} onChange={e => set('services', e.target.value)} rows={3} placeholder="List your main services…" />
            <Textarea label="FAQs" value={f.faqs} onChange={e => set('faqs', e.target.value)} rows={4} placeholder={"Q: What are your hours?\nA: Mon–Sat 9am–6pm\n\nQ: Do you offer a free trial?\nA: Yes, 14 days."} />
            {g2(
              <Input label="Location" value={f.location} onChange={e => set('location', e.target.value)} placeholder="Mumbai, India" />,
              <Input label="Website" value={f.website} onChange={e => set('website', e.target.value)} placeholder="https://yourcompany.com" />
            )}
            {g2(
              <Input label="Contact Number" value={f.contact_number} onChange={e => set('contact_number', e.target.value)} placeholder="+91 98765 43210" />,
              <Input label="Transfer / Fallback Number" value={f.forward_number} onChange={e => set('forward_number', e.target.value)} placeholder="+91 98765 43210" hint="Caller is transferred here if they ask for a human" />
            )}
            <div>
              <div style={{ fontSize:12, fontWeight:500, color:T.text3, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Business Hours</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {DAYS.map(day => (
                  <div key={day} style={{ display:'grid', gridTemplateColumns:'110px 1fr', alignItems:'center', gap:14 }}>
                    <span style={{ fontSize:14, color:T.text2 }}>{day}</span>
                    <input value={f.business_hours?.[day]||''} onChange={e => setF(p => ({ ...p, business_hours:{ ...p.business_hours, [day]:e.target.value } }))}
                      placeholder="9:00 AM – 6:00 PM  or  Closed"
                      style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', fontFamily:'inherit' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Agent ── */}
      {tab === 'agent' && (
        <Card>
          <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
            <Input label="Agent Name" value={f.agent_name} onChange={e => set('agent_name', e.target.value)} placeholder="Aria" hint="This is the name your AI uses when introducing itself" />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
              <Select label="Voice Gender" value={f.voice_gender} onChange={e => set('voice_gender', e.target.value)}
                options={[{ value:'female', label:'Female' }, { value:'male', label:'Male' }]} />
              <Select label="Language" value={f.voice_language} onChange={e => set('voice_language', e.target.value)}
                options={[{ value:'en-IN', label:'English (India)' }, { value:'hi-IN', label:'Hindi' }, { value:'en-US', label:'English (US)' }, { value:'en-GB', label:'English (UK)' }]} />
              <Select label="TTS Provider" value={f.tts_provider} onChange={e => set('tts_provider', e.target.value)}
                options={[{ value:'telnyx', label:'Telnyx (Polly)' }, { value:'gtts', label:'gTTS (free)' }]} />
            </div>
            <Textarea label="Inbound Greeting" value={f.greeting_inbound} onChange={e => set('greeting_inbound', e.target.value)} rows={3}
              placeholder={`Namaste! I'm ${f.agent_name||'Aria'} from ${f.name||'[Company]'}. How can I help you today?`} />
            <Textarea label="Outbound Greeting" value={f.greeting_outbound} onChange={e => set('greeting_outbound', e.target.value)} rows={3}
              placeholder={`Hey! This is ${f.agent_name||'Aria'} calling from ${f.name||'[Company]'}. Is this a good time to talk?`} />
          </div>
        </Card>
      )}

      {/* ── Products ── */}
      {tab === 'products' && (
        <>
          <Card style={{ marginBottom:14 }}>
            <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ fontSize:14, color:T.text2, margin:0, lineHeight:1.6 }}>Add your products or services below. The AI references these during calls to pitch the right product.</p>
              <Input label="Active Product to Pitch" value={f.active_product} onChange={e => set('active_product', e.target.value)} placeholder="Must match a product name below" hint="Leave blank to let the AI choose based on conversation" />
            </div>
          </Card>
          {f.products.map((p, i) => (
            <Card key={i} style={{ marginBottom:14 }}
              title={`Product ${i+1}: ${p.name||'Unnamed'}`}
              action={<Button variant="danger" size="sm" onClick={() => set('products', f.products.filter((_: any, idx: number) => idx!==i))}>Remove</Button>}>
              <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
                {g2(
                  <Input label="Name *" value={p.name} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, name:e.target.value} : x))} />,
                  <Input label="Price" value={p.price} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, price:e.target.value} : x))} placeholder="₹999/month" />
                )}
                <Textarea label="Description" value={p.description} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, description:e.target.value} : x))} rows={2} />
                <Input label="Features (comma separated)" value={Array.isArray(p.features)?p.features.join(', '):''} onChange={e => set('products', f.products.map((x: any, idx: number) => idx===i ? {...x, features:e.target.value.split(',').map((s: string)=>s.trim())} : x))} placeholder="Feature 1, Feature 2, Feature 3" />
              </div>
            </Card>
          ))}
          <Button variant="secondary" onClick={() => set('products', [...f.products, { name:'', description:'', price:'', features:[] }])}>+ Add Product</Button>
        </>
      )}

      {/* ── Integrations ── */}
      {tab === 'integrations' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Telnyx */}
          <Card title="Telnyx — Telephony" subtitle="Your Telnyx account credentials for making and receiving calls">
            <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
              <Input label="Telnyx API Key" type="password" value={keys.telnyx_api_key} onChange={e => setKeys(p => ({...p, telnyx_api_key:e.target.value}))}
                placeholder="KEY0…" hint="Found in Telnyx portal → API Keys" />
              <Input label="DID Phone Number" value={keys.telnyx_phone_number||f.telnyx_phone_number} onChange={e => { setKeys(p => ({...p, telnyx_phone_number:e.target.value})); set('telnyx_phone_number', e.target.value) }}
                placeholder="+19162348051" hint="The number you purchased in Telnyx. Include country code." />
              <Input label="TeXML App Connection ID" value={keys.telnyx_connection_id} onChange={e => setKeys(p => ({...p, telnyx_connection_id:e.target.value}))}
                placeholder="1234567890" hint="Found in Telnyx portal → Voice → TeXML Apps → your app ID" />
              <Input label="Webhook Base URL" value={keys.webhook_base_url} onChange={e => setKeys(p => ({...p, webhook_base_url:e.target.value}))}
                placeholder="https://yourserver.com" hint="Your server URL — no trailing slash. Telnyx will call /api/v1/telephony/webhook" />
              <div style={{ padding:'12px 16px', background:'rgba(0,212,170,0.05)', border:'1px solid rgba(0,212,170,0.15)', borderRadius:9 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.green, marginBottom:4 }}>Webhook URL to configure in Telnyx</div>
                <code style={{ fontSize:13, color:T.text2 }}>{keys.webhook_base_url||'https://yourserver.com'}/api/v1/telephony/webhook</code>
              </div>
            </div>
          </Card>

          {/* Deepgram */}
          <Card title="Deepgram — Speech Recognition" subtitle="Converts caller speech to text in real time">
            <div style={{ padding:'20px' }}>
              <Input label="Deepgram API Key" type="password" value={keys.deepgram_api_key} onChange={e => setKeys(p => ({...p, deepgram_api_key:e.target.value}))}
                placeholder="…" hint="Found at deepgram.com → Console → API Keys" />
            </div>
          </Card>

          {/* Groq / LLM */}
          <Card title="Groq — AI Language Model" subtitle="Powers the AI conversation and intent detection">
            <div style={{ padding:'20px' }}>
              <Input label="Groq API Key" type="password" value={keys.groq_api_key} onChange={e => setKeys(p => ({...p, groq_api_key:e.target.value}))}
                placeholder="gsk_…" hint="Found at console.groq.com → API Keys" />
            </div>
          </Card>

          {/* Save button */}
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <Button variant="primary" size="lg" loading={keysSaving} onClick={saveKeys}>Save API Keys</Button>
            {keysStatus === 'saved' && <span style={{ fontSize:14, color:T.green }}>✓ Saved securely</span>}
            {keysStatus === 'error' && <span style={{ fontSize:14, color:T.red }}>Failed to save</span>}
          </div>

          <div style={{ padding:'14px 18px', background:'rgba(108,92,231,0.06)', border:'1px solid rgba(108,92,231,0.15)', borderRadius:10, fontSize:13, color:T.text2, lineHeight:1.6 }}>
            🔒 API keys are stored encrypted in your <code>.env</code> file and never returned to the browser after saving. To rotate a key, just paste the new one and save again.
          </div>
        </div>
      )}

      {/* ── Prompts ── */}
      {tab === 'prompts' && (
        <Card>
          <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
            <p style={{ fontSize:14, color:T.text2, margin:0, lineHeight:1.6 }}>Leave blank to use auto-generated prompts. Custom prompts override defaults entirely. Use <code style={{ background:T.surface2, padding:'1px 6px', borderRadius:4, fontSize:13 }}>{'{agent_name}'}</code>, <code style={{ background:T.surface2, padding:'1px 6px', borderRadius:4, fontSize:13 }}>{'{company_name}'}</code>, <code style={{ background:T.surface2, padding:'1px 6px', borderRadius:4, fontSize:13 }}>{'{rag_context}'}</code> as placeholders.</p>
            <Textarea label="Inbound Support Prompt" value={f.inbound_system_prompt} onChange={e => set('inbound_system_prompt', e.target.value)} rows={10}
              placeholder={"You are {agent_name}, a support agent at {company_name}.\n\nKnowledge base:\n{rag_context}\n\nInstructions:\n- Keep replies under 2 sentences\n- Match the caller's language\n- Be warm and helpful"} />
            <Textarea label="Outbound Sales Prompt" value={f.outbound_sales_prompt} onChange={e => set('outbound_sales_prompt', e.target.value)} rows={10}
              placeholder={"You are {agent_name}, a sales executive at {company_name}.\n\nProduct:\n{product_info}\n\nLead:\n{lead_name} — {lead_notes}\n\nInstructions:\n- Keep replies conversational, max 2 sentences\n- Ask open questions to understand their needs\n- Offer a callback if they're busy"} />
          </div>
        </Card>
      )}

      {/* Save button — not shown on integrations tab */}
      {tab !== 'integrations' && (
        <div style={{ display:'flex', justifyContent:'flex-end', paddingTop:16, paddingBottom:40 }}>
          <Button variant="primary" size="lg" loading={saving} onClick={save}>
            {isNew ? '🚀 Create Company' : '💾 Save Settings'}
          </Button>
        </div>
      )}
    </div>
  )
}
