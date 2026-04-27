import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { BRAND_THEME } from '@/config/brandTheme';

/**
 * ActionSlider - Professional "Swipe to Confirm" UI Component.
 */
export const ActionSlider = ({ 
  label = "Slide to Confirm", 
  onConfirm, 
  disabled = false,
  color = "bg-green-600",
  style = {},
  containerStyle = {},
  successLabel = "Confirmed ✓"
}) => {
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const containerRef = useRef(null);
  const controls = useAnimation();

  // Reset when disabled state changes
  useEffect(() => {
    if (disabled) {
      setProgress(0);
      setIsSuccess(false);
    }
  }, [disabled]);

  const handleDrag = (event, info) => {
    if (disabled || isSuccess) return;
    
    const containerWidth = containerRef.current?.offsetWidth || 300;
    const handleSize = 56;
    const padding = 6; // p-1.5 = 6px
    const totalPath = containerWidth - handleSize - (padding * 2);
    
    // Calculate progress based on relative movement
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = info.point.x - rect.left - (handleSize / 2);
    const currentProgress = Math.min(1, Math.max(0, relativeX / totalPath));
    
    setProgress(currentProgress);
  };

  const handleDragEnd = async (event, info) => {
    if (disabled || isSuccess) return;

    if (progress > 0.8) {
      setIsSuccess(true);
      setProgress(1);
      if (onConfirm) {
        try {
          await onConfirm();
        } catch (error) {
          setIsSuccess(false);
          setProgress(0);
          controls.start({ x: 0 });
        }
      }
    } else {
      setProgress(0);
      controls.start({ x: 0 });
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-[60px] rounded-full p-1 overflow-hidden transition-all duration-300 shadow-sm border border-black/5`}
      style={{ backgroundColor: BRAND_THEME.colors.neutral.surfaceMuted, ...containerStyle }}
    >
      {/* Background Track */}
      <div className={`absolute inset-y-0 left-[68px] right-5 flex items-center justify-center text-center font-black text-[10px] uppercase tracking-[0.18em] leading-none whitespace-nowrap transition-opacity duration-300 z-10 ${
        isSuccess ? 'opacity-0' : 'text-[#000000]'
      }`}>
        {disabled ? 'Action Locked' : label}
      </div>

      {/* Dynamic Progress Fill */}
      <motion.div 
        className={`absolute inset-0 ${color} rounded-full`}
        style={style}
        initial={{ width: 0 }}
        animate={{ 
          width: isSuccess ? '100%' : `${progress * 100}%`,
          opacity: disabled ? 0 : 1
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />

      {/* Success View */}
      <AnimatePresence>
        {isSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-y-0 left-[76px] right-5 flex items-center justify-center text-center text-white font-bold text-sm uppercase tracking-[0.14em] leading-none z-30"
          >
            {successLabel}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        drag={disabled || isSuccess ? false : "x"}
        dragConstraints={containerRef}
        dragElastic={0.05}
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={controls}
        className={`relative w-[52px] h-[52px] rounded-full flex items-center justify-center z-20 cursor-grab active:cursor-grabbing shadow-lg transition-colors ${
          disabled ? 'bg-white text-gray-300' : 
          isSuccess ? 'bg-white' : 'bg-white text-gray-900'
        }`}
        style={isSuccess ? { color: BRAND_THEME.colors.semantic.success } : {}}
      >
        <ChevronRight className={`w-7 h-7 transition-transform duration-300 ${isSuccess ? 'scale-110' : ''}`} />
      </motion.div>
    </div>
  );
};

export default ActionSlider;
