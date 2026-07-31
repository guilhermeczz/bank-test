import type { IdempotentChargeRequest } from './idempotent-charge-request';
import { InMemoryIdempotentChargeRequestRepository } from './in-memory-idempotent-charge-request.repository';

function createRequest(
  key: string,
  chargeId = 'charge-1',
): IdempotentChargeRequest {
  return {
    key,
    requestHash: `hash-${chargeId}`,
    chargeId,
    createdAt: '2026-08-10T15:00:00.000Z',
  };
}

describe('InMemoryIdempotentChargeRequestRepository', () => {
  let repository: InMemoryIdempotentChargeRequestRepository;

  beforeEach(() => {
    repository = new InMemoryIdempotentChargeRequestRepository();
  });

  it('starts empty', () => {
    expect(repository.count()).toBe(0);
    expect(repository.findAll()).toEqual([]);
  });

  it('saves a request', () => {
    repository.save(createRequest('key-1'));

    expect(repository.count()).toBe(1);
  });

  it('finds a request by key', () => {
    const request = createRequest('key-1');
    repository.save(request);

    expect(repository.findByKey('key-1')).toBe(request);
  });

  it('returns null for an unknown key', () => {
    expect(repository.findByKey('unknown')).toBeNull();
  });

  it('replaces a request with the same key', () => {
    repository.save(createRequest('key-1', 'charge-1'));
    const replacement = createRequest('key-1', 'charge-2');

    repository.save(replacement);

    expect(repository.findByKey('key-1')).toBe(replacement);
  });

  it('does not increase count when replacing the same key', () => {
    repository.save(createRequest('key-1', 'charge-1'));
    repository.save(createRequest('key-1', 'charge-2'));

    expect(repository.count()).toBe(1);
  });

  it('findAll returns every request', () => {
    const first = createRequest('key-1');
    const second = createRequest('key-2');
    repository.save(first);
    repository.save(second);

    expect(repository.findAll()).toEqual([first, second]);
  });

  it('changing the findAll array does not remove stored requests', () => {
    repository.save(createRequest('key-1'));
    const result = repository.findAll();

    result.pop();

    expect(repository.count()).toBe(1);
  });

  it('count returns the stored quantity', () => {
    repository.save(createRequest('key-1'));
    repository.save(createRequest('key-2'));

    expect(repository.count()).toBe(2);
  });

  it('clear removes all requests', () => {
    repository.save(createRequest('key-1'));
    repository.save(createRequest('key-2'));

    repository.clear();

    expect(repository.count()).toBe(0);
    expect(repository.findAll()).toEqual([]);
  });
});
