import { validateDueDate } from './charge-date';
import { ChargeValidationError } from './domain-error';

/**
 * Os testes usam instantes fixos para comprovar as regras sem depender do relógio
 * real. Cada cenário separa preparação, execução e verificação.
 */
describe('validateDueDate', () => {
  it('accepts the current civil date', () => {
    // Preparação
    const referenceDate = new Date('2026-08-10T12:00:00-03:00');

    // Execução e verificação
    expect(() => validateDueDate('2026-08-10', referenceDate)).not.toThrow();
  });

  it('accepts a future civil date', () => {
    // Preparação
    const referenceDate = new Date('2026-08-10T12:00:00-03:00');

    // Execução e verificação
    expect(() => validateDueDate('2026-08-15', referenceDate)).not.toThrow();
  });

  it('rejects a past civil date', () => {
    // Preparação
    const referenceDate = new Date('2026-08-10T12:00:00-03:00');

    // Execução e verificação
    expect(() => validateDueDate('2026-08-09', referenceDate)).toThrow(
      ChargeValidationError,
    );
  });

  it('rejects a format different from YYYY-MM-DD', () => {
    // Preparação
    const referenceDate = new Date('2026-08-10T12:00:00-03:00');

    // Execução e verificação
    expect(() => validateDueDate('10/08/2026', referenceDate)).toThrow(
      ChargeValidationError,
    );
  });

  it('rejects a date that does not exist', () => {
    // Preparação
    const referenceDate = new Date('2026-02-10T12:00:00-03:00');

    // Execução e verificação
    expect(() => validateDueDate('2026-02-30', referenceDate)).toThrow(
      ChargeValidationError,
    );
  });

  it('uses America/Sao_Paulo to determine the current civil date', () => {
    // Preparação: em UTC já é dia 11, mas em São Paulo ainda é dia 10.
    const referenceDate = new Date('2026-08-11T02:30:00.000Z');

    // Execução e verificação
    expect(() => validateDueDate('2026-08-10', referenceDate)).not.toThrow();
  });
});
