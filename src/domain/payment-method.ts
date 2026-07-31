/**
 * Este arquivo define os métodos de pagamento aceitos nesta versão do domínio.
 * Manter essa regra em um tipo reutilizável evita que cada parte da aplicação
 * precise repetir ou interpretar a lista de valores válidos.
 */

/**
 * Representa os métodos de pagamento que uma cobrança pode utilizar.
 *
 * A união de strings faz o TypeScript aceitar somente os literais declarados.
 * Assim, um valor como `CREDIT_CARD` causa um erro durante o desenvolvimento,
 * antes que uma combinação ainda não suportada chegue à aplicação em execução.
 */
export type PaymentMethod = 'BOLETO' | 'PIX';
