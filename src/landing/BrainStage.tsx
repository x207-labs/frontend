import type { MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EPOCH8 } from './facts'

// FE-044: the hero visual. A 3D brain (three.js, loaded after the page is idle, so the first paint and the headline never wait for it) with pipelines and
// orbiting labels. Without a GPU-backed WebGL 2 (old browsers, software rendering, the tests) the flat ring of epoch 8 stays in its place.

const CARDS = [
  { value: String(EPOCH8.vouchers), label: 'vouchers registered' },
  { value: `${EPOCH8.gross} → ${EPOCH8.moved}`, label: 'credit in, USDT moved' },
  { value: 'epoch 8', label: 'testnet · x207-v013' },
]
const TAGS = ['x402 payment', 'register_cumulative', 'close_epoch', 'submit_clearing', 'commit_epoch', 'finalize_epoch', `${EPOCH8.members} agents`, `${EPOCH8.cleared} cleared in loops`]

type Props = { reduced: boolean; px: MotionValue<number>; py: MotionValue<number>; scroll: MotionValue<number>; fallback: ReactNode }

// The brain needs a GPU. Software WebGL (SwiftShader, llvmpipe: a machine or browser without GPU acceleration) would block the page for seconds while it
// compiles and draws the cortex, so there the flat ring stays.
function hasFastWebGL(): boolean {
  if (typeof WebGL2RenderingContext === 'undefined') return false
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer)
  } catch {
    return false
  }
}

export function BrainStage({ reduced, px, py, scroll, fallback }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>(() => (hasFastWebGL() ? 'loading' : 'fallback'))

  useEffect(() => {
    if (state === 'fallback') return
    let dispose: (() => void) | undefined
    let cancelled = false
    const start = () => {
      import('./brain/scene')
        .then(({ mountBrain }) => {
          if (cancelled || !host.current) return
          dispose = mountBrain(host.current, { reduced, px, py, scroll, onReady: () => setState('ready') })
        })
        .catch(() => setState('fallback'))
    }
    // Safari has no requestIdleCallback; a short timeout stands in for it.
    const hasIdle = typeof window.requestIdleCallback === 'function'
    const idle = hasIdle ? window.requestIdleCallback(start, { timeout: 1200 }) : 0
    const timer = hasIdle ? undefined : setTimeout(start, 400)
    return () => {
      cancelled = true
      if (hasIdle) window.cancelIdleCallback(idle)
      clearTimeout(timer)
      dispose?.()
    }
    // state is read only to skip the fallback; a change from loading to ready must not mount the scene again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, px, py, scroll])

  if (state === 'fallback') return <>{fallback}</>
  return (
    <div
      ref={host}
      className={state === 'ready' ? 'brain is-ready' : 'brain'}
      role="img"
      aria-label={`A brain for the circle of ${EPOCH8.tag}: ${EPOCH8.vouchers} pipelines flow in, one per voucher, and ${EPOCH8.movements} flow out, one per net position that moved`}
    >
      <div className="brain-stage">
        {CARDS.map((c) => (
          <span key={c.label} className="orbit-card" data-orbit="0" aria-hidden="true">
            <b>{c.value}</b>
            <small>{c.label}</small>
          </span>
        ))}
        {TAGS.map((t, i) => (
          <span key={t} className={i >= 6 ? 'orbit-tag is-extra' : 'orbit-tag'} data-orbit="1" aria-hidden="true">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
