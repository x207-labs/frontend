import { useWallet } from '../wallet/WalletContext'

export function WalletButton() {
  const { account, busy, error, login, logout } = useWallet()
  if (account) {
    return (
      <div className="wallet">
        <span className="wallet-account" title={account}>{account}</span>
        <button type="button" className="quiet" onClick={logout}>
          Keluar
        </button>
      </div>
    )
  }
  return (
    <div className="wallet">
      {error && <span className="wallet-error" role="alert">{error}</span>}
      <button type="button" onClick={login} disabled={busy}>
        {busy ? 'Membuka wallet…' : 'Masuk dengan wallet'}
      </button>
    </div>
  )
}
