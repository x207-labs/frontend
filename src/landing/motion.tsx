import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_OUT, SPRING } from './tokens'

/** FE-044, FE-051: content that rises once, when it first comes into view (no blur since FE-051). Under reduced motion MotionConfig drops the movement and keeps the fade. */
export function Reveal({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' }) {
  const Tag = as === 'li' ? m.li : m.div
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ ...SPRING, delay, opacity: { duration: 0.5, delay, ease: EASE_OUT } }}
    >
      {children}
    </Tag>
  )
}
