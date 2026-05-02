import { useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Features from './components/Features.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import Pricing from './components/Pricing.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  const [dark, setDark] = useState(true)

  return (
    <div className={dark ? 'dark' : ''} style={{ background: dark ? '#07070f' : '#f5f4ff', minHeight: '100vh', transition: 'background 0.3s' }}>
      <div className="mesh-orb-1" />
      <div className="mesh-orb-2" />
      <Navbar dark={dark} setDark={setDark} />
      <main style={{ position: 'relative', zIndex: 1 }}>
        <Hero dark={dark} />
        <Features dark={dark} />
        <HowItWorks dark={dark} />
        <Pricing dark={dark} />
      </main>
      <Footer dark={dark} />
    </div>
  )
}
