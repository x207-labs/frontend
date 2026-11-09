// FE-061: a wallet returns the final execution outcome of the transaction. A call that the contract refused is still an outcome (with a Failure status), so it has to be looked for;
// otherwise the page would show "confirmed" for a call that did nothing. The failure can sit in the transaction status or in any receipt of the call (a cross-contract call).

type Status = { Failure?: unknown } | { SuccessValue?: unknown } | { SuccessReceiptId?: unknown } | string | undefined
type Outcome = { status?: Status; receipts_outcome?: Array<{ outcome?: { status?: Status } }> }

const failureOf = (status: Status): unknown => (status && typeof status === 'object' && 'Failure' in status ? status.Failure : undefined)

/** The failure of an execution outcome as text (it holds the contract's panic message), or `null` when every step succeeded. */
export function outcomeFailure(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== 'object') return null
  const o = outcome as Outcome
  const found = failureOf(o.status) ?? o.receipts_outcome?.map((r) => failureOf(r.outcome?.status)).find((f) => f !== undefined)
  if (found === undefined) return null
  try {
    return JSON.stringify(found)
  } catch {
    return String(found)
  }
}
