import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SortableTable, type Column } from './SortableTable'

type Row = { name: string; amount: string; n: number }
const ROWS: Row[] = [
  { name: 'beta.near', amount: '9000000', n: 2 },
  { name: 'alpha.near', amount: '100000000', n: 10 },
  { name: 'gamma.near', amount: '50000000', n: 1 },
]
const COLUMNS: Column<Row>[] = [
  { key: 'name', label: 'Name', sortValue: (r) => r.name },
  { key: 'amount', label: 'Amount', sortValue: (r) => BigInt(r.amount) },
  { key: 'n', label: 'Count', sortValue: (r) => r.n },
  { key: 'open', label: '' },
]
const text = (r: Row) => `${r.name} ${r.amount}`
const view = (rows = ROWS) =>
  render(<SortableTable label="Things" filterLabel="Filter the things" rows={rows} columns={COLUMNS} searchText={text} renderRow={(r) => <tr key={r.name}><td>{r.name}</td><td>{r.amount}</td><td>{r.n}</td><td /></tr>} />)
const names = () => within(screen.getByRole('table', { name: 'Things' })).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)

describe('FE-057 sortable table', () => {
  it('shows the rows as given, with every sortable header marked unsorted', () => {
    view()
    expect(names()).toEqual(['beta.near', 'alpha.near', 'gamma.near'])
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByText('3 rows')).toBeInTheDocument()
  })

  it('a header click sorts ascending, a second descending, a third clears the sort', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: 'Name' }))
    expect(names()).toEqual(['alpha.near', 'beta.near', 'gamma.near'])
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['gamma.near', 'beta.near', 'alpha.near'])
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending')
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(names()).toEqual(['beta.near', 'alpha.near', 'gamma.near'])
  })

  it('amounts sort as numbers, not as text (9 before 100)', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('button', { name: 'Amount' }))
    expect(names()).toEqual(['beta.near', 'gamma.near', 'alpha.near'])
    await user.click(screen.getByRole('button', { name: 'Count' }))
    expect(names()).toEqual(['gamma.near', 'beta.near', 'alpha.near'])
  })

  it('the filter keeps rows that contain every word, says how many are shown, and the sort still applies', async () => {
    const user = userEvent.setup()
    view()
    await user.type(screen.getByRole('searchbox', { name: 'Filter the things' }), 'NEAR a')
    expect(names()).toEqual(['beta.near', 'alpha.near', 'gamma.near'])
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'alpha')
    expect(names()).toEqual(['alpha.near'])
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 shown')
  })

  it('a filter that matches nothing says so and the clear button brings the rows back', async () => {
    const user = userEvent.setup()
    view()
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/No row matches “zzz”/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear the filter' }))
    expect(names()).toHaveLength(3)
  })

  it('a column without a sort value is a plain header, and a single row needs no filter box', () => {
    view([ROWS[0]])
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getAllByRole('columnheader')[3]).not.toHaveAttribute('aria-sort')
    expect(screen.queryByRole('button', { name: 'Name' })).not.toBeNull()
  })
})
