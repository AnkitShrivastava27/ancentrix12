// 'use client'
// import React from 'react'

// export const T = {
//   bg:       '#0a0b0f',
//   surface:  '#111318',
//   surface2: '#181b22',
//   border:   'rgba(255,255,255,0.06)',
//   border2:  'rgba(255,255,255,0.12)',
//   text:     '#edeef2',
//   text2:    '#9095a8',
//   text3:    '#545868',
//   accent:   '#6c5ce7',
//   accentL:  'rgba(108,92,231,0.12)',
//   green:    '#00d4aa',
//   blue:     '#4d9ef5',
//   amber:    '#f0a500',
//   red:      '#e85454',
// }

// // ── Button ────────────────────────────────────────────────────────────────────
// interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
//   variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
//   size?: 'sm' | 'md' | 'lg'
//   loading?: boolean
//   children: React.ReactNode
// }
// export function Button({ variant = 'secondary', size = 'md', loading, children, style, disabled, ...props }: ButtonProps) {
//   const sz = size === 'sm' ? { padding: '6px 12px', fontSize: 12 }
//            : size === 'lg' ? { padding: '11px 22px', fontSize: 15 }
//            :                 { padding: '8px 16px',  fontSize: 14 }
//   const v  = variant === 'primary' ? { background: T.accent, borderColor: T.accent, color: '#fff' }
//            : variant === 'danger'  ? { background: 'rgba(232,84,84,0.1)', borderColor: 'rgba(232,84,84,0.25)', color: T.red }
//            : variant === 'ghost'   ? { background: 'transparent', borderColor: 'transparent', color: T.text2 }
//            :                         { background: 'transparent', borderColor: T.border2, color: T.text }
//   return (
//     <button style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, fontWeight:500, borderRadius:9, cursor:'pointer', border:'1px solid transparent', transition:'all 0.12s', fontFamily:'inherit', whiteSpace:'nowrap', opacity: disabled||loading ? 0.45 : 1, pointerEvents: disabled||loading ? 'none' : 'auto', ...sz, ...v, ...style }} disabled={disabled||loading} {...props}>
//       {loading && <span style={{ width:14, height:14, borderRadius:'50%', border:'2px solid currentColor', borderTopColor:'transparent', animation:'spin 0.6s linear infinite', display:'inline-block' }} />}
//       {children}
//     </button>
//   )
// }

// // ── Input ─────────────────────────────────────────────────────────────────────
// interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
//   label?: string; error?: string; hint?: string
// }
// export function Input({ label, error, hint, style, ...props }: InputProps) {
//   return (
//     <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
//       {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
//       <input style={{ background:T.surface2, border:`1px solid ${error ? T.red : T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', transition:'border-color 0.12s', width:'100%', fontFamily:'inherit', ...style }}
//         onFocus={e => { e.currentTarget.style.borderColor = error ? T.red : T.accent }}
//         onBlur={e  => { e.currentTarget.style.borderColor = error ? T.red : T.border }}
//         {...props} />
//       {hint  && <span style={{ fontSize:12, color:T.text3 }}>{hint}</span>}
//       {error && <span style={{ fontSize:12, color:T.red }}>{error}</span>}
//     </div>
//   )
// }

// // ── Textarea ──────────────────────────────────────────────────────────────────
// interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string }
// export function Textarea({ label, hint, style, ...props }: TextareaProps) {
//   return (
//     <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
//       {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
//       <textarea style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', transition:'border-color 0.12s', resize:'vertical', fontFamily:'inherit', lineHeight:1.6, ...style }}
//         onFocus={e => { e.currentTarget.style.borderColor = T.accent }}
//         onBlur={e  => { e.currentTarget.style.borderColor = T.border }}
//         {...props} />
//       {hint && <span style={{ fontSize:12, color:T.text3 }}>{hint}</span>}
//     </div>
//   )
// }

