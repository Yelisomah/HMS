/** Display currency for all billing figures (ISO 4217). */
export const CURRENCY = 'GHS';

/** Round to 2 decimal places (money). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TotalsInput {
  lines: { quantity: number; unitPrice: number }[];
  discount?: number;
  amountPaid?: number;
}

/** Shared by the invoice preview and the mock backend; the real backend is the source of truth once live. */
export function invoiceTotals({ lines, discount = 0, amountPaid = 0 }: TotalsInput) {
  const subtotal = round2(lines.reduce((sum, l) => sum + round2(l.quantity * l.unitPrice), 0));
  const safeDiscount = Math.min(Math.max(round2(discount), 0), subtotal);
  const total = round2(subtotal - safeDiscount);
  return { subtotal, discount: safeDiscount, total, amountPaid: round2(amountPaid), balance: round2(total - amountPaid) };
}
