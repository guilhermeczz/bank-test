/**
 * Este arquivo descreve os estados possíveis de uma cobrança no domínio.
 * Ele define apenas o vocabulário permitido; as regras de transição entre os
 * estados serão responsabilidade de uma etapa futura.
 */

/**
 * Representa a situação atual de uma cobrança.
 *
 * - `PENDING`: a cobrança foi criada e ainda aguarda pagamento.
 * - `PAID`: o pagamento foi confirmado.
 * - `CANCELLED`: a cobrança foi cancelada e não deve mais ser paga.
 * - `EXPIRED`: o prazo para pagamento terminou sem a confirmação do pagamento.
 *
 * A união de strings impede, em tempo de compilação, o uso acidental de estados
 * que não fazem parte do domínio, sem adicionar comportamento em tempo de execução.
 */
export type ChargeStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
