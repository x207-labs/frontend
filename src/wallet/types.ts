export type FunctionCallTx = {
  receiverId: string
  methodName: string
  args: Record<string, unknown>
  /** Dalam gas, string desimal. */
  gas: string
  /** Dalam yoctoNEAR, string desimal. */
  deposit: string
}

// Batas antara aplikasi dan wallet. Implementasi nyata di nearConnect.ts; test memakai
// wallet tiruan FX-FE-1 yang mencatat permintaan.
export type WalletPort = {
  network: string
  restore: () => Promise<string | null>
  connect: () => Promise<string>
  disconnect: () => Promise<void>
  signAndSend: (signerId: string, tx: FunctionCallTx) => Promise<{ hash: string }>
}
