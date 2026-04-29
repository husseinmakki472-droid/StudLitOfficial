export default function Footer() {
  return (
    <footer style={{
      position: 'relative', zIndex: 1, textAlign: 'center',
      padding: '40px 28px', borderTop: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(13,13,26,0.6)',
    }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 20, color: '#f0efff', marginBottom: 8 }}>
        Stud<span className="grad-text">Lit</span>
      </div>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(240,239,255,0.3)', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
        The AI study platform built for students who want to actually learn.
      </p>
      <a
        href="/app.html"
        style={{
          display: 'inline-block',
          background: 'linear-gradient(135deg,#7c5cfc,#b06ef3)',
          color: '#fff', border: 'none', borderRadius: 14,
          padding: '12px 26px', fontSize: 14, fontWeight: 600,
          fontFamily: 'Inter, sans-serif', textDecoration: 'none', cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(124,92,252,0.35)',
        }}
      >
        Start Your Free Trial →
      </a>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(240,239,255,0.2)', marginTop: 28 }}>
        © {new Date().getFullYear()} StudLit. All rights reserved.
      </p>
    </footer>
  )
}