// // ── Select ────────────────────────────────────────────────────────────────────
// interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string; label: string }[] }
// export function Select({ label, options, style, ...props }: SelectProps) {
//   return (
//     <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
//       {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
//       <select style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', width:'100%', fontFamily:'inherit', ...style }}
//         onFocus={e => { e.currentTarget.style.borderColor = T.accent }}
//         onBlur={e  => { e.currentTarget.style.borderColor = T.border }}
//         {...props}>
//         {options.map(o => <option key={o.value} value={o.value} style={{ background:'#181b22' }}>{o.label}</option>)}
//       </select>
//     </div>
//   )
// }

// // ── Tabs ──────────────────────────────────────────────────────────────────────
// interface TabsProps { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }
// export function Tabs({ tabs, active, onChange }: TabsProps) {
//   return (
//     <div style={{ display:'flex', gap:2, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
//       {tabs.map(t => (
//         <button key={t.id} onClick={() => onChange(t.id)} style={{ padding:'9px 16px', fontSize:14, fontWeight: active===t.id ? 500 : 400, color: active===t.id ? T.text : T.text2, background:'transparent', border:'none', borderBottom:`2px solid ${active===t.id ? T.accent : 'transparent'}`, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s', display:'flex', alignItems:'center', gap:7, marginBottom:-1 }}>
//           {t.label}
//           {t.count !== undefined && <span style={{ fontSize:11, padding:'1px 7px', borderRadius:10, background: active===t.id ? T.accentL : 'rgba(255,255,255,0.05)', color: active===t.id ? T.accent : T.text3, fontWeight:600 }}>{t.count}</span>}
//         </button>
//       ))}
//     </div>
//   )
// }

// // ── StatCard ──────────────────────────────────────────────────────────────────
// export function StatCard({ label, value, color, sub, loading }: { label: string; value: string|number; color?: string; sub?: string; loading?: boolean }) {
//   return (
//     <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${color||T.accent}`, position:'relative', overflow:'hidden' }}>
//       <div style={{ fontSize:12, fontWeight:500, color:T.text3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>{label}</div>
//       <div style={{ fontSize:32, fontWeight:700, color:color||T.text, letterSpacing:'-0.02em', lineHeight:1 }}>
//         {loading ? <span style={{ display:'inline-block', width:60, height:28, background:'rgba(255,255,255,0.06)', borderRadius:4 }} /> : value}
//       </div>
//       {sub && <div style={{ fontSize:12, color:T.text3, marginTop:6 }}>{sub}</div>}
//     </div>
//   )
// }

// // ── Spinner ───────────────────────────────────────────────────────────────────
// export function Spinner({ size = 20 }: { size?: number }) {
//   return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', border:`2px solid rgba(255,255,255,0.1)`, borderTopColor:T.accent, animation:'spin 0.6s linear infinite' }} />
// }

// // ── StatusBadge ───────────────────────────────────────────────────────────────
// const STATUS_COLORS: Record<string, [string, string]> = {
//   new:          ['#9095a8', 'rgba(144,149,168,0.1)'],
//   contacted:    [T.blue,    'rgba(77,158,245,0.1)'],
//   interested:   [T.red,     'rgba(232,84,84,0.1)'],
//   warm:         [T.amber,   'rgba(240,165,0,0.1)'],
//   cold:         [T.text3,   'rgba(84,88,104,0.1)'],
//   closed_won:   [T.green,   'rgba(0,212,170,0.1)'],
//   closed_lost:  [T.red,     'rgba(232,84,84,0.08)'],
//   do_not_call:  [T.red,     'rgba(232,84,84,0.08)'],
//   completed:    [T.green,   'rgba(0,212,170,0.1)'],
//   running:      [T.blue,    'rgba(77,158,245,0.1)'],
//   scheduled:    [T.accent,  'rgba(108,92,231,0.1)'],
//   paused:       [T.amber,   'rgba(240,165,0,0.1)'],
//   draft:        [T.text3,   'rgba(84,88,104,0.1)'],
//   failed:       [T.red,     'rgba(232,84,84,0.1)'],
//   active:       [T.green,   'rgba(0,212,170,0.1)'],
// }
// export function StatusBadge({ status }: { status: string }) {
//   const [color, bg] = STATUS_COLORS[status] || [T.text2, T.accentL]
//   return <span style={{ fontSize:12, fontWeight:500, padding:'3px 9px', borderRadius:20, color, background:bg, whiteSpace:'nowrap' }}>{status.replace(/_/g,' ')}</span>
// }

