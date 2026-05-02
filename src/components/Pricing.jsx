const FEATURES = [
  'All 10 AI study modes unlocked',
  'Upload lessons, notes & images',
  'Unlimited flashcard decks & quizzes',
  'AI Tutor & personalized study plans',
  'Practice tests with AI grading',
  'Works on all your devices',
]

export default function Pricing({ dark = true }) {
  const headingColor = dark ? '#f0efff' : '#0f0e1a'
  const subColor = dark ? 'rgba(240,239,255,0.4)' : 'rgba(15,14,26,0.5)'
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : '#fff'
  const cardBorder = dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
  const dividerColor = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'
  const priceSymColor = dark ? 'rgba(240,239,255,0.5)' : 'rgba(15,14,26,0.5)'
  const pricePeriodColor = dark ? 'rgba(240,239,255,0.35)' : 'rgba(15,14,26,0.4)'
  const featureColor = dark ? 'rgba(240,239,255,0.65)' : 'rgba(15,14,26,0.7)'
  const cancelColor = dark ? 'rgba(240,239,255,0.3)' : 'rgba(15,14,26,0.4)'

  return (
    <section id="pricing" style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', padding: '0 28px 96px', textAlign: 'center' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(124,92,252,0.12)', border: '1px solid rgba(124,92,252,0.25)',
        borderRadius: 999, padding: '5px 14px',
        fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
        color: '#b06ef3', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 16,
      }}>
        ✦ Pricing
      </div>
      <h2 style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 800,
        fontSize: 'clamp(26px,3.5vw,40px)', color: headingColor, WebkitTextFillColor: headingColor,
        letterSpacing: '-1px', marginBottom: 10,
      }}>
        Simple pricing.
      </h2>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: subColor, marginBottom: 36 }}>
        Try free for 2 days. No card required to start.
      </p>

      <div style={{
        background: cardBg, border: cardBorder,
        borderRadius: 28, padding: '40px 36px',
        position: 'relative', overflow: 'hidden',
        boxShadow: dark ? '0 0 60px rgba(124,92,252,0.18)' : '0 4px 32px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#7c5cfc,#b06ef3,#e879f9)' }} />

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
          borderRadius: 999, padding: '5px 14px',
          fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#4ade80', marginBottom: 20,
        }}>
          ✦ 2-Day Free Trial Included
        </div>

        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#7c5cfc', marginBottom: 10 }}>
          StudLit Pro
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 700, color: priceSymColor, WebkitTextFillColor: priceSymColor, paddingBottom: 8 }}>$</span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 68, fontWeight: 900, color: headingColor, WebkitTextFillColor: headingColor, lineHeight: 1, letterSpacing: '-3px' }}>15</span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: pricePeriodColor, WebkitTextFillColor: pricePeriodColor, paddingBottom: 10 }}>/mo</span>
        </div>

        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#4ade80', fontWeight: 600, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          ⚡ Your first 2 days are completely free
        </div>

        <div style={{ borderTop: `1px solid ${dividerColor}`, marginBottom: 24 }} />

        <ul style={{ listStyle: 'none', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 13, marginBottom: 28 }}>
          {FEATURES.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'Inter, sans-serif', fontSize: 14, color: featureColor }}>
              <span style={{
                width: 20, height: 20, borderRadius: 6,
                background: 'rgba(124,92,252,0.15)', color: '#7c5cfc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>✓</span>
              {f}
            </li>
          ))}
        </ul>

        <a href="/app.html" style={{
          display: 'block', width: '100%', textAlign: 'center',
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          color: '#fff', border: 'none', borderRadius: 14,
          padding: '14px 28px', fontSize: 15, fontWeight: 700,
          fontFamily: 'Inter, sans-serif', textDecoration: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(124,92,252,0.4)',
          transition: 'opacity 0.2s, transform 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          Start Free Trial — $15/mo after
        </a>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: cancelColor, marginTop: 12 }}>
          Cancel anytime. No hidden fees.
        </p>
      </div>
    </section>
  )
}
