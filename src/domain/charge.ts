import { validateChargeAmount } from './charge-amount';
import type { ChargeStatus } from './charge-status';
import { ChargeStateError } from './domain-error';
import type { PaymentInstrument } from './payment-instrument';
import type { PaymentMethod } from './payment-method';

/**
 * Este arquivo contém a primeira versão da entidade de domínio Charge. Uma
 * entidade é um objeto que possui identidade própria e protege as regras que
 * determinam como seu estado pode mudar ao longo do tempo.
 */

/**
 * Define os únicos dados necessários para criar uma cobrança nesta etapa.
 * A interface faz o TypeScript verificar se identificador e instrumento foram
 * fornecidos com os tipos corretos antes de o código ser executado.
 */
export interface ChargeProps {
  /** Identidade estável que diferencia esta cobrança das demais. */
  id: string;

  /** Dados de pagamento gerados para boleto ou Pix. */
  paymentInstrument: PaymentInstrument;

  /** Valor original expresso em centavos inteiros, e nunca em reais decimais. */
  amountInCents: number;
}

/**
 * Modela uma cobrança e concentra suas transições válidas de estado.
 *
 * Uma classe combina dados e comportamentos. Isso permite impedir que outras
 * partes da aplicação alterem o status sem passar pelas regras do domínio.
 */
export class Charge {
  /**
   * `private` restringe o acesso direto à própria classe, enquanto `readonly`
   * impede a troca do identificador depois da construção da entidade.
   */
  private readonly chargeId: string;

  /**
   * O instrumento também é uma referência somente de leitura: a cobrança não
   * pode passar de boleto para Pix depois de criada.
   */
  private readonly instrument: PaymentInstrument;

  /**
   * O nome explicita que a unidade é centavos. `readonly` impede que o valor
   * original seja substituído depois que a cobrança tiver sido validada e criada.
   */
  private readonly originalAmountInCents: number;

  /**
   * O status é privado para que nenhum consumidor possa atribuir estados
   * livremente e ignorar as transições verificadas pelos métodos da entidade.
   */
  private currentStatus: ChargeStatus;

  /**
   * O construtor cria e inicializa uma instância da classe. Ele recebe somente
   * os dados externos permitidos e determina internamente que toda cobrança nova
   * começa pendente, evitando a criação direta em um estado arbitrário.
   */
  constructor(props: ChargeProps) {
    const paymentMethod = props.paymentInstrument.type;
    validateChargeAmount(props.amountInCents, paymentMethod);

    this.chargeId = props.id;
    this.instrument = props.paymentInstrument;
    this.originalAmountInCents = props.amountInCents;
    this.currentStatus = 'PENDING';
  }

  /**
   * Getters oferecem leitura controlada como se fossem propriedades, sem expor
   * os campos internos para atribuição. Não existe setter para alterar a identidade.
   */
  get id(): string {
    return this.chargeId;
  }

  /** Disponibiliza o estado atual sem permitir sua alteração direta. */
  get status(): ChargeStatus {
    return this.currentStatus;
  }

  /** Disponibiliza o instrumento associado sem permitir sua substituição. */
  get paymentInstrument(): PaymentInstrument {
    return this.instrument;
  }

  /**
   * Deriva o método do discriminador do instrumento em vez de armazenar uma
   * informação duplicada. Dessa forma, é impossível combinar método Pix com um
   * instrumento de boleto, pois existe uma única fonte para essa informação.
   */
  get paymentMethod(): PaymentMethod {
    return this.instrument.type;
  }

  /**
   * Expõe o valor original já validado. Como números são valores primitivos e
   * não há setter, o consumidor não consegue alterar o campo privado por aqui.
   */
  get amountInCents(): number {
    return this.originalAmountInCents;
  }

  /**
   * Cancela uma cobrança ainda pendente. Manter a alteração dentro da entidade
   * garante que todos os consumidores respeitem a mesma regra de transição.
   */
  cancel(): void {
    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot cancel a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'CANCELLED';
  }

  /**
   * Registra a confirmação de pagamento somente para uma cobrança pendente.
   * A validação do valor efetivamente recebido será acrescentada em uma etapa
   * posterior; por enquanto, este método controla apenas a mudança de estado.
   */
  markAsPaid(): void {
    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot mark as paid a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'PAID';
  }

  /**
   * Expira uma cobrança Pix pendente. O método representa somente a transição;
   * o cálculo e a verificação da data de expiração serão adicionados futuramente.
   */
  expire(): void {
    if (this.instrument.type !== 'PIX') {
      throw new ChargeStateError('Only Pix charges can expire.');
    }

    if (this.currentStatus !== 'PENDING') {
      throw new ChargeStateError(
        `Cannot expire a charge with status ${this.currentStatus}.`,
      );
    }

    this.currentStatus = 'EXPIRED';
  }
}
