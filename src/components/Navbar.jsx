export default function Navbar({ dark, setDark }) {
  return (
    <nav
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(7,7,15,0.75)',
        backdropFilter: 'blur(20px) saturate(1.6)',
      }}
    >
      {/* Logo */}
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, color: '#fff',
          boxShadow: '0 0 20px rgba(124,92,252,0.4)',
          letterSpacing: '-0.5px',
          fontFamily: 'Inter, sans-serif',
        }}>SL</div>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 18, color: '#f0efff', letterSpacing: '-0.5px' }}>
          Stud<span className="grad-text">Lit</span>
        </span>
      </a>

      {/* Center nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '4px 6px' }}>
        {['Home', 'Features', 'Dashboard', 'Pricing'].map(link => (
          <a
            key={link}
            href={link === 'Dashboard' ? '/app.html' : `#${link.toLowerCase()}`}
            style={{
              fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500,
              color: link === 'Home' ? '#f0efff' : 'rgba(240,239,255,0.55)',
              background: link === 'Home' ? 'linear-gradient(135deg,#7c5cfc,#b06ef3)' : 'transparent',
              borderRadius: 8, padding: '6px 14px',
              textDecoration: 'none',
              transition: 'color 0.18s, background 0.18s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (link !== 'Home') e.currentTarget.style.color = '#f0efff' }}
            onMouseLeave={e => { if (link !== 'Home') e.currentTarget.style.color = 'rgba(240,239,255,0.55)' }}
          >
            {link}
          </a>
        ))}
      </div>

      {/* Right: toggle + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => setDark(d => !d)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 999, padding: '5px 12px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
            color: 'rgba(240,239,255,0.55)', letterSpacing: '0.3px',
          }}
        >
          {dark ? '🌙 Dark' : '☀️ Light'}
        </button>
        <a
          href="/app.html"
          className="btn-glow"
          style={{
            background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '9px 20px',
            fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
            transition: 'opacity 0.2s, transform 0.15s, box-shadow 0.2s',
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
