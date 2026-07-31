import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { InMemoryChargeRepository } from './../src/charges/in-memory-charge.repository';

function createChargePayload(paymentMethod: 'BOLETO' | 'PIX' = 'BOLETO') {
  return {
    payer: {
      name: 'Maria Souza',
      document: '529.982.247-25',
      email: 'maria@example.com',
    },
    amount: paymentMethod === 'BOLETO' ? 45_050 : 1,
    dueDate: '2099-08-15',
    description: 'Taxa condominial 08/2099',
    paymentMethod,
  };
}

function assertRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected the response body to be an object.');
  }
}

function readChargeId(body: unknown): string {
  assertRecord(body);

  if (typeof body.id !== 'string') {
    throw new Error('Expected the response body to contain a charge ID.');
  }

  return body.id;
}

function addDaysToCivilDate(civilDate: string, days: number): string {
  const [year, month, day] = civilDate.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));

  return result.toISOString().slice(0, 10);
}

function getFutureDueDate(daysFromToday = 10): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not determine the current civil date.');
  }

  return addDaysToCivilDate(`${year}-${month}-${day}`, daysFromToday);
}

function paidAtForCivilDate(civilDate: string): string {
  return `${civilDate}T12:00:00-03:00`;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let repository: InMemoryChargeRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    repository = moduleFixture.get(InMemoryChargeRepository);
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    repository.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  describe('POST /charges', () => {
    it('creates a boleto and returns 201', async () => {
      await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload('BOLETO'))
        .expect(201);
    });

    it('returns the pending status', async () => {
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.status).toBe('PENDING');
    });

    it('returns the normalized payer document', async () => {
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const body: unknown = response.body;
      assertRecord(body);
      const payer = body.payer;
      assertRecord(payer);

      expect(payer.document).toBe('52998224725');
    });

    it('returns a 47-digit digitable line', async () => {
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload('BOLETO'))
        .expect(201);
      const body: unknown = response.body;
      assertRecord(body);
      const paymentInstrument = body.paymentInstrument;
      assertRecord(paymentInstrument);

      expect(paymentInstrument.digitableLine).toEqual(
        expect.stringMatching(/^\d{47}$/),
      );
    });

    it('creates a Pix charge and returns its txid', async () => {
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload('PIX'))
        .expect(201);
      const body: unknown = response.body;
      assertRecord(body);
      const paymentInstrument = body.paymentInstrument;
      assertRecord(paymentInstrument);

      expect(paymentInstrument.type).toBe('PIX');
      expect(typeof paymentInstrument.txid).toBe('string');
      expect(paymentInstrument.txid).not.toBe('');
    });

    it('returns 400 for an invalid CPF', async () => {
      const payload = createChargePayload();
      payload.payer.document = '529.982.247-24';

      await request(app.getHttpServer())
        .post('/charges')
        .send(payload)
        .expect(400);
    });

    it('returns 400 when a required field is missing', async () => {
      const payload = createChargePayload();

      await request(app.getHttpServer())
        .post('/charges')
        .send({
          payer: payload.payer,
          amount: payload.amount,
          dueDate: payload.dueDate,
          paymentMethod: payload.paymentMethod,
        })
        .expect(400);
    });
  });

  describe('GET /charges/:id', () => {
    it('creates and retrieves a charge by ID', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      await request(app.getHttpServer()).get(`/charges/${id}`).expect(200);
    });

    it('returns HTTP 200 for an existing charge', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      await request(app.getHttpServer()).get(`/charges/${id}`).expect(200);
    });

    it('returns the same charge ID', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      const response = await request(app.getHttpServer())
        .get(`/charges/${id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.id).toBe(id);
    });

    it('returns the pending status', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      const response = await request(app.getHttpServer())
        .get(`/charges/${id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.status).toBe('PENDING');
    });

    it('returns 404 for an unknown ID', async () => {
      await request(app.getHttpServer())
        .get('/charges/unknown-charge')
        .expect(404);
    });
  });

  describe('POST /charges/:id/cancel', () => {
    it('creates and cancels a charge', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(200);
    });

    it('returns HTTP 200 when cancelling a pending charge', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(200);
    });

    it('returns the cancelled status', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);

      const response = await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.status).toBe('CANCELLED');
    });

    it('returns 409 when cancelling the same charge again', async () => {
      const creation = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload())
        .expect(201);
      const id = readChargeId(creation.body);
      await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(409);
    });

    it('returns 404 when cancelling an unknown ID', async () => {
      await request(app.getHttpServer())
        .post('/charges/unknown-charge/cancel')
        .expect(404);
    });
  });

  describe('GET /charges', () => {
    async function createChargeForList(
      paymentMethod: 'BOLETO' | 'PIX' = 'BOLETO',
    ): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(createChargePayload(paymentMethod))
        .expect(201);

      return readChargeId(response.body);
    }

    it('returns HTTP 200', async () => {
      await request(app.getHttpServer()).get('/charges').expect(200);
    });

    it('returns items, page, limit and total', async () => {
      const response = await request(app.getHttpServer())
        .get('/charges')
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body).toMatchObject({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
      });
    });

    it('lists created charges', async () => {
      const firstId = await createChargeForList('BOLETO');
      const secondId = await createChargeForList('PIX');

      const response = await request(app.getHttpServer())
        .get('/charges')
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);
      const items = body.items;

      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: firstId }),
          expect.objectContaining({ id: secondId }),
        ]),
      );
    });

    it('filters by pending status', async () => {
      const pendingId = await createChargeForList();
      const cancelledId = await createChargeForList();
      await request(app.getHttpServer())
        .post(`/charges/${cancelledId}/cancel`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/charges')
        .query({ status: 'PENDING' })
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.items).toEqual([
        expect.objectContaining({ id: pendingId, status: 'PENDING' }),
      ]);
    });

    it('filters by cancelled status', async () => {
      const id = await createChargeForList();
      await request(app.getHttpServer())
        .post(`/charges/${id}/cancel`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/charges')
        .query({ status: 'CANCELLED' })
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.items).toEqual([
        expect.objectContaining({ id, status: 'CANCELLED' }),
      ]);
    });

    it('filters by an unformatted payer document', async () => {
      const id = await createChargeForList();

      const response = await request(app.getHttpServer())
        .get('/charges')
        .query({ payerDocument: '52998224725' })
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.items).toEqual([expect.objectContaining({ id })]);
    });

    it('filters by a formatted payer document', async () => {
      const id = await createChargeForList();

      const response = await request(app.getHttpServer())
        .get('/charges')
        .query({ payerDocument: '529.982.247-25' })
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body.items).toEqual([expect.objectContaining({ id })]);
    });

    it('paginates using page and limit', async () => {
      await createChargeForList();
      const secondId = await createChargeForList('PIX');
      await createChargeForList();

      const response = await request(app.getHttpServer())
        .get('/charges')
        .query({ page: 2, limit: 1 })
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);

      expect(body).toMatchObject({
        items: [expect.objectContaining({ id: secondId })],
        page: 2,
        limit: 1,
        total: 3,
      });
    });

    it('returns 400 for an invalid status', async () => {
      await request(app.getHttpServer())
        .get('/charges')
        .query({ status: 'UNKNOWN' })
        .expect(400);
    });

    it('returns 400 when page is zero', async () => {
      await request(app.getHttpServer())
        .get('/charges')
        .query({ page: 0 })
        .expect(400);
    });

    it('returns 400 when limit is greater than 100', async () => {
      await request(app.getHttpServer())
        .get('/charges')
        .query({ limit: 101 })
        .expect(400);
    });

    it('returns 400 for an invalid payer document', async () => {
      await request(app.getHttpServer())
        .get('/charges')
        .query({ payerDocument: '123' })
        .expect(400);
    });
  });

  describe('POST /webhooks/psp', () => {
    async function createChargeForWebhook(
      paymentMethod: 'BOLETO' | 'PIX',
      dueDate = getFutureDueDate(),
    ): Promise<{ id: string; reference: string }> {
      const payload = createChargePayload(paymentMethod);
      payload.amount = 45_050;
      payload.dueDate = dueDate;
      const response = await request(app.getHttpServer())
        .post('/charges')
        .send(payload)
        .expect(201);
      const body: unknown = response.body;
      const id = readChargeId(body);
      assertRecord(body);
      const paymentInstrument = body.paymentInstrument;
      assertRecord(paymentInstrument);
      const reference =
        paymentMethod === 'BOLETO'
          ? paymentInstrument.nossoNumero
          : paymentInstrument.txid;

      if (typeof reference !== 'string') {
        throw new Error('Expected a payment reference in the response.');
      }

      return { id, reference };
    }

    it('processes a boleto payment and persists the paid status', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);

      const webhookResponse = await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, -1)),
        })
        .expect(200);
      const webhookBody: unknown = webhookResponse.body;
      assertRecord(webhookBody);
      expect(webhookBody).toMatchObject({
        chargeId: charge.id,
        status: 'PAID',
        event: 'boleto.paid',
      });

      const queryResponse = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const queryBody: unknown = queryResponse.body;
      assertRecord(queryBody);
      expect(queryBody.status).toBe('PAID');
    });

    it('accepts the original boleto amount on its due date', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_050,
          paidAt: `${dueDate}T23:59:59-03:00`,
        })
        .expect(200);
    });

    it('rejects the original amount one day late and keeps the boleto pending', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 1)),
        })
        .expect(422);

      const response = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);
      expect(body.status).toBe('PENDING');
    });

    it('pays a boleto one day late with the correct fine and interest', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_966,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 1)),
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);
      expect(body.status).toBe('PAID');
    });

    it('pays a boleto several days late with the calculated amount', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 46_101,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 10)),
        })
        .expect(200);
    });

    it('processes a Pix payment and persists the paid status', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);

      const webhookResponse = await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(dueDate),
          endToEndId: 'E12345678901234567890',
        })
        .expect(200);
      const webhookBody: unknown = webhookResponse.body;
      assertRecord(webhookBody);
      expect(webhookBody).toMatchObject({
        chargeId: charge.id,
        status: 'PAID',
        event: 'pix.paid',
      });

      const queryResponse = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const queryBody: unknown = queryResponse.body;
      assertRecord(queryBody);
      expect(queryBody.status).toBe('PAID');
    });

    it('pays Pix on the third tolerance day using the original amount', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 3)),
          endToEndId: 'E12345678901234567890',
        })
        .expect(200);
    });

    it('rejects Pix on the fourth day and persists the expired status', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 4)),
          endToEndId: 'E12345678901234567890',
        })
        .expect(409);

      const response = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);
      expect(body.status).toBe('EXPIRED');
    });

    it('refreshes expired Pix on query and prevents cancellation', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);
      jest.useFakeTimers();
      jest.setSystemTime(
        new Date(`${addDaysToCivilDate(dueDate, 4)}T12:00:00-03:00`),
      );

      try {
        const response = await request(app.getHttpServer())
          .get(`/charges/${charge.id}`)
          .expect(200);
        const body: unknown = response.body;
        assertRecord(body);
        expect(body.status).toBe('EXPIRED');

        await request(app.getHttpServer())
          .post(`/charges/${charge.id}/cancel`)
          .expect(409);
      } finally {
        jest.useRealTimers();
      }
    });

    it('includes lazily expired Pix only in the expired status filter', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);
      jest.useFakeTimers();
      jest.setSystemTime(
        new Date(`${addDaysToCivilDate(dueDate, 4)}T12:00:00-03:00`),
      );

      try {
        const expiredResponse = await request(app.getHttpServer())
          .get('/charges')
          .query({ status: 'EXPIRED' })
          .expect(200);
        const expiredBody: unknown = expiredResponse.body;
        assertRecord(expiredBody);
        expect(expiredBody.items).toEqual([
          expect.objectContaining({ id: charge.id, status: 'EXPIRED' }),
        ]);

        const pendingResponse = await request(app.getHttpServer())
          .get('/charges')
          .query({ status: 'PENDING' })
          .expect(200);
        const pendingBody: unknown = pendingResponse.body;
        assertRecord(pendingBody);
        expect(pendingBody.items).toEqual([]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not apply boleto fine or interest to Pix', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('PIX', dueDate);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: charge.reference,
          paidAmount: 45_966,
          paidAt: paidAtForCivilDate(addDaysToCivilDate(dueDate, 1)),
          endToEndId: 'E12345678901234567890',
        })
        .expect(422);
    });

    it('returns 404 for an unknown nossoNumero', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: 'unknown-reference',
          paidAmount: 45_050,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(404);
    });

    it('returns 404 for an unknown txid', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: 'unknown-reference',
          paidAmount: 45_050,
          paidAt: '2026-08-14T09:10:00-03:00',
          endToEndId: 'E12345678901234567890',
        })
        .expect(404);
    });

    it('returns 422 when paidAmount differs', async () => {
      const charge = await createChargeForWebhook('BOLETO');

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_049,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(422);
    });

    it('keeps the charge pending after an amount mismatch', async () => {
      const charge = await createChargeForWebhook('BOLETO');
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_049,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(422);

      const response = await request(app.getHttpServer())
        .get(`/charges/${charge.id}`)
        .expect(200);
      const body: unknown = response.body;
      assertRecord(body);
      expect(body.status).toBe('PENDING');
    });

    it('returns 409 when paying a cancelled charge', async () => {
      const dueDate = getFutureDueDate();
      const charge = await createChargeForWebhook('BOLETO', dueDate);
      await request(app.getHttpServer())
        .post(`/charges/${charge.id}/cancel`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: charge.reference,
          paidAmount: 45_050,
          paidAt: paidAtForCivilDate(dueDate),
        })
        .expect(409);
    });

    it('returns 400 for an invalid event', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'charge.paid',
          paidAmount: 45_050,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(400);
    });

    it('returns 400 for boleto without nossoNumero', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          paidAmount: 45_050,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(400);
    });

    it('returns 400 for Pix without txid', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          paidAmount: 45_050,
          paidAt: '2026-08-14T09:10:00-03:00',
          endToEndId: 'E12345678901234567890',
        })
        .expect(400);
    });

    it('returns 400 for Pix without endToEndId', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'pix.paid',
          txid: 'pix-reference',
          paidAmount: 45_050,
          paidAt: '2026-08-14T09:10:00-03:00',
        })
        .expect(400);
    });

    it('returns 400 for a decimal paidAmount', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: 'boleto-reference',
          paidAmount: 45_050.5,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(400);
    });

    it('returns 400 when paidAmount is zero', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: 'boleto-reference',
          paidAmount: 0,
          paidAt: '2026-08-14T14:32:00-03:00',
        })
        .expect(400);
    });

    it('returns 400 for an invalid paidAt', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/psp')
        .send({
          event: 'boleto.paid',
          nossoNumero: 'boleto-reference',
          paidAmount: 45_050,
          paidAt: 'not-a-date',
        })
        .expect(400);
    });
  });
});
