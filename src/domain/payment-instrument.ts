/**
 * Este arquivo representa os instrumentos de pagamento devolvidos pelo PSP
 * (Provedor de Serviços de Pagamento) após a geração de uma cobrança.
 */

/**
 * Contém os dados gerados pelo PSP para o pagamento de um boleto.
 *
 * O campo literal `type` funciona como discriminador: além de identificar o
 * método, ele permite que o TypeScript diferencie esta estrutura da estrutura Pix.
 */
// `readonly` protege cada propriedade contra atribuições diretas verificadas
// pelo TypeScript. Ele não realiza congelamento profundo automático em execução.
export interface BoletoPaymentInstrument {
  /** Identifica de forma inequívoca este instrumento como boleto. */
  readonly type: 'BOLETO';

  /** Identificador do boleto dentro da carteira de cobrança do beneficiário. */
  readonly nossoNumero: string;

  /** Sequência numérica que pode ser digitada para realizar o pagamento. */
  readonly digitableLine: string;

  /** Representação numérica utilizada para formar o código de barras do boleto. */
  readonly barcode: string;
}

/**
 * Contém os dados gerados pelo PSP para o pagamento via Pix.
 *
 * As representações permanecem como `string` porque podem conter zeros à
 * esquerda e caracteres que não devem sofrer operações matemáticas.
 */
// Tornar a referência da entidade somente leitura impediria apenas sua troca;
// estes `readonly` também protegem os campos internos no sistema de tipos.
export interface PixPaymentInstrument {
  /** Identifica de forma inequívoca este instrumento como Pix. */
  readonly type: 'PIX';

  /** Identificador único atribuído à transação Pix. */
  readonly txid: string;

  /** Código no padrão BR Code que carrega os dados necessários ao pagamento. */
  readonly brCode: string;

  /** Representação do QR Code fornecida pelo PSP para exibição ou armazenamento. */
  readonly qrCode: string;
}

/**
 * Reúne os instrumentos suportados por meio de uma união discriminada.
 *
 * Uma união discriminada é uma união cujos membros possuem uma propriedade em
 * comum com valores literais diferentes. Aqui, `type` vale `BOLETO` ou `PIX`.
 * Ao comparar essa propriedade, o TypeScript estreita (narrowing) o tipo e passa
 * a oferecer somente os campos pertencentes ao instrumento identificado.
 *
 * Essa modelagem é mais segura que uma única interface com vários campos
 * opcionais. Campos opcionais permitiriam, por exemplo, um boleto sem código de
 * barras ou um objeto misturando `barcode` e `txid`. A união exige uma das duas
 * estruturas completas e, assim, impede essas combinações inválidas durante a
 * verificação de tipos.
 */
export type PaymentInstrument = BoletoPaymentInstrument | PixPaymentInstrument;

/*
function readInstrument(instrument: PaymentInstrument) {
  if (instrument.type === 'BOLETO') {
    // Aqui o TypeScript sabe que temos um boleto.
  } else {
    // Aqui o TypeScript sabe que temos um Pix.
  }
}
*/
