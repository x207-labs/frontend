// FE-044: the motion tokens of the landing page. Springs in the iOS manner: quick, settled, a trace of overshoot at most.
export const SPRING = { type: 'spring', stiffness: 170, damping: 26, mass: 1 } as const
export const SPRING_PRESS = { type: 'spring', stiffness: 520, damping: 32 } as const
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

// The phases of the ring, on its one progress value (0..1).
//   members appear  ·  vouchers drawn  ·  gross fades, net labels  ·  net arrows
export const STAGES = { members: [0, 0.14], vouchers: [0.2, 0.44], net: [0.5, 0.64], settle: [0.74, 0.92] } as const
