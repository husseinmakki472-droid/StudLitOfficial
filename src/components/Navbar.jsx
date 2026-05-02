export default function Navbar({ dark, setDark }) {
  const navBg = dark ? 'rgba(7,7,15,0.75)' : 'rgba(245,244,255,0.92)'
  const navBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
  const logoColor = dark ? '#f0efff' : '#0f0e1a'
  const linkBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
  const linkBorder = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)'
  const linkColor = dark ? 'rgba(240,239,255,0.55)' : 'rgba(15,14,26,0.55)'
  const toggleBg = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const toggleBorder = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
  const toggleColor = dark ? 'rgba(240,239,255,0.55)' : 'rgba(15,14,26,0.55)'

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
      borderBottom: `1px solid ${navBorder}`,
      background: navBg,
      backdropFilter: 'blur(20px) saturate(1.6)',
    }}>
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, color: '#fff',
          boxShadow: '0 0 20px rgba(124,92,252,0.4)',
          letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif',
        }}>SL</div>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 18, color: logoColor, WebkitTextFillColor: logoColor, letterSpacing: '-0.5px' }}>
          Stud<span className="grad-text">Lit</span>
        </span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: linkBg, border: `1px solid ${linkBorder}`, borderRadius: 12, padding: '4px 6px' }}>
        {['Home', 'Features', 'Dashboard', 'Pricing'].map(link => (
          <a
            key={link}
            href={link === 'Dashboard' ? '/app.html' : `#${link.toLowerCase()}`}
            style={{
              fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
              color: link === 'Home' ? '#fff' : linkColor,
              background: link === 'Home' ? 'linear-gradient(135deg,#7c5cfc,#b06ef3)' : 'transparent',
              borderRadius: 8, padding: '6px 14px',
              textDecoration: 'none',
              transition: 'color 0.18s, background 0.18s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (link !== 'Home') e.currentTarget.style.color = dark ? '#f0efff' : '#0f0e1a' }}
            onMouseLeave={e => { if (link !== 'Home') e.currentTarget.style.color = linkColor }}
          >
            {link}
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => setDark(d => !d)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: toggleBg, border: `1px solid ${toggleBorder}`,
            borderRadius: 999, padding: '5px 12px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
            color: toggleColor, letterSpacing: '0.3px',
          }}
        >
          {dark ? '🌙 Dark' : '☀️ Light'}
        </button>
        <a href="/app.html" className="btn-glow" style={{
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          color: '#fff', border: 'none', borderRadius: 10,
          padding: '9px 20px',
          fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
          transition: 'opacity 0.2s, transform 0.15s',
          display: 'inline-block',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          ▶ Get Started
        </a>
      </div>
    </nav>
  )
}
