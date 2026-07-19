'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'

const T = {
  bg:      '#09090e',
  surface: '#111318',
  surface2:'#181b22',
  border:  'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.11)',
  text:    '#edeef2',
  text2:   '#7a7f94',
  text3:   '#3d4055',
  accent:  '#6c5ce7',
  accentL: 'rgba(108,92,231,0.13)',
  green:   '#00d4aa',
  amber:   '#f0a500',
  red:     '#e85454',
}

const NAV = [
  {
    section: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
      { href: '/calls',     label: 'Call Logs',  icon: '↗' },
    ],
  },
  {
    section: 'Campaigns',
    items: [
      { href: '/leads',     label: 'Leads',     icon: '◎' },
      { href: '/batches',   label: 'Batches',   icon: '▤' },
      { href: '/schedules', label: 'Schedules', icon: '◷' },
    ],
  },
  {
    section: 'Configuration',
    items: [
      { href: '/knowledge', label: 'Knowledge Base', icon: '◈' },
      { href: '/settings',  label: 'Settings',       icon: '⚙' },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/license', label: 'License', icon: '🔑' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { logout, user, license } = useAuthStore()

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] || 'A').toUpperCase()

  const daysLeft = license?.days_remaining ?? null
  const licColor = !license?.active ? T.red
                 : daysLeft !== null && daysLeft < 30 ? T.amber
                 : T.green

  return (
    <aside style={{
      width: 240, minWidth: 240, height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: T.bg,
      borderRight: `1px solid ${T.border}`,
      flexShrink: 0,
    }}>

      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: 'linear-gradient(135deg, #6c5ce7, #a594ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>AI</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Call Center</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 1 }}>v2 · White-Label</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {NAV.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            {group.section && (
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 8px 5px' }}>
                {group.section}
              </div>
            )}
            {group.items.map(item => {
              const active = pathname === item.href
                || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 1,
                  textDecoration: 'none', fontSize: 14, fontWeight: active ? 500 : 400,
                  color: active ? T.text : T.text2,
                  background: active ? T.accentL : 'transparent',
                  borderLeft: `2px solid ${active ? T.accent : 'transparent'}`,
                  transition: 'all 0.1s',
                }}
                  onMouseEnter={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = 'rgba(255,255,255,0.04)'
                      el.style.color = '#b0b3c5'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = 'transparent'
                      el.style.color = T.text2
                    }
                  }}>
                  <span style={{ fontSize: 15, color: active ? T.accent : 'inherit', flexShrink: 0, width: 18, textAlign: 'center' }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* License mini widget */}
      <div style={{ margin: '0 10px 8px', padding: '10px 12px', background: T.surface, borderRadius: 10, border: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>License</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: licColor }}>
            {!license?.active ? 'EXPIRED'
              : daysLeft !== null ? `${daysLeft}d left`
              : 'Active'}
          </span>
        </div>
        {license?.tier && (
          <div style={{ fontSize: 12, color: T.text2, textTransform: 'capitalize' }}>
            {license.tier} plan
            {license.client_name ? ` · ${license.client_name}` : ''}
          </div>
        )}
        {!license?.active && (
          <Link href="/license" style={{ display: 'block', marginTop: 7, fontSize: 12, color: T.red, textDecoration: 'none', fontWeight: 500 }}>
            Renew license →
          </Link>
        )}
        {daysLeft !== null && daysLeft < 30 && license?.active && (
          <Link href="/license" style={{ display: 'block', marginTop: 7, fontSize: 12, color: T.amber, textDecoration: 'none', fontWeight: 500 }}>
            Renew in {daysLeft} days →
          </Link>
        )}
      </div>

      {/* Profile + logout */}
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', textDecoration: 'none', transition: 'background 0.1s', borderBottom: `1px solid ${T.border}` }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.accentL, color: '#a594ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#c8cad8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.full_name || 'Admin'}</div>
            <div style={{ fontSize: 11, color: T.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          </div>
        </Link>
        <button onClick={() => { logout(); router.push('/login') }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.text3, fontFamily: 'inherit', transition: 'all 0.1s' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = T.red; el.style.background = 'rgba(232,84,84,0.06)' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = T.text3; el.style.background = 'transparent' }}>
          <span>↩</span> Sign out
        </button>
      </div>
    </aside>
  )
}
