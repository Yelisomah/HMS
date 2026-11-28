import { describe, expect, it } from 'vitest';
import { invoiceTotals, round2 } from './billing-math';

describe('invoiceTotals', () => {
  it('sums lines and applies a discount', () => {
    const t = invoiceTotals({ lines: [{ quantity: 2, unitPrice: 10.25 }, { quantity: 1, unitPrice: 5 }], discount: 5 });
    expect(t).toEqual({ subtotal: 25.5, discount: 5, total: 20.5, amountPaid: 0, balance: 20.5 });
  });
  it('caps the discount at the subtotal and never goes negative', () => {
    expect(invoiceTotals({ lines: [{ quantity: 1, unitPrice: 10 }], discount: 50 }).total).toBe(0);
    expect(invoiceTotals({ lines: [{ quantity: 1, unitPrice: 10 }], discount: -3 }).discount).toBe(0);
  });
  it('computes the balance after payments', () => {
    expect(invoiceTotals({ lines: [{ quantity: 3, unitPrice: 0.1 }], amountPaid: 0.1 }).balance).toBe(0.2);
  });
  it('avoids floating point drift', () => expect(round2(1.005 * 100 / 100)).toBe(1.01));
});
