import { InMemoryPaymentDivergenceRepository } from './in-memory-payment-divergence.repository';
import type { PaymentDivergence } from './payment-divergence';

function createDivergence(
  id: string,
  chargeId = 'charge-1',
): PaymentDivergence {
  return {
    id,
    chargeId,
    event: 'boleto.paid',
    paymentReference: `reference-${id}`,
    paidAmount: 900,
    expectedAmount: 1_000,
    paidAt: '2026-08-15T12:00:00-03:00',
    reason: 'AMOUNT_MISMATCH',
    createdAt: '2026-08-15T15:00:00.000Z',
  };
}

describe('InMemoryPaymentDivergenceRepository', () => {
  let repository: InMemoryPaymentDivergenceRepository;

  beforeEach(() => {
    repository = new InMemoryPaymentDivergenceRepository();
  });

  it('starts empty', () => {
    expect(repository.count()).toBe(0);
    expect(repository.findAll()).toEqual([]);
  });

  it('saves a divergence', () => {
    repository.save(createDivergence('divergence-1'));

    expect(repository.count()).toBe(1);
  });

  it('finds a divergence by ID', () => {
    const divergence = createDivergence('divergence-1');
    repository.save(divergence);

    expect(repository.findById(divergence.id)).toBe(divergence);
  });

  it('returns null for an unknown ID', () => {
    expect(repository.findById('unknown')).toBeNull();
  });

  it('finds divergences by charge ID', () => {
    const first = createDivergence('divergence-1');
    const ignored = createDivergence('divergence-2', 'another-charge');
    const second = createDivergence('divergence-3');
    repository.save(first);
    repository.save(ignored);
    repository.save(second);

    expect(repository.findByChargeId('charge-1')).toEqual(
      expect.arrayContaining([first, second]),
    );
  });

  it('preserves insertion order when finding by charge ID', () => {
    const first = createDivergence('divergence-1');
    const second = createDivergence('divergence-2');
    repository.save(first);
    repository.save(second);

    expect(repository.findByChargeId('charge-1')).toEqual([first, second]);
  });

  it('findAll returns every divergence', () => {
    const first = createDivergence('divergence-1');
    const second = createDivergence('divergence-2');
    repository.save(first);
    repository.save(second);

    expect(repository.findAll()).toEqual([first, second]);
  });

  it('changing the findAll array does not remove stored records', () => {
    repository.save(createDivergence('divergence-1'));
    const result = repository.findAll();

    result.pop();

    expect(repository.count()).toBe(1);
  });

  it('count returns the stored quantity', () => {
    repository.save(createDivergence('divergence-1'));
    repository.save(createDivergence('divergence-2'));

    expect(repository.count()).toBe(2);
  });

  it('clear removes every divergence', () => {
    repository.save(createDivergence('divergence-1'));
    repository.save(createDivergence('divergence-2'));

    repository.clear();

    expect(repository.findAll()).toEqual([]);
    expect(repository.count()).toBe(0);
  });
});
