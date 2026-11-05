import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EVM_GUIDE_URL } from '../config'
import { isEvmAccount } from '../lib/evm'
import { EvmBadge } from './EvmBadge'

const EVM = '0x58cd3d4987ad29a7bafdb8cdb90bfbe995e680b7'

describe('FE-041 EVM badge', () => {
  it('recognises only a lowercase 0x address of 42 characters', () => {
    expect(isEvmAccount(EVM)).toBe(true)
    expect(isEvmAccount('alice.testnet')).toBe(false)
    expect(isEvmAccount('0x58CD3D4987AD29A7BAFDB8CDB90BFBE995E680B7')).toBe(false)
    expect(isEvmAccount('0x1234')).toBe(false)
  })
  it('links an EVM member to the guide', () => {
    render(<EvmBadge account={EVM} />)
    expect(screen.getByRole('link', { name: 'EVM' }).getAttribute('href')).toBe(EVM_GUIDE_URL)
  })
  it('shows nothing for a NEAR account', () => {
    const { container } = render(<EvmBadge account="alice.testnet" />)
    expect(container.textContent).toBe('')
  })
})
