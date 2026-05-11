import { useScrollReveal } from '../hooks/useScrollReveal'

const STEPS = [
  { num: '01', title: 'Upload Your Content', desc: 'Drop in any PDF, image, text, or paste a YouTube link. StudLit reads it all.', icon: '⬆️' },
  { num: '02', title: 'Choose Your Mode', desc: 'Pick from 10 AI study modes — flashcards, quizzes, summaries, tutor, and more.', icon: '🎯' },
  { num: '03', title: 'Study Smarter', desc: 'Get fully personalized study material generated in seconds, ready to use instantly.', icon: '⚡' },
]

function StepItem({ step, dark, revealDelay }) {
  const { ref, revealStyle } = useScrollReveal(revealDelay)
  const titleColor = dark ? '#f0efff' : '#0f0e1a'
  const descColor  = dark ? 'rgba(240,239,255,0.45)' : '#6b68a0'
  const stepLabel  = dark ? '#7c5cfc' : '#5b3fc9'
  const iconBg     = dark
    ? 'linear-gradient(135deg,rgba(124,92,252,0.2),rgba(176,110,243,0.15))'
    : 'linear-gradient(135deg,rgba(124,92,252,0.15),rgba(176,110,243,0.1))'
  const iconBorder = dark ? 'rgba(124,92,252,0.3)' : 'rgba(124,92,252,0.4)'
  const iconShadow = dark ? 'none' : '0 2px 8px rgba(124,92,252,0.15)'

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', ...revealStyle }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: iconBg,
        border: `1px solid ${iconBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        boxShadow: iconShadow,
      }}>
        {step.icon}
      </div>
      <div>
        <div style={{
          fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
          color: stepLabel, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6,
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
  )
}

export default function HowItWorks({ dark = true }) {
  const headingColor = dark ? '#f0efff' : '#0f0e1a'
  const subColor     = dark ? 'rgba(240,239,255,0.4)' : '#6b68a0'
  const wrapBg       = dark ? 'rgba(255,255,255,0.025)' : '#ffffff'
  const wrapBorder   = dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #d4c9fb'
  const wrapShadow   = dark ? 'none' : '0 4px 32px rgba(124,92,252,0.12), 0 1px 4px rgba(0,0,0,0.04)'
  const { ref: headerRef, revealStyle: headerReveal } = useScrollReveal(0)

  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1160, margin: '0 auto', padding: '0 28px 80px' }}>
      <div style={{
        background: wrapBg, border: wrapBorder,
        borderRadius: 28, padding: '52px 40px', backdropFilter: 'blur(8px)',
        boxShadow: wrapShadow,
      }}>
        <div ref={headerRef} style={{ textAlign: 'center', marginBottom: 44, ...headerReveal }}>
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
            <StepItem key={step.num} step={step} dark={dark} revealDelay={100 + i * 120} />
          ))}
        </div>
      </div>
    </section>
  )
}
