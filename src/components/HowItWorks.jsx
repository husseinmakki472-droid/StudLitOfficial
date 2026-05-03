const STEPS = [
  { num: '01', title: 'Upload Your Content', desc: 'Drop in any PDF, image, text, or paste a YouTube link. StudLit reads it all.', icon: '⬆️' },
  { num: '02', title: 'Choose Your Mode', desc: 'Pick from 10 AI study modes — flashcards, quizzes, summaries, tutor, and more.', icon: '🎯' },
  { num: '03', title: 'Study Smarter', desc: 'Get fully personalized study material generated in seconds, ready to use instantly.', icon: '⚡' },
]

export default function HowItWorks({ dark = true }) {
  const headingColor = dark ? '#f0efff' : '#0f0e1a'
  const subColor = dark ? 'rgba(240,239,255,0.4)' : 'rgba(15,14,26,0.5)'
  const titleColor = dark ? '#f0efff' : '#0f0e1a'
  const descColor = dark ? 'rgba(240,239,255,0.45)' : 'rgba(15,14,26,0.55)'
  const wrapBg = dark ? 'rgba(255,255,255,0.025)' : '#fff'
  const wrapBorder = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.1)'

  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1160, margin: '0 auto', padding: '0 28px 80px' }}>
      <div style={{
        background: wrapBg, border: wrapBorder,
        borderRadius: 28, padding: '52px 40px', backdropFilter: 'blur(8px)',
        boxShadow: dark ? 'none' : '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 800,
            fontSize: 'clamp(26px,3.5vw,38px)', color: headingColor, WebkitTextFillColor: headingColor,
            letterSpacing: '-1px', marginBottom: 10,
          }}>
            Up and running in <span className="grad-text">3 steps</span>
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: subColor }}>
            No setup. No friction. Just smarter studying.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 28 }}>
          {STEPS.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg,rgba(124,92,252,0.2),rgba(176,110,243,0.15))',
                border: '1px solid rgba(124,92,252,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {step.icon}
              </div>
              <div>
                <div style={{
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                  color: '#7c5cfc', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6,
                }}>
                  Step {step.num}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: titleColor, marginBottom: 6 }}>
                  {step.title}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: descColor, lineHeight: 1.65 }}>
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
