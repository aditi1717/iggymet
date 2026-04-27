// CSS-only AnimatedPage - no GSAP dependency
import { useEffect, useRef } from "react"
import BRAND_THEME from "@/config/brandTheme"

export default function AnimatedPage({ children, className = "" }) {
  const containerRef = useRef(null)
  const motion = BRAND_THEME.tokens.motion

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Keep entrance animation lightweight and remove transform afterwards.
    // Persistent transform breaks descendants that use position: fixed.
    container.style.opacity = "0"
    container.style.transition = `opacity ${motion.duration.normal} ${motion.easing.standard}, transform ${motion.duration.normal} ${motion.easing.standard}`
    container.style.transform = `translateY(${motion.distance.revealY})`

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      container.style.opacity = "1"
      container.style.transform = "translateY(0)"
    })

    const cleanupTimer = window.setTimeout(() => {
      container.style.transform = ""
      container.style.transition = ""
    }, Number.parseInt(motion.duration.normal, 10))

    return () => {
      window.clearTimeout(cleanupTimer)
    }
  }, [motion.distance.revealY, motion.duration.normal, motion.easing.standard])

  return (
    <div ref={containerRef} className={`${className}  md:pb-0`}>
      {children}
    </div>
  )
}
