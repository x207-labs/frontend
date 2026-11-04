export type ClearedEdge = { debtor: string; creditor: string; cleared: bigint }
export type Cycle = { path: string[]; amount: bigint }

/**
 * Decomposes the circulation of edges with `cleared > 0` into simple cycles. Each cycle carries the smallest value
 * along its edges (the value cleared per edge); the remainder is subtracted and the search continues.
 */
export function decomposeCycles(edges: ClearedEdge[]): Cycle[] {
  const residual = new Map<string, bigint>()
  const out = new Map<string, string[]>()
  for (const e of edges) {
    if (e.cleared <= 0n) continue
    const key = `${e.debtor}\u0000${e.creditor}`
    residual.set(key, (residual.get(key) ?? 0n) + e.cleared)
    out.set(e.debtor, [...(out.get(e.debtor) ?? []), e.creditor])
  }
  const cycles: Cycle[] = []
  const positive = (a: string, b: string) => (residual.get(`${a}\u0000${b}`) ?? 0n) > 0n

  for (const start of [...out.keys()].sort()) {
    for (;;) {
      const path = findCycle(start)
      if (!path) break
      let min = residual.get(`${path[0]}\u0000${path[1]}`)!
      for (let i = 0; i < path.length - 1; i++) {
        const v = residual.get(`${path[i]}\u0000${path[i + 1]}`)!
        if (v < min) min = v
      }
      for (let i = 0; i < path.length - 1; i++) {
        const key = `${path[i]}\u0000${path[i + 1]}`
        residual.set(key, residual.get(key)! - min)
      }
      cycles.push({ path, amount: min })
    }
  }
  return cycles

  /** DFS from `start` back to `start` through edges with remaining value; `null` if none. */
  function findCycle(origin: string): string[] | null {
    const seen = new Set<string>()
    const walk = (node: string, trail: string[]): string[] | null => {
      for (const next of out.get(node) ?? []) {
        if (!positive(node, next)) continue
        if (next === origin) return [...trail, next]
        if (seen.has(next)) continue
        seen.add(next)
        const found = walk(next, [...trail, next])
        if (found) return found
      }
      return null
    }
    seen.add(origin)
    return walk(origin, [origin])
  }
}
