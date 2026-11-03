// The browser stand-in for `node:crypto` (FE-031 finding): `@x207/core` imports it in `voucher`, `barter`, `invoice`, `marketplace` and `order`. Vite's own stand-in throws when a named import is
// read, which made the dev server show a blank page; in the production bundle it left `createHash` undefined. Here `createHash('sha256')` and `randomBytes` work (the only uses on a path that the
// pages take), and the rest throws a clear error when it is called, not when the module is loaded. The signing of the voucher key in the browser is `lib/barter.ts` (WebCrypto), not this.
import { sha256 } from '@noble/hashes/sha2.js'

const bytes = (data: string | Uint8Array): Uint8Array => (typeof data === 'string' ? new TextEncoder().encode(data) : data)
const hex = (data: Uint8Array): string => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')

export function createHash(algorithm: string) {
  if (algorithm !== 'sha256') throw new Error(`createHash('${algorithm}') of node:crypto is not available in the browser`)
  const parts: Uint8Array[] = []
  const hash = {
    update(data: string | Uint8Array) {
      parts.push(bytes(data))
      return hash
    },
    digest(encoding?: 'hex'): Uint8Array | string {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let at = 0
      for (const p of parts) {
        all.set(p, at)
        at += p.length
      }
      const out = sha256(all)
      return encoding === 'hex' ? hex(out) : out
    },
  }
  return hash
}

export const randomBytes = (size: number): Uint8Array => crypto.getRandomValues(new Uint8Array(size))

const unavailable = (name: string) => (): never => {
  throw new Error(`${name} of node:crypto is not available in the browser`)
}
export const createPrivateKey = unavailable('createPrivateKey')
export const createPublicKey = unavailable('createPublicKey')
export const sign = unavailable('sign')
export const verify = unavailable('verify')
