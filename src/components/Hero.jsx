const AVATARS = ['A', 'J', 'M', 'S', 'K']
const AVATAR_COLORS = ['#7c5cfc', '#b06ef3', '#e879f9', '#6366f1', '#8b5cf6']

export default function Hero({ dark = true }) {
  const c = {
    h1: dark ? '#f0efff' : '#0f0e1a',
    sub: dark ? 'rgba(240,239,255,0.55)' : 'rgba(15,14,26,0.6)',
    badgeBg: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    badgeBorder: dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.12)',
    badgeColor: dark ? 'rgba(240,239,255,0.6)' : 'rgba(15,14,26,0.6)',
    ghostColor: dark ? 'rgba(240,239,255,0.7)' : 'rgba(15,14,26,0.65)',
    ghostBorder: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)',
    ratingColor: dark ? 'rgba(240,239,255,0.55)' : 'rgba(15,14,26,0.55)',
    ratingBold: dark ? '#f0efff' : '#0f0e1a',
    statVal: dark ? '#f0efff' : '#0f0e1a',
    statLabel: dark ? 'rgba(240,239,255,0.35)' : 'rgba(15,14,26,0.45)',
    divider: dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)',
    avatarBorder: dark ? '#07070f' : '#f5f4ff',
  }

  return (
    <section id="home" style={{ position: 'relative', zIndex: 1, padding: '96px 28px 72px', textAlign: 'center', maxWidth: 860, margin: '0 auto' }}>

      <div className="fade-up-1" style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: c.badgeBg, border: c.badgeBorder,
        borderRadius: 999, padding: '5px 16px 5px 10px',
        fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500,
        color: c.badgeColor, marginBottom: 28,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', display: 'inline-block', animation: 'pulse 2s infinite' }} />
        AI-Powered Learning Platform
      </div>

      <h1 className="fade-up-2" style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 900,
        fontSize: 'clamp(44px, 7vw, 80px)', lineHeight: 1.05,
        letterSpacing: '-3px', color: c.h1, WebkitTextFillColor: c.h1, marginBottom: 20,
      }}>
        Study Smarter,<br />
        <span className="grad-text">Not Harder.</span>
      </h1>

      <p className="fade-up-3" style={{
        fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 400,
        color: c.sub, maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.7,
      }}>
        StudLit uses AI to transform your notes, books, and lectures into smarter summaries, quizzes, and study tools — instantly.
      </p>

      <div className="fade-up-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 36, flexWrap: 'wrap' }}>
        <a href="/app.html" className="btn-glow" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          color: '#fff', border: 'none', borderRadius: 16, padding: '15px 32px',
          fontFamily: 'Inter, sans-serif', fontSize: 15.5, fontWeight: 700,
          textDecoration: 'none', cursor: 'pointer',
          transition: 'opacity 0.2s, transform 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          Get Started Free →
        </a>
        <a href="#features" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'transparent',
          color: c.ghostColor, border: `1px solid ${c.ghostBorder}`,
          borderRadius: 16, padding: '15px 28px',
          fontFamily: 'Inter, sans-serif', fontSize: 15.5, fontWeight: 500,
          textDecoration: 'none', cursor: 'pointer',
          transition: 'border-color 0.2s, transform 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c5cfc'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = c.ghostBorder; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          Explore Features
        </a>
      </div>

      <div className="fade-up-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex' }}>
          {AVATARS.map((letter, i) => (
            <div key={letter} style={{
              width: 34, height: 34, borderRadius: '50%',
              background: `linear-gradient(135deg, ${AVATAR_COLORS[i]}, ${AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]})`,
              border: `2.5px solid ${c.avatarBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 12, color: '#fff',
              marginLeft: i === 0 ? 0 : -10,
              position: 'relative', zIndex: AVATARS.length - i,
            }}>
              {letter}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fbbf24', fontSize: 14, letterSpacing: 2 }}>★★★★★</span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: c.ratingColor }}>
            <strong style={{ color: c.ratingBold }}>4.9/5</strong> · Loved by <strong style={{ color: c.ratingBold }}>10,000+</strong> students worldwide
          </span>
        </div>
      </div>

      <div style={{
        marginTop: 56, paddingTop: 32,
        borderTop: `1px solid ${c.divider}`,
        display: 'flex', justifyContent: 'center', gap: 'clamp(24px,5vw,56px)', flexWrap: 'wrap',
      }}>
        {[
          { val: '10', sup: '+', label: 'Study Modes' },
          { val: '2', sup: 'd', label: 'Free Trial' },
          { val: '$15', sup: '/mo', label: 'Per Month' },
          { val: '∞', sup: '', label: 'Topics' },
        ].map(({ val, sup, label }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 800, color: c.statVal, WebkitTextFillColor: c.statVal }}>
              {val}<span style={{ color: '#7c5cfc', fontSize: 16, WebkitTextFillColor: '#7c5cfc' }}>{sup}</span>
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: c.statLabel, marginTop: 3, letterSpacing: '0.3px' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </section>
  )
}
