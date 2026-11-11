import { LIVE } from '../facts'

export function Footer() {
  return (
    <footer>
      <div className="col">
        <span>x207 · hackathon prototype · NEAR testnet, mock USDT</span>
        <span>
          <a href={LIVE.repo}>GitHub</a>
          <a href="#proof">Proof</a>
          <a href="#limits">Limits</a>
        </span>
      </div>
    </footer>
  )
}
