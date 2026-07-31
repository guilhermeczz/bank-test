import { evaluatePixExpiration } from './pix-expiration';

describe('evaluatePixExpiration', () => {
  const dueDate = '2026-08-15';

  it.each([
    ['before the due date', '2026-08-14T12:00:00-03:00', -1, false],
    ['on the due date', '2026-08-15T12:00:00-03:00', 0, false],
    ['on the first tolerance day', '2026-08-16T12:00:00-03:00', 1, false],
    ['on the second tolerance day', '2026-08-17T12:00:00-03:00', 2, false],
    ['on the third tolerance day', '2026-08-18T23:59:59-03:00', 3, false],
    ['on the fourth day after due date', '2026-08-19T00:00:00-03:00', 4, true],
  ])('%s', (_name, referenceAt, expectedDays, expectedExpiration) => {
    const result = evaluatePixExpiration(dueDate, new Date(referenceAt));

    expect(result.daysAfterDueDate).toBe(expectedDays);
    expect(result.isExpired).toBe(expectedExpiration);
  });

  it('calculates the last payable date', () => {
    expect(
      evaluatePixExpiration(dueDate, new Date('2026-08-15T12:00:00-03:00'))
        .lastPayableDate,
    ).toBe('2026-08-18');
  });

  it('calculates tolerance across the end of a month', () => {
    const result = evaluatePixExpiration(
      '2026-08-30',
      new Date('2026-09-02T12:00:00-03:00'),
    );

    expect(result.lastPayableDate).toBe('2026-09-02');
    expect(result.isExpired).toBe(false);
  });

  it('calculates tolerance across the end of a year', () => {
    const result = evaluatePixExpiration(
      '2026-12-30',
      new Date('2027-01-02T12:00:00-03:00'),
    );

    expect(result.lastPayableDate).toBe('2027-01-02');
    expect(result.isExpired).toBe(false);
  });

  it('recognizes a UTC instant that is still the previous day in Sao Paulo', () => {
    const result = evaluatePixExpiration(
      dueDate,
      new Date('2026-08-19T02:59:59Z'),
    );

    expect(result.daysAfterDueDate).toBe(3);
    expect(result.isExpired).toBe(false);
  });

  it('recognizes a UTC instant that is the next day in Sao Paulo', () => {
    const result = evaluatePixExpiration(
      dueDate,
      new Date('2026-08-19T03:00:00Z'),
    );

    expect(result.daysAfterDueDate).toBe(4);
    expect(result.isExpired).toBe(true);
  });

  it('rejects an invalid due date format', () => {
    expect(() =>
      evaluatePixExpiration('15/08/2026', new Date('2026-08-15T12:00:00Z')),
    ).toThrow(Error);
  });

  it('rejects a nonexistent civil due date', () => {
    expect(() =>
      evaluatePixExpiration('2026-02-30', new Date('2026-08-15T12:00:00Z')),
    ).toThrow(Error);
  });

  it('rejects an invalid reference date', () => {
    expect(() => evaluatePixExpiration(dueDate, new Date('invalid'))).toThrow(
      Error,
    );
  });
});
