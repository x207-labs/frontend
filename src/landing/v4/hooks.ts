import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'
const subscribe = (notify: () => void) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', notify)
  return () => mq.removeEventListener('change', notify)
}

/** True when the visitor asked the system for less motion. The landing then stops its loops and keeps a still picture. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}

let webgl: boolean | undefined

/** Whether this browser can create a WebGL context (jsdom and some old GPUs cannot). Probed once, on a throw-away canvas that is released at once. */
export function hasWebGL(): boolean {
  if (webgl !== undefined) return webgl
  try {
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
    webgl = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl = false
  }
  return webgl
}
