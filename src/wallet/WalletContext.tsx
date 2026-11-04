import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FunctionCallTx, SignMessageInput, SignedMessage, WalletPort } from './types'

type Wallet = {
  account: string | null
  /** Restoring the session or opening the wallet selector. */
  busy: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  send: (tx: FunctionCallTx) => Promise<{ hash: string }>
  signMessage: (input: SignMessageInput) => Promise<SignedMessage>
}

const WalletContext = createContext<Wallet | null>(null)

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function isUserRejection(e: unknown): boolean {
  return /reject|cancel|denied|declin|closed|batal/i.test(describe(e))
}

export function WalletProvider({ port, children }: { port: WalletPort; children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    port
      .restore()
      .then((restored) => live && setAccount(restored))
      .catch(() => undefined)
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [port])

  const login = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setAccount(await port.connect())
    } catch (e) {
      if (!isUserRejection(e)) setError(describe(e))
    } finally {
      setBusy(false)
    }
  }, [port])

  const logout = useCallback(async () => {
    setError(null)
    setAccount(null)
    await port.disconnect().catch((e) => setError(describe(e)))
  }, [port])

  const value = useMemo<Wallet>(
    () => ({
      account,
      busy,
      error,
      login,
      logout,
      // All page transactions go through here, so signer and network are always filled in (TC-FE-003-06).
      send: (tx) => {
        if (!account) return Promise.reject(new Error('Not signed in'))
        return port.signAndSend(account, tx)
      },
      signMessage: (input) => {
        if (!account) return Promise.reject(new Error('Not signed in'))
        return port.signMessage(account, input)
      },
    }),
    [account, busy, error, login, logout, port],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): Wallet {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be inside WalletProvider')
  return value
}

export type SignState =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'done'; hash: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }

// Shared signing helper for the onboarding and settlement pages.
export function useSignTransaction() {
  const { send } = useWallet()
  const [state, setState] = useState<SignState>({ kind: 'idle' })
  // Returns true if the transaction was sent, so a sequence of transactions stops at the first failure.
  const sign = useCallback(
    async (tx: FunctionCallTx): Promise<boolean> => {
      setState({ kind: 'signing' })
      try {
        const { hash } = await send(tx)
        setState({ kind: 'done', hash })
        return true
      } catch (e) {
        setState(isUserRejection(e) ? { kind: 'cancelled' } : { kind: 'failed', message: describe(e) })
        return false
      }
    },
    [send],
  )
  return { state, sign }
}
