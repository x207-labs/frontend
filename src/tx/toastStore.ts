import { useSyncExternalStore } from 'react'

// FE-061: the status of the transactions the user signs. A small store outside React, so any code that signs can publish to it and the host in the wallet provider shows it.

export type TxToast =
  | { id: number; kind: 'pending'; label: string }
  | { id: number; kind: 'confirmed'; label: string; hash: string }
  | { id: number; kind: 'failed'; label: string; message: string; code?: string }
  | { id: number; kind: 'cancelled'; label: string }

let toasts: readonly TxToast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const txToasts = {
  /** Shows a pending toast and returns its id. */
  start(label: string): number {
    const id = nextId++
    toasts = [...toasts, { id, kind: 'pending', label }]
    emit()
    return id
  },
  /** Replaces the toast `id` (the same one moves from pending to its result). */
  settle(
    id: number,
    next: { kind: 'confirmed'; label: string; hash: string } | { kind: 'failed'; label: string; message: string; code?: string } | { kind: 'cancelled'; label: string },
  ): void {
    toasts = toasts.map((t) => (t.id === id ? ({ ...next, id } as TxToast) : t))
    emit()
  },
  dismiss(id: number): void {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  },
  clear(): void {
    toasts = []
    emit()
  },
  snapshot: (): readonly TxToast[] => toasts,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useTxToasts(): readonly TxToast[] {
  return useSyncExternalStore(txToasts.subscribe, txToasts.snapshot, txToasts.snapshot)
}
