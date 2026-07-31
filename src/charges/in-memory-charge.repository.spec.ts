import { Charge } from '../domain/charge';
import type { Payer } from '../domain/payer';
import { PayerDocument } from '../domain/payer-document';
import type { PaymentInstrument } from '../domain/payment-instrument';
import { InMemoryChargeRepository } from './in-memory-charge.repository';

function createPayer(document = '529.982.247-25'): Payer {
  return {
    name: 'Maria Souza',
    document: new PayerDocument(document),
    email: 'maria@example.com',
  };
}

function createBoletoInstrument(): PaymentInstrument {
  return {
    type: 'BOLETO',
    nossoNumero: '1234567890',
    digitableLine: '12345678901234567890123456789012345678901234567',
    barcode: '12345678901234567890123456789012345678901234',
  };
}

function createPixInstrument(): PaymentInstrument {
  return {
    type: 'PIX',
    txid: 'pix-transaction-1',
    brCode: '00020101021226850014br.gov.bcb.pix',
    qrCode: 'data:image/png;base64,fake-pix',
  };
}

function createCharge(
  id: string,
  paymentInstrument: PaymentInstrument,
  payerDocument = '529.982.247-25',
): Charge {
  return new Charge({
    id,
    paymentInstrument,
    amountInCents: paymentInstrument.type === 'BOLETO' ? 1_000 : 1,
    payer: createPayer(payerDocument),
    dueDate: '2026-08-15',
    description: 'Cobrança de teste',
  });
}

describe('InMemoryChargeRepository', () => {
  let repository: InMemoryChargeRepository;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
    repository = new InMemoryChargeRepository();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves a charge', () => {
    const charge = createCharge('charge-1', createBoletoInstrument());

    repository.save(charge);

    expect(repository.findById('charge-1')).toBe(charge);
  });

  it('increases the stored charge count', () => {
    const charge = createCharge('charge-1', createBoletoInstrument());

    repository.save(charge);

    expect(repository.count()).toBe(1);
  });

  it('finds a charge by ID', () => {
    const charge = createCharge('charge-1', createPixInstrument());
    repository.save(charge);

    const result = repository.findById('charge-1');

    expect(result).toBe(charge);
  });

  it('returns null for an unknown ID', () => {
    const result = repository.findById('unknown-charge');

    expect(result).toBeNull();
  });

  it('finds a boleto by nossoNumero', () => {
    const charge = createCharge('charge-1', createBoletoInstrument());
    repository.save(charge);

    const result = repository.findByNossoNumero('1234567890');

    expect(result).toBe(charge);
  });

  it('returns null for an unknown nossoNumero', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));

    const result = repository.findByNossoNumero('9999999999');

    expect(result).toBeNull();
  });

  it('finds a Pix charge by txid', () => {
    const charge = createCharge('charge-1', createPixInstrument());
    repository.save(charge);

    const result = repository.findByTxid('pix-transaction-1');

    expect(result).toBe(charge);
  });

  it('returns null for an unknown txid', () => {
    repository.save(createCharge('charge-1', createPixInstrument()));

    const result = repository.findByTxid('unknown-txid');

    expect(result).toBeNull();
  });

  it('clears all stored charges', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));
    repository.save(createCharge('charge-2', createPixInstrument()));

    repository.clear();

    expect(repository.count()).toBe(0);
  });

  it('does not increase the count when saving the same ID again', () => {
    const boletoCharge = createCharge('charge-1', createBoletoInstrument());
    const pixCharge = createCharge('charge-1', createPixInstrument());
    repository.save(boletoCharge);

    repository.save(pixCharge);

    expect(repository.count()).toBe(1);
    expect(repository.findById('charge-1')).toBe(pixCharge);
  });

  it('lists all charges', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));
    repository.save(createCharge('charge-2', createPixInstrument()));

    const result = repository.list({ page: 1, limit: 20 });

    expect(result.items.map((charge) => charge.id)).toEqual([
      'charge-1',
      'charge-2',
    ]);
  });

  it('filters charges by pending status', () => {
    const pendingCharge = createCharge('charge-1', createBoletoInstrument());
    const cancelledCharge = createCharge('charge-2', createPixInstrument());
    cancelledCharge.cancel();
    repository.save(pendingCharge);
    repository.save(cancelledCharge);

    const result = repository.list({ status: 'PENDING', page: 1, limit: 20 });

    expect(result.items).toEqual([pendingCharge]);
  });

  it('filters charges by cancelled status', () => {
    const pendingCharge = createCharge('charge-1', createBoletoInstrument());
    const cancelledCharge = createCharge('charge-2', createPixInstrument());
    cancelledCharge.cancel();
    repository.save(pendingCharge);
    repository.save(cancelledCharge);

    const result = repository.list({
      status: 'CANCELLED',
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([cancelledCharge]);
  });

  it('filters charges by payer document', () => {
    const cpfCharge = createCharge('charge-1', createBoletoInstrument());
    const cnpjCharge = createCharge(
      'charge-2',
      createPixInstrument(),
      '04.252.011/0001-10',
    );
    repository.save(cpfCharge);
    repository.save(cnpjCharge);

    const result = repository.list({
      payerDocument: '04252011000110',
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([cnpjCharge]);
  });

  it('combines status and payer document filters', () => {
    const pendingCharge = createCharge('charge-1', createBoletoInstrument());
    const cancelledCharge = createCharge('charge-2', createPixInstrument());
    cancelledCharge.cancel();
    repository.save(pendingCharge);
    repository.save(cancelledCharge);

    const result = repository.list({
      status: 'CANCELLED',
      payerDocument: '52998224725',
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([cancelledCharge]);
  });

  it('returns the first page', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));
    repository.save(createCharge('charge-2', createPixInstrument()));
    repository.save(createCharge('charge-3', createBoletoInstrument()));

    const result = repository.list({ page: 1, limit: 2 });

    expect(result.items.map((charge) => charge.id)).toEqual([
      'charge-1',
      'charge-2',
    ]);
  });

  it('returns the second page', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));
    repository.save(createCharge('charge-2', createPixInstrument()));
    repository.save(createCharge('charge-3', createBoletoInstrument()));

    const result = repository.list({ page: 2, limit: 2 });

    expect(result.items.map((charge) => charge.id)).toEqual(['charge-3']);
  });

  it('keeps total as the filtered count instead of the page item count', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));
    repository.save(createCharge('charge-2', createPixInstrument()));
    repository.save(createCharge('charge-3', createBoletoInstrument()));

    const result = repository.list({ page: 1, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it('returns an empty list when no charge matches', () => {
    repository.save(createCharge('charge-1', createBoletoInstrument()));

    const result = repository.list({
      payerDocument: '04252011000110',
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
