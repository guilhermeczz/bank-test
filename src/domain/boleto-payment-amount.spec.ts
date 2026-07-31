import { calculateBoletoPaymentAmount } from './boleto-payment-amount';

describe('calculateBoletoPaymentAmount', () => {
  it('uses the original amount before the due date', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-09T12:00:00-03:00',
    );

    expect(result).toEqual({
      originalAmount: 45_050,
      daysLate: 0,
      fineAmount: 0,
      interestAmount: 0,
      expectedAmount: 45_050,
    });
  });

  it('uses the original amount on the due date', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-10T23:59:59-03:00',
    );

    expect(result.daysLate).toBe(0);
    expect(result.expectedAmount).toBe(45_050);
  });

  it('calculates one late day', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-11T00:00:00-03:00',
    );

    expect(result).toMatchObject({
      daysLate: 1,
      fineAmount: 901,
      interestAmount: 15,
      expectedAmount: 45_966,
    });
  });

  it('calculates ten late days', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-20T12:00:00-03:00',
    );

    expect(result.daysLate).toBe(10);
    expect(result.expectedAmount).toBe(46_101);
  });

  it('applies the two-percent fine only once', () => {
    const oneDay = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-11T12:00:00-03:00',
    );
    const tenDays = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-20T12:00:00-03:00',
    );

    expect(oneDay.fineAmount).toBe(901);
    expect(tenDays.fineAmount).toBe(901);
  });

  it('calculates interest proportionally to late days', () => {
    const result = calculateBoletoPaymentAmount(
      100_000,
      '2026-08-10',
      '2026-08-20T12:00:00-03:00',
    );

    expect(result.interestAmount).toBe(333);
  });

  it('rounds the fine to cents', () => {
    const result = calculateBoletoPaymentAmount(
      1_025,
      '2026-08-10',
      '2026-08-11T12:00:00-03:00',
    );

    expect(result.fineAmount).toBe(21);
  });

  it('rounds the interest to cents', () => {
    const result = calculateBoletoPaymentAmount(
      1_502,
      '2026-08-10',
      '2026-08-11T12:00:00-03:00',
    );

    expect(result.interestAmount).toBe(1);
  });

  it('adds the original amount, fine and interest', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-11T12:00:00-03:00',
    );

    expect(result.expectedAmount).toBe(
      result.originalAmount + result.fineAmount + result.interestAmount,
    );
  });

  it('accepts paidAt with a -03:00 offset', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-10T20:00:00-03:00',
    );

    expect(result.daysLate).toBe(0);
  });

  it('recognizes a UTC instant that is still the previous day in Sao Paulo', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-11T02:59:59Z',
    );

    expect(result.daysLate).toBe(0);
  });

  it('recognizes a UTC instant that is the next day in Sao Paulo', () => {
    const result = calculateBoletoPaymentAmount(
      45_050,
      '2026-08-10',
      '2026-08-11T03:00:00Z',
    );

    expect(result.daysLate).toBe(1);
  });

  it('rejects a non-integer amount', () => {
    expect(() =>
      calculateBoletoPaymentAmount(
        1_000.5,
        '2026-08-10',
        '2026-08-10T12:00:00-03:00',
      ),
    ).toThrow(Error);
  });

  it('rejects an amount equal to zero', () => {
    expect(() =>
      calculateBoletoPaymentAmount(
        0,
        '2026-08-10',
        '2026-08-10T12:00:00-03:00',
      ),
    ).toThrow(Error);
  });

  it('rejects an invalid due date', () => {
    expect(() =>
      calculateBoletoPaymentAmount(
        45_050,
        '2026-02-30',
        '2026-08-10T12:00:00-03:00',
      ),
    ).toThrow(Error);
  });

  it('rejects an invalid paidAt', () => {
    expect(() =>
      calculateBoletoPaymentAmount(45_050, '2026-08-10', 'not-a-date'),
    ).toThrow(Error);
  });
});
