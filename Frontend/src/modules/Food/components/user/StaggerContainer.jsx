// CSS-only StaggerContainer - no framer-motion
import { useEffect, useRef, useState } from "react"
import BRAND_THEME from "@/config/brandTheme"

export default function StaggerContainer({ children, className = "" }) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const motion = BRAND_THEME.tokens.motion

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const checkVisibility = () => {
      const rect = element.getBoundingClientRect()
      const windowHeight = window.innerHeight || document.documentElement.clientHeight
      const isInView = rect.top < windowHeight && rect.bottom > 0

      if (isInView && !isVisible) {
        setIsVisible(true)
      }
    }

    checkVisibility()
    
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
        transition: `opacity ${motion.duration.normal} ${motion.easing.standard}`,
      }}
    >
      {isVisible && children}
    </div>
  )
}

export const StaggerItem = ({ children, className = "", index = 0 }) => {
  const motion = BRAND_THEME.tokens.motion

  return (
    <div
      className={className}
      style={{
        opacity: 0,
        transform: `translateY(${motion.distance.revealY})`,
        animation: `staggerFadeIn ${motion.duration.normal} ${motion.easing.standard} ${index * 0.08}s both`
      }}
    >
      {children}
      <style>{`
        @keyframes staggerFadeIn {
          from {
            opacity: 0;
            transform: translateY(${motion.distance.revealY});
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
