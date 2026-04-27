// CSS-only TextReveal - no framer-motion
import { useEffect, useRef, useState } from "react"
import BRAND_THEME from "@/config/brandTheme"

export default function TextReveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const motion = BRAND_THEME.tokens.motion

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Simple visibility check
    const checkVisibility = () => {
      const rect = element.getBoundingClientRect()
      const windowHeight = window.innerHeight || document.documentElement.clientHeight
      
      const isInView = rect.top < windowHeight && rect.bottom > 0
      
      if (isInView && !isVisible) {
        setIsVisible(true)
      }
    }

    checkVisibility()
    
    // Throttled scroll listener
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          checkVisibility()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isVisible])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : `translateY(${motion.distance.textY})`,
        transition: `opacity ${motion.duration.normal} ${motion.easing.standard} ${delay}s, transform ${motion.duration.normal} ${motion.easing.standard} ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
