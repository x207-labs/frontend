import type { MotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EPOCH8 } from './facts'

// FE-044, FE-048, FE-050: the visual of the scroll theatre. A 3D world (three.js, loaded after the page is idle, so the first paint and the headline never wait
// for it): the hologram brain, a barter cabinet, and the circle of epoch 8 that the camera flies through (brain/scene.ts). Without a GPU-backed WebGL 2 (old
// browsers, software rendering, the tests) the flat ring of epoch 8 stays in its place.

type Props = { reduced: boolean; px: MotionValue<number>; py: MotionValue<number>; story: MotionValue<number>; fallback: ReactNode }

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

export function BrainStage({ reduced, px, py, story, fallback }: Props) {
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
          dispose = mountBrain(host.current, { reduced, px, py, story, watch: (cb) => story.on('change', cb), onReady: () => setState('ready') })
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
  }, [reduced, px, py, story])

  if (state === 'fallback') return <>{fallback}</>
  return (
    <div
      ref={host}
      className={state === 'ready' ? 'brain is-ready' : 'brain'}
      role="img"
      aria-label={`The circle of ${EPOCH8.tag} in 3D: asset kinds leave a barter cabinet for the circle contract, ${EPOCH8.members} members register ${EPOCH8.vouchers} vouchers, loops clear, and ${EPOCH8.movements} net transfers settle the rest`}
    >
      <div className="brain-stage" />
    </div>
  )
}
