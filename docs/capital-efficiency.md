# Capital efficiency on the clearing stats page

The page `/stats` shows two figures for the selected epoch that say how much on-chain payment the clearing saved. Both are computed in the browser from fields the read API already returns for `GET /x207/circles/{circle}/epochs/{n}/metrics`. Nothing new is stored, nothing is estimated.

## Definitions

| Figure | Formula | Fields | Epoch 8 (testnet) |
| --- | --- | --- | --- |
| Transfers avoided | `voucherCount - residualTransfers`, and that number as a share of `voucherCount` | `voucherCount`, `residualTransfers` | 24 - 14 = 10, which is 41.7% of 24 |
| Cash needed | `netDebt` as a share of `totalVoucherValue` | `netDebt`, `totalVoucherValue` | 7.75 of 41.35 credit, which is 18.7% |

- A voucher is one payment promise. `residualTransfers` is the number of settlement transfers after netting: one for each member with a net position (the headline sentence of the page says the same).
- `netDebt` is the residual debt that members owe in cash after netting (the sum of the debts of the net debtors). It is the money that has to move, as opposed to `totalVoucherValue`, which is the value promised.

## What the figures do not say

- The baseline is "every voucher paid as its own transfer". A circle without clearing might batch or net in other ways, so "avoided" is relative to that baseline only.
- Transfer fees and gas are not in the read API, so the figures count transfers, not cost.
- Locked capital is not here. Stake is a current value per member (the risk page), not a value per epoch, so there is no honest "cleared per stake locked" for a past epoch. This page does not make one up.
- `netDebt` is the cash due, before defaults. A default (`defaultRate` above 0) means part of it was not paid in the payment window and was covered from stake; the page already shows the default rate and a note.
- Both figures show a dash when the epoch has no clearing result (`residualTransfers` or `netDebt` is `null`, no vouchers, or the epoch was committed without clearing), the same rule as the other figures.
- One epoch of one testnet circle is a demonstration, not a benchmark.
