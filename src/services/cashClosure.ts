import type { CashTransaction } from '../types/school';

export function calculateCashClosure(transactions: CashTransaction[], yearId: string, date: string, counted: number) {
  const cash = transactions.filter(transaction => transaction.schoolYearId === yearId && transaction.paymentMethod === 'ESPECES');
  const cashOnClosingDate = cash.filter(transaction => transaction.date === date);
  const signed = (transaction: CashTransaction) => transaction.type === 'RECETTE' ? transaction.amount : -transaction.amount;
  const openingCashBalance = cash.filter(transaction => transaction.date < date).reduce((sum, transaction) => sum + signed(transaction), 0);
  const dayCashIn = cashOnClosingDate.filter(transaction => transaction.type === 'RECETTE').reduce((sum, transaction) => sum + transaction.amount, 0);
  const dayCashOut = cashOnClosingDate.filter(transaction => transaction.type === 'DEPENSE').reduce((sum, transaction) => sum + transaction.amount, 0);
  const expectedClosingBalance = openingCashBalance + dayCashIn - dayCashOut;
  return { cashOnClosingDate, openingCashBalance, dayCashIn, dayCashOut, expectedClosingBalance, closingDifference: counted - expectedClosingBalance };
}