// // ── Modal ─────────────────────────────────────────────────────────────────────
// export function Modal({ open, onClose, title, children, width = 520 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
//   if (!open) return null
//   return (
//     <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
//       <div style={{ background:T.surface, border:`1px solid ${T.border2}`, borderRadius:14, width:'100%', maxWidth:width, maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
//         <div style={{ padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
//           <span style={{ fontSize:16, fontWeight:600, color:T.text }}>{title}</span>
//           <button onClick={onClose} style={{ background:'none', border:'none', color:T.text3, cursor:'pointer', fontSize:20, lineHeight:1, fontFamily:'inherit', padding:'0 4px' }}>×</button>
//         </div>
//         <div style={{ padding:'22px' }}>{children}</div>
//       </div>
//     </div>
//   )
// }

// // ── EmptyState ────────────────────────────────────────────────────────────────
// export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
//   return (
//     <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 32px', gap:12, textAlign:'center' }}>
//       <div style={{ fontSize:36 }}>{icon}</div>
//       <div style={{ fontSize:16, fontWeight:600, color:T.text }}>{title}</div>
//       {description && <div style={{ fontSize:14, color:T.text2, maxWidth:320, lineHeight:1.5 }}>{description}</div>}
//       {action && <div style={{ marginTop:8 }}>{action}</div>}
//     </div>
//   )
// }

// // ── PageHeader ────────────────────────────────────────────────────────────────
// export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
//   return (
//     <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
//       <div>
//         <h1 style={{ fontSize:24, fontWeight:700, color:T.text, margin:0, letterSpacing:'-0.02em' }}>{title}</h1>
//         {subtitle && <p style={{ fontSize:14, color:T.text2, marginTop:4, marginBottom:0 }}>{subtitle}</p>}
//       </div>
//       {action && <div style={{ flexShrink:0 }}>{action}</div>}
//     </div>
//   )
// }

// // ── Card ──────────────────────────────────────────────────────────────────────
// export function Card({ children, title, subtitle, style, action }: { children: React.ReactNode; title?: string; subtitle?: string; style?: React.CSSProperties; action?: React.ReactNode }) {
//   return (
//     <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', ...style }}>
//       {(title||subtitle||action) && (
//         <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
//           <div>
//             {title && <div style={{ fontSize:13, fontWeight:600, color:T.text2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{title}</div>}
//             {subtitle && <div style={{ fontSize:13, color:T.text3, marginTop:2 }}>{subtitle}</div>}
//           </div>
//           {action}
//         </div>
//       )}
//       {children}
//     </div>
//   )
// }

// // ── Table helpers ─────────────────────────────────────────────────────────────
// export function TH({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
//   return <th style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:T.text3, textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap', background:T.surface, ...style }}>{children}</th>
// }
// export function TD({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
//   return <td style={{ padding:'12px 16px', fontSize:14, color:T.text2, borderBottom:`1px solid ${T.border}`, verticalAlign:'middle', ...style }}>{children}</td>
// }


'use client'
import React from 'react'

