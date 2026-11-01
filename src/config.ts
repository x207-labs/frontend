const env = import.meta.env

export const API_URL: string = env.VITE_X207_API_URL ?? 'http://localhost:8787'
export const CIRCLE: string = env.VITE_X207_CIRCLE ?? 'agents-main'
export const POLL_MS = Number(env.VITE_X207_POLL_MS ?? 5000)
export const USE_FIXTURES = env.VITE_X207_USE_FIXTURES === 'true'
