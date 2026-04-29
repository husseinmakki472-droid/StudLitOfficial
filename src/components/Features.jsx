import { useState } from 'react'

const CARDS = [
  {
    icon: '📊',
    title: 'AI Summaries',
    desc: 'Get instant, accurate summaries of any content — textbooks, notes, or lecture recordings.',
    gradient: 'linear-gradient(135deg,rgba(124,92,252,0.28),rgba(176,110,243,0.18))',
  },
  {
    icon: '📝',
    title: 'Smart Quizzes',
    desc: 'Generate adaptive quizzes that test exactly what matters and respond to how you learn.',
    gradient: 'linear-gradient(135deg,rgba(99,102,241,0.28),rgba(124,92,252,0.18))',
  },
  {
    icon: '🃏',
    title: 'Flashcards',
    desc: 'Create and review flashcards effortlessly with spaced repetition built right in.',
    gradient: 'linear-gradient(135deg,rgba(176,110,243,0.28),rgba(232,121,249,0.18))',
  },
  {
    icon: '📈',
    title: 'Study Analytics',
    desc: 'Track your progress across every session and improve continuously with AI insights.',
    gradient: 'linear-gradient(135deg,rgba(232,121,249,0.28),rgba(139,92,246,0.18))',
  },
]

function FeatureCard({ icon, title, desc, gradient }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: `1px solid ${hovered ? 'rgba(124,92,252,0.5)' : 'rgba(255,255,255,0.09)'}`,
        borderRadius: 20, padding: '28px 24px',
        cursor: 'default',
        transform: hovered ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
        boxShadow: hovered
          ? '0 0 32px rgba(124,92,252,0.22), 0 16px 48px rgba(0,0,0,0.4)'
          : '0 2px 12px rgba(0,0,0,0.2)',
        transition: 'all 0.28s cubic-bezier(0.22,1,0.36,1)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Soft glow overlay on hover */}
      <div style={{
        position: 'absolute', inset: 0,
        background: gradient,
        opacity: hovered ? 0.35 : 0,
        transition: 'opacity 0.28s',
        pointerEvents: 'none',
        borderRadius: 20,
      }} />

      {/* Icon box */}
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: gradient,
        border: '1px solid rgba(124,92,252,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 18,
        position: 'relative', zIndex: 1,
        boxShadow: hovered ? '0 4px 16px rgba(124,92,252,0.3)' : 'none',
        transition: 'box-shadow 0.28s',
      }}>
        {icon}
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontFamily: 'Inter, sans-serif', fontWeight: 700,
          fontSize: 16, color: '#f0efff', marginBottom: 8, letterSpacing: '-0.3px',
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: 'Inter, sans-serif', fontSize: 13.5,
          color: 'rgba(240,239,255,0.45)', lineHeight: 1.7,
        }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

export default function Features() {
  return (
    <section id="features" style={{ position: 'relative', zIndex: 1, maxWidth: 1160, margin: '0 auto', padding: '72px 28px' }}>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 72 }}>

        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(124,92,252,0.12)', border: '1px solid rgba(124,92,252,0.25)',
            borderRadius: 999, padding: '5px 14px',
            fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
            color: '#b06ef3', letterSpacing: '0.5px', textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            ✦ Features
          </div>
          <h2 style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 800,
            fontSize: 'clamp(28px,4vw,42px)', color: '#f0efff',
            letterSpacing: '-1px', marginBottom: 12, lineHeight: 1.15,
          }}>
            Everything you need to{' '}
            <span className="grad-text">ace your studies</span>
          </h2>
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 16,
            color: 'rgba(240,239,255,0.4)', maxWidth: 480, margin: '0 auto',
          }}>
            Powered by AI — built for students who want results, not just answers.
          </p>
        </div>

        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {CARDS.map(card => <FeatureCard key={card.title} {...card} />)}
        </div>
      </div>
    </section>
  )
}
