export type FunctionCallTx = {
  receiverId: string
  methodName: string
  args: Record<string, unknown>
  /** In gas, decimal string. */
  gas: string
  /** In yoctoNEAR, decimal string. */
  deposit: string
}

/** NEP-413 parameters: message, recipient, and a 32-byte nonce. */
export type SignMessageInput = { message: string; recipient: string; nonce: Uint8Array }
export type SignedMessage = { accountId: string; publicKey: string; signature: string }

// Boundary between the app and the wallet. The real implementation is in nearConnect.ts; tests use
// the FX-FE-1 fake wallet that records requests.
export type WalletPort = {
  network: string
  restore: () => Promise<string | null>
  connect: () => Promise<string>
  disconnect: () => Promise<void>
  signAndSend: (signerId: string, tx: FunctionCallTx) => Promise<{ hash: string }>
  /** NEP-413 message signature (withdrawal intent, FE-011). */
  signMessage: (signerId: string, input: SignMessageInput) => Promise<SignedMessage>
}
