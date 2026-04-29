const STEPS = [
  { num: '01', title: 'Upload Your Content', desc: 'Drop in any PDF, image, text, or paste a YouTube link. StudLit reads it all.', icon: '⬆️' },
  { num: '02', title: 'Choose Your Mode', desc: 'Pick from 10 AI study modes — flashcards, quizzes, summaries, tutor, and more.', icon: '🎯' },
  { num: '03', title: 'Study Smarter', desc: 'Get fully personalized study material generated in seconds, ready to use instantly.', icon: '⚡' },
]

export default function HowItWorks() {
  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1160, margin: '0 auto', padding: '0 28px 80px' }}>
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 28, padding: '52px 40px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 800,
            fontSize: 'clamp(26px,3.5vw,38px)', color: '#f0efff',
            letterSpacing: '-1px', marginBottom: 10,
          }}>
            Up and running in <span className="grad-text">3 steps</span>
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(240,239,255,0.4)' }}>
            No setup. No friction. Just smarter studying.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 28 }}>
          {STEPS.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', top: 22, left: 'calc(100% + 0px)', width: 28, height: 1,
                  background: 'linear-gradient(90deg,rgba(124,92,252,0.4),transparent)',
                  display: 'none',
                }} />
              )}
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg,rgba(124,92,252,0.2),rgba(176,110,243,0.15))',
                border: '1px solid rgba(124,92,252,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
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
                <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#f0efff', marginBottom: 6 }}>
                  {step.title}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: 'rgba(240,239,255,0.45)', lineHeight: 1.65 }}>
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
