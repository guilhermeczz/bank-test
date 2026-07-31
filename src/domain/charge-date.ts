import { ChargeValidationError } from './domain-error';

/** Fuso de negócio usado para interpretar o dia civil das cobranças. */
export const CHARGE_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Retorna a data civil correspondente a um instante no fuso de negócio. Usar
 * `Intl.DateTimeFormat` evita que o resultado dependa do fuso configurado no
 * servidor em que a aplicação estiver sendo executada.
 */
function getReferenceCivilDate(referenceDate: Date): string {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new ChargeValidationError('Reference date is invalid.');
  }

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

/**
 * Confirma que os componentes recebidos formam uma data existente no calendário.
 * A criação em UTC é usada somente para verificar ano, mês e dia, sem converter
 * o vencimento civil em um instante sujeito ao fuso do servidor.
 */
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

/**
 * Valida o vencimento da cobrança. `dueDate` representa uma data civil, isto é,
 * um dia do calendário no formato `YYYY-MM-DD`, e não um instante com horário.
 * Por isso, a comparação usa o dia atual em `America/Sao_Paulo` explicitamente.
 *
 * Nesta etapa, a regra permite o dia atual ou um dia futuro. A regra completa de
 * encerramento às 23:59:59 será aplicada posteriormente durante os pagamentos.
 */
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

  // Datas ISO neste formato possuem ordem lexicográfica igual à cronológica,
  // permitindo comparar dias sem introduzir horários ou conversões de fuso.
  if (dueDate < currentCivilDate) {
    throw new ChargeValidationError('Due date cannot be in the past.');
  }
}
