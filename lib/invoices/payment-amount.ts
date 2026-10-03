/**
 * InvoicePayment.amount is stored in integer cents. Always divide by 100,
 * including payments below $10 (950 cents is $9.50).
 */
export function paymentAmountToDollars(amountCents: number): number {
  return amountCents / 100;
}
