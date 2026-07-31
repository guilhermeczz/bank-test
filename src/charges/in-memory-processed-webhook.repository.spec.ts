import { InMemoryProcessedWebhookRepository } from './in-memory-processed-webhook.repository';
import type { ProcessedWebhook } from './processed-webhook';

function createProcessedWebhook(
  key: string,
  chargeId = 'charge-1',
): ProcessedWebhook {
  return {
    key,
    chargeId,
    event: 'boleto.paid',
    outcome: {
      type: 'PAID',
      result: { chargeId, status: 'PAID', event: 'boleto.paid' },
    },
    processedAt: '2026-08-15T15:00:00.000Z',
  };
}

describe('InMemoryProcessedWebhookRepository', () => {
  let repository: InMemoryProcessedWebhookRepository;

  beforeEach(() => {
    repository = new InMemoryProcessedWebhookRepository();
  });

  it('starts empty', () => {
    expect(repository.count()).toBe(0);
    expect(repository.findAll()).toEqual([]);
  });

  it('saves a processed webhook', () => {
    repository.save(createProcessedWebhook('key-1'));

    expect(repository.count()).toBe(1);
  });

  it('finds a webhook by key', () => {
    const webhook = createProcessedWebhook('key-1');
    repository.save(webhook);

    expect(repository.findByKey('key-1')).toBe(webhook);
  });

  it('returns null for an unknown key', () => {
    expect(repository.findByKey('unknown')).toBeNull();
  });

  it('replaces a webhook with the same key', () => {
    repository.save(createProcessedWebhook('key-1', 'charge-1'));
    const replacement = createProcessedWebhook('key-1', 'charge-2');

    repository.save(replacement);

    expect(repository.findByKey('key-1')).toBe(replacement);
  });

  it('does not increase count when replacing the same key', () => {
    repository.save(createProcessedWebhook('key-1', 'charge-1'));
    repository.save(createProcessedWebhook('key-1', 'charge-2'));

    expect(repository.count()).toBe(1);
  });

  it('findAll returns every webhook', () => {
    const first = createProcessedWebhook('key-1');
    const second = createProcessedWebhook('key-2');
    repository.save(first);
    repository.save(second);

    expect(repository.findAll()).toEqual([first, second]);
  });

  it('changing the findAll array does not remove stored webhooks', () => {
    repository.save(createProcessedWebhook('key-1'));
    const result = repository.findAll();

    result.pop();

    expect(repository.count()).toBe(1);
  });

  it('count returns the stored quantity', () => {
    repository.save(createProcessedWebhook('key-1'));
    repository.save(createProcessedWebhook('key-2'));

    expect(repository.count()).toBe(2);
  });

  it('clear removes every webhook', () => {
    repository.save(createProcessedWebhook('key-1'));
    repository.save(createProcessedWebhook('key-2'));

    repository.clear();

    expect(repository.count()).toBe(0);
    expect(repository.findAll()).toEqual([]);
  });
});
