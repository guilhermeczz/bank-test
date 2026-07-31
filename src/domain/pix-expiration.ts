import { CHARGE_TIME_ZONE } from './charge-date';

const MILLISECONDS_PER_DAY = 86_400_000;
const PIX_TOLERANCE_IN_DAYS = 3;

interface CivilDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface PixExpirationEvaluation {
  readonly daysAfterDueDate: number;
  readonly lastPayableDate: string;
  readonly isExpired: boolean;
}

function parseCivilDate(value: string): CivilDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

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

function getSaoPauloCivilDate(referenceAt: Date): CivilDateParts {
  if (!(referenceAt instanceof Date) || Number.isNaN(referenceAt.getTime())) {
    throw new Error('Reference date is invalid.');
  }

  // A data civil é obtida explicitamente em São Paulo para que o resultado não
  // dependa do fuso horário configurado no servidor.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHARGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceAt);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not determine the reference civil date.');
  }

  return { year: Number(year), month: Number(month), day: Number(day) };
}

function toUtcCivilDate(parts: CivilDateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function formatUtcCivilDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function evaluatePixExpiration(
  dueDate: string,
  referenceAt: Date,
): PixExpirationEvaluation {
  const dueDateParts = parseCivilDate(dueDate);
  const referenceDateParts = getSaoPauloCivilDate(referenceAt);
  const dueDateInUtc = toUtcCivilDate(dueDateParts);
  const daysAfterDueDate =
    (toUtcCivilDate(referenceDateParts) - dueDateInUtc) / MILLISECONDS_PER_DAY;
  const lastPayableDate = formatUtcCivilDate(
    dueDateInUtc + PIX_TOLERANCE_IN_DAYS * MILLISECONDS_PER_DAY,
  );

  return {
    daysAfterDueDate,
    lastPayableDate,
    // O terceiro dia ainda é integralmente pagável; a expiração começa no quarto.
    isExpired: daysAfterDueDate > PIX_TOLERANCE_IN_DAYS,
  };
}
