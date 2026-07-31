import { CHARGE_TIME_ZONE } from './charge-date';

const MILLISECONDS_PER_DAY = 86_400_000;
const DAILY_INTEREST_NUMERATOR = 333;
const DAILY_INTEREST_DENOMINATOR = 1_000_000;

export interface BoletoPaymentAmountCalculation {
  readonly originalAmount: number;
  readonly daysLate: number;
  readonly fineAmount: number;
  readonly interestAmount: number;
  readonly expectedAmount: number;
}

interface CivilDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseDueDate(dueDate: string): CivilDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);

  if (match === null) {
    throw new Error('Due date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Due date does not exist.');
  }

  return { year, month, day };
}

function parsePaidAt(paidAt: string): Date {
  // Exigir data e hora, além de validar o instante, evita aceitar somente uma
  // data civil onde o contrato espera um timestamp ISO 8601.
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      paidAt,
    );

  if (match === null) {
    throw new Error('Paid at must be a valid ISO 8601 date and time.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const civilDate = new Date(Date.UTC(year, month - 1, day));

  if (
    civilDate.getUTCFullYear() !== year ||
    civilDate.getUTCMonth() !== month - 1 ||
    civilDate.getUTCDate() !== day
  ) {
    throw new Error('Paid at must be a valid ISO 8601 date and time.');
  }

  const date = new Date(paidAt);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Paid at must be a valid ISO 8601 date and time.');
  }

  return date;
}

function getSaoPauloCivilDate(date: Date): CivilDateParts {
  // O instante é convertido explicitamente para a data civil de São Paulo, sem
  // depender do fuso horário configurado na máquina que executa a aplicação.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHARGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not determine the payment civil date.');
  }

  return { year: Number(year), month: Number(month), day: Number(day) };
}

function toUtcCivilDate(parts: CivilDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function calculateBoletoPaymentAmount(
  amountInCents: number,
  dueDate: string,
  paidAt: string,
): BoletoPaymentAmountCalculation {
  if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
    throw new Error('Amount in cents must be a positive integer.');
  }

  const dueDateParts = parseDueDate(dueDate);
  const paidAtDate = parsePaidAt(paidAt);
  const paymentDateParts = getSaoPauloCivilDate(paidAtDate);
  const differenceInDays =
    (toUtcCivilDate(paymentDateParts) - toUtcCivilDate(dueDateParts)) /
    MILLISECONDS_PER_DAY;
  const daysLate = Math.max(0, differenceInDays);

  if (daysLate === 0) {
    return {
      originalAmount: amountInCents,
      daysLate,
      fineAmount: 0,
      interestAmount: 0,
      expectedAmount: amountInCents,
    };
  }

  // Cada componente é arredondado separadamente para produzir centavos inteiros.
  const fineAmount = Math.round((amountInCents * 2) / 100);
  // 333 / 1.000.000 representa a taxa diária de 0,0333%.
  const interestAmount = Math.round(
    (amountInCents * daysLate * DAILY_INTEREST_NUMERATOR) /
      DAILY_INTEREST_DENOMINATOR,
  );

  return {
    originalAmount: amountInCents,
    daysLate,
    fineAmount,
    interestAmount,
    expectedAmount: amountInCents + fineAmount + interestAmount,
  };
}