export const T = {
  bg:       '#0a0b0f',
  surface:  '#111318',
  surface2: '#181b22',
  border:   'rgba(255,255,255,0.06)',
  border2:  'rgba(255,255,255,0.12)',
  text:     '#edeef2',
  text2:    '#9095a8',
  text3:    '#545868',
  accent:   '#6c5ce7',
  accentL:  'rgba(108,92,231,0.12)',
  green:    '#00d4aa',
  blue:     '#4d9ef5',
  amber:    '#f0a500',
  red:      '#e85454',
}

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, children, style, disabled, ...props }: ButtonProps) {
  const sz = size === 'sm' ? { padding: '6px 12px', fontSize: 12 }
           : size === 'lg' ? { padding: '11px 22px', fontSize: 15 }
           :                 { padding: '8px 16px',  fontSize: 14 }
  const v  = variant === 'primary' ? { background: T.accent, borderColor: T.accent, color: '#fff' }
           : variant === 'danger'  ? { background: 'rgba(232,84,84,0.1)', borderColor: 'rgba(232,84,84,0.25)', color: T.red }
           : variant === 'ghost'   ? { background: 'transparent', borderColor: 'transparent', color: T.text2 }
           :                         { background: 'transparent', borderColor: T.border2, color: T.text }
  return (
    <button style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, fontWeight:500, borderRadius:9, cursor:'pointer', border:'1px solid transparent', transition:'all 0.12s', fontFamily:'inherit', whiteSpace:'nowrap', opacity: disabled||loading ? 0.45 : 1, pointerEvents: disabled||loading ? 'none' : 'auto', ...sz, ...v, ...style }} disabled={disabled||loading} {...props}>
      {loading && <span style={{ width:14, height:14, borderRadius:'50%', border:'2px solid currentColor', borderTopColor:'transparent', animation:'spin 0.6s linear infinite', display:'inline-block' }} />}
      {children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string
}
export function Input({ label, error, hint, style, ...props }: InputProps) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
      <input style={{ background:T.surface2, border:`1px solid ${error ? T.red : T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', transition:'border-color 0.12s', width:'100%', fontFamily:'inherit', ...style }}
        onFocus={e => { e.currentTarget.style.borderColor = error ? T.red : T.accent }}
        onBlur={e  => { e.currentTarget.style.borderColor = error ? T.red : T.border }}
        {...props} />
      {hint  && <span style={{ fontSize:12, color:T.text3 }}>{hint}</span>}
      {error && <span style={{ fontSize:12, color:T.red }}>{error}</span>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; hint?: string }
export function Textarea({ label, hint, style, ...props }: TextareaProps) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
      <textarea style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', transition:'border-color 0.12s', resize:'vertical', fontFamily:'inherit', lineHeight:1.6, ...style }}
        onFocus={e => { e.currentTarget.style.borderColor = T.accent }}
        onBlur={e  => { e.currentTarget.style.borderColor = T.border }}
        {...props} />
      {hint && <span style={{ fontSize:12, color:T.text3 }}>{hint}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string; label: string }[] }
export function Select({ label, options, style, ...props }: SelectProps) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontSize:12, fontWeight:500, color:T.text3, letterSpacing:'0.05em', textTransform:'uppercase' }}>{label}</label>}
      <select style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 13px', fontSize:14, color:T.text, outline:'none', width:'100%', fontFamily:'inherit', ...style }}
        onFocus={e => { e.currentTarget.style.borderColor = T.accent }}
        onBlur={e  => { e.currentTarget.style.borderColor = T.border }}
        {...props}>
        {options.map(o => <option key={o.value} value={o.value} style={{ background:'#181b22' }}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
interface TabsProps { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div style={{ display:'flex', gap:2, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{ padding:'9px 16px', fontSize:14, fontWeight: active===t.id ? 500 : 400, color: active===t.id ? T.text : T.text2, background:'transparent', border:'none', borderBottom:`2px solid ${active===t.id ? T.accent : 'transparent'}`, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s', display:'flex', alignItems:'center', gap:7, marginBottom:-1 }}>
          {t.label}
          {t.count !== undefined && <span style={{ fontSize:11, padding:'1px 7px', borderRadius:10, background: active===t.id ? T.accentL : 'rgba(255,255,255,0.05)', color: active===t.id ? T.accent : T.text3, fontWeight:600 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({ label, value, color, sub, loading }: { label: string; value: string|number; color?: string; sub?: string; loading?: boolean }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'18px 20px', borderLeft:`3px solid ${color||T.accent}`, position:'relative', overflow:'hidden' }}>
      <div style={{ fontSize:12, fontWeight:500, color:T.text3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:32, fontWeight:700, color:color||T.text, letterSpacing:'-0.02em', lineHeight:1 }}>
        {loading ? <span style={{ display:'inline-block', width:60, height:28, background:'rgba(255,255,255,0.06)', borderRadius:4 }} /> : value}
      </div>
      {sub && <div style={{ fontSize:12, color:T.text3, marginTop:6 }}>{sub}</div>}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', border:`2px solid rgba(255,255,255,0.1)`, borderTopColor:T.accent, animation:'spin 0.6s linear infinite' }} />
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, [string, string]> = {
  new:                      ['#9095a8', 'rgba(144,149,168,0.1)'],
  contacted:                [T.blue,    'rgba(77,158,245,0.1)'],
  human_callback_requested: ['#a594ff', 'rgba(165,148,255,0.14)'],
  interested:               [T.red,     'rgba(232,84,84,0.1)'],
  warm:         [T.amber,   'rgba(240,165,0,0.1)'],
  cold:         [T.text3,   'rgba(84,88,104,0.1)'],
  closed_won:   [T.green,   'rgba(0,212,170,0.1)'],
  closed_lost:  [T.red,     'rgba(232,84,84,0.08)'],
  do_not_call:  [T.red,     'rgba(232,84,84,0.08)'],
  completed:    [T.green,   'rgba(0,212,170,0.1)'],
  running:      [T.blue,    'rgba(77,158,245,0.1)'],
  scheduled:    [T.accent,  'rgba(108,92,231,0.1)'],
  paused:       [T.amber,   'rgba(240,165,0,0.1)'],
  draft:        [T.text3,   'rgba(84,88,104,0.1)'],
  failed:       [T.red,     'rgba(232,84,84,0.1)'],
  active:       [T.green,   'rgba(0,212,170,0.1)'],
}
export function StatusBadge({ status }: { status: string }) {
  const [color, bg] = STATUS_COLORS[status] || [T.text2, T.accentL]
  return <span style={{ fontSize:12, fontWeight:500, padding:'3px 9px', borderRadius:20, color, background:bg, whiteSpace:'nowrap' }}>{status.replace(/_/g,' ')}</span>
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const MODAL_SIZES: Record<string, number> = { sm: 400, md: 520, lg: 720, xl: 960 }

export function Modal({ open, onClose, title, children, width, footer, size }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number; footer?: React.ReactNode; size?: string }) {
  if (!open) return null
  const resolvedWidth = width ?? MODAL_SIZES[size || 'md'] ?? 520
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div style={{ background:T.surface, border:`1px solid ${T.border2}`, borderRadius:14, width:'100%', maxWidth:resolvedWidth, maxHeight:'90vh', overflow:'auto', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:16, fontWeight:600, color:T.text }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:T.text3, cursor:'pointer', fontSize:20, lineHeight:1, fontFamily:'inherit', padding:'0 4px' }}>×</button>
        </div>
        <div style={{ padding:'22px', overflow:'auto' }}>{children}</div>
        {footer && (
          <div style={{ padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'flex-end', gap:10 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 32px', gap:12, textAlign:'center' }}>
      <div style={{ fontSize:36 }}>{icon}</div>
      <div style={{ fontSize:16, fontWeight:600, color:T.text }}>{title}</div>
      {description && <div style={{ fontSize:14, color:T.text2, maxWidth:320, lineHeight:1.5 }}>{description}</div>}
      {action && <div style={{ marginTop:8 }}>{action}</div>}
    </div>
  )
}

// ── PageHeader ────────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
      <div>
        <h1 style={{ fontSize:24, fontWeight:700, color:T.text, margin:0, letterSpacing:'-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ fontSize:14, color:T.text2, marginTop:4, marginBottom:0 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, title, subtitle, style, action }: { children: React.ReactNode; title?: string; subtitle?: string; style?: React.CSSProperties; action?: React.ReactNode }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', ...style }}>
      {(title||subtitle||action) && (
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            {title && <div style={{ fontSize:13, fontWeight:600, color:T.text2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{title}</div>}
            {subtitle && <div style={{ fontSize:13, color:T.text3, marginTop:2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Table helpers ─────────────────────────────────────────────────────────────
export function TH({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:T.text3, textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap', background:T.surface, ...style }}>{children}</th>
}
export function TD({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding:'12px 16px', fontSize:14, color:T.text2, borderBottom:`1px solid ${T.border}`, verticalAlign:'middle', ...style }}>{children}</td>
}