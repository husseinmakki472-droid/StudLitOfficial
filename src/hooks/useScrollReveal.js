import { useEffect, useRef, useState } from 'react'

export function useScrollReveal(delay = 0) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return {
    ref,
    revealStyle: {
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ${delay}ms cubic-bezier(0.22,1,0.36,1), transform 0.65s ${delay}ms cubic-bezier(0.22,1,0.36,1)`,
    },
  }
}
