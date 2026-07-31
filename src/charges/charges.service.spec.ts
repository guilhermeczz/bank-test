import {
  ChargeStateError,
  PayerDocumentValidationError,
} from '../domain/domain-error';
import type { PaymentMethod } from '../domain/payment-method';
import type { CreateChargeDto } from './dto/create-charge.dto';
import type { ListChargesQueryDto } from './dto/list-charges-query.dto';
import { FakePaymentProvider } from './fake-payment-provider';
import { InMemoryChargeRepository } from './in-memory-charge.repository';
import {
  ChargeNotFoundError,
  ChargesService,
  PaymentProviderError,
} from './charges.service';

function createInput(paymentMethod: PaymentMethod = 'BOLETO'): CreateChargeDto {
  return {
    payer: {
      name: 'Maria Souza',
      document: '529.982.247-25',
      email: 'maria@example.com',
    },
    amount: paymentMethod === 'BOLETO' ? 45_050 : 1,
    dueDate: '2026-08-15',
    description: 'Taxa condominial 08/2026',
    paymentMethod,
  };
}

describe('ChargesService', () => {
  let repository: InMemoryChargeRepository;
  let paymentProvider: FakePaymentProvider;
  let service: ChargesService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-10T12:00:00-03:00'));
    repository = new InMemoryChargeRepository();
    paymentProvider = new FakePaymentProvider(0);
    service = new ChargesService(repository, paymentProvider);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function createCharge(input: CreateChargeDto) {
    const creation = service.create(input);
    await jest.runAllTimersAsync();
    return creation;
  }

  it('creates a boleto charge', async () => {
    const charge = await createCharge(createInput('BOLETO'));

    expect(charge.paymentMethod).toBe('BOLETO');
    expect(charge.paymentInstrument.type).toBe('BOLETO');
  });

  it('creates a Pix charge', async () => {
    const charge = await createCharge(createInput('PIX'));

    expect(charge.paymentMethod).toBe('PIX');
    expect(charge.paymentInstrument.type).toBe('PIX');
  });

  it('saves the created charge', async () => {
    const charge = await createCharge(createInput());

    expect(repository.findById(charge.id)).toBe(charge);
  });

  it('normalizes the payer CPF', async () => {
    const charge = await createCharge(createInput());

    expect(charge.payer.document.value).toBe('52998224725');
  });

  it('returns a pending charge', async () => {
    const charge = await createCharge(createInput());

    expect(charge.status).toBe('PENDING');
  });

  it('does not save a charge when the provider fails', async () => {
    paymentProvider.failNextRequest();
    const expectation = expect(service.create(createInput())).rejects.toThrow(
      PaymentProviderError,
    );

    await jest.runAllTimersAsync();
    await expectation;

    expect(repository.count()).toBe(0);
  });

  it('does not save a charge with an invalid amount', async () => {
    const input = createInput('BOLETO');
    input.amount = 999;

    await expect(service.create(input)).rejects.toThrow();
    expect(repository.count()).toBe(0);
  });

  it('does not save a charge with an invalid CPF', async () => {
    const input = createInput();
    input.payer.document = '529.982.247-24';

    await expect(service.create(input)).rejects.toThrow();
    expect(repository.count()).toBe(0);
  });

  it('does not save a charge with a past due date', async () => {
    const input = createInput();
    input.dueDate = '2026-08-09';

    await expect(service.create(input)).rejects.toThrow();
    expect(repository.count()).toBe(0);
  });

  it('finds an existing charge by ID', async () => {
    const charge = await createCharge(createInput());

    const result = service.findById(charge.id);

    expect(result).toBe(charge);
  });

  it('throws ChargeNotFoundError for an unknown ID', () => {
    expect(() => service.findById('unknown-charge')).toThrow(
      ChargeNotFoundError,
    );
  });

  it('cancels a pending charge', async () => {
    const charge = await createCharge(createInput());

    const cancelledCharge = service.cancel(charge.id);

    expect(cancelledCharge).toBe(charge);
  });

  it('returns the cancelled status', async () => {
    const charge = await createCharge(createInput());

    const cancelledCharge = service.cancel(charge.id);

    expect(cancelledCharge.status).toBe('CANCELLED');
  });

  it('keeps the cancelled charge saved in the repository', async () => {
    const charge = await createCharge(createInput());

    service.cancel(charge.id);

    expect(repository.findById(charge.id)?.status).toBe('CANCELLED');
  });

  it('does not cancel an already cancelled charge', async () => {
    const charge = await createCharge(createInput());
    service.cancel(charge.id);

    expect(() => service.cancel(charge.id)).toThrow(ChargeStateError);
  });

  it('does not cancel a paid charge', async () => {
    const charge = await createCharge(createInput());
    charge.markAsPaid();

    expect(() => service.cancel(charge.id)).toThrow(ChargeStateError);
  });

  it('does not cancel an unknown ID', () => {
    expect(() => service.cancel('unknown-charge')).toThrow(ChargeNotFoundError);
  });

  it('lists charges', async () => {
    await createCharge(createInput());
    await createCharge(createInput('PIX'));

    const result = service.list({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
  });

  it('filters charges by status', async () => {
    const pendingCharge = await createCharge(createInput());
    const cancelledCharge = await createCharge(createInput('PIX'));
    service.cancel(cancelledCharge.id);

    const result = service.list({ status: 'PENDING', page: 1, limit: 20 });

    expect(result.items).toEqual([pendingCharge]);
  });

  it('accepts a formatted payer document', async () => {
    const charge = await createCharge(createInput());

    const result = service.list({
      payerDocument: '529.982.247-25',
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([charge]);
  });

  it('normalizes the document before querying the repository', () => {
    const listSpy = jest.spyOn(repository, 'list');
    const query: ListChargesQueryDto = {
      payerDocument: '529.982.247-25',
      page: 2,
      limit: 10,
    };

    service.list(query);

    expect(listSpy).toHaveBeenCalledWith({
      status: undefined,
      payerDocument: '52998224725',
      page: 2,
      limit: 10,
    });
  });

  it('throws PayerDocumentValidationError for an invalid document', () => {
    expect(() =>
      service.list({ payerDocument: '123', page: 1, limit: 20 }),
    ).toThrow(PayerDocumentValidationError);
  });

  it('passes page and limit to the repository', () => {
    const result = service.list({ page: 3, limit: 5 });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });

  it('returns the total number of filtered charges', async () => {
    await createCharge(createInput());
    await createCharge(createInput('PIX'));

    const result = service.list({ page: 1, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it('keeps Pix pending before its due date', async () => {
    const charge = await createCharge(createInput('PIX'));

    expect(service.findById(charge.id).status).toBe('PENDING');
  });

  it('keeps Pix pending on the third tolerance day', async () => {
    const charge = await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-18T23:59:59-03:00'));

    expect(service.findById(charge.id).status).toBe('PENDING');
  });

  it('expires Pix on the fourth day after its due date', async () => {
    const charge = await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T00:00:00-03:00'));

    expect(service.findById(charge.id).status).toBe('EXPIRED');
  });

  it('saves Pix after refreshing it to expired', async () => {
    const charge = await createCharge(createInput('PIX'));
    const saveSpy = jest.spyOn(repository, 'save');
    saveSpy.mockClear();
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    service.findById(charge.id);

    expect(saveSpy).toHaveBeenCalledWith(charge);
    expect(repository.findById(charge.id)?.status).toBe('EXPIRED');
  });

  it('does not expire an overdue boleto', async () => {
    const charge = await createCharge(createInput('BOLETO'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    expect(service.findById(charge.id).status).toBe('PENDING');
  });

  it('does not expire a paid Pix charge', async () => {
    const charge = await createCharge(createInput('PIX'));
    charge.markAsPaid();
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    expect(service.findById(charge.id).status).toBe('PAID');
  });

  it('does not expire a cancelled Pix charge', async () => {
    const charge = await createCharge(createInput('PIX'));
    charge.cancel();
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    expect(service.findById(charge.id).status).toBe('CANCELLED');
  });

  it('does not cancel an expired Pix charge', async () => {
    const charge = await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    expect(() => service.cancel(charge.id)).toThrow(ChargeStateError);
    expect(charge.status).toBe('EXPIRED');
  });

  it('refreshes overdue Pix charges while listing', async () => {
    const charge = await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    service.list({ page: 1, limit: 20 });

    expect(charge.status).toBe('EXPIRED');
  });

  it('finds a refreshed Pix charge with the expired filter', async () => {
    const charge = await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    const result = service.list({ status: 'EXPIRED', page: 1, limit: 20 });

    expect(result.items).toEqual([charge]);
  });

  it('does not return an expired Pix with the pending filter', async () => {
    await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    const result = service.list({ status: 'PENDING', page: 1, limit: 20 });

    expect(result.items).toEqual([]);
  });

  it('keeps pagination after refreshing Pix expiration', async () => {
    await createCharge(createInput('PIX'));
    await createCharge(createInput('PIX'));
    jest.setSystemTime(new Date('2026-08-19T12:00:00-03:00'));

    const result = service.list({ status: 'EXPIRED', page: 2, limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result).toMatchObject({ page: 2, limit: 1, total: 2 });
  });
});
