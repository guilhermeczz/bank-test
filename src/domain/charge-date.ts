import { ChargeValidationError } from './domain-error';

export const CHARGE_TIME_ZONE = 'America/Sao_Paulo';

function getReferenceCivilDate(referenceDate: Date): string {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new ChargeValidationError('Reference date is invalid.');
  }

  // O fuso explícito evita depender da configuração do servidor.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHARGE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new ChargeValidationError('Could not determine the reference date.');
  }

  return `${year}-${month}-${day}`;
}

function isExistingCivilDate(
  year: number,
  month: number,
  day: number,
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateDueDate(dueDate: string, referenceDate: Date): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);

  if (match === null) {
    throw new ChargeValidationError('Due date must use YYYY-MM-DD format.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isExistingCivilDate(year, month, day)) {
    throw new ChargeValidationError('Due date does not exist.');
  }

  const currentCivilDate = getReferenceCivilDate(referenceDate);

  if (dueDate < currentCivilDate) {
    throw new ChargeValidationError('Due date cannot be in the past.');
  }
}
