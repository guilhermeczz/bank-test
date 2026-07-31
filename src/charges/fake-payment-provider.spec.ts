import { FakePaymentProvider } from './fake-payment-provider';

describe('FakePaymentProvider', () => {
  let provider: FakePaymentProvider;

  beforeEach(() => {
    provider = new FakePaymentProvider(0);
  });

  describe('boleto', () => {
    it('generates a boleto instrument', async () => {
      const instrument = await provider.issue('BOLETO');

      expect(instrument).toBeDefined();
    });

    it('sets boleto as its type', async () => {
      const instrument = await provider.issue('BOLETO');

      expect(instrument.type).toBe('BOLETO');
    });

    it('generates a 47-character digitable line', async () => {
      const instrument = await provider.issue('BOLETO');

      if (instrument.type !== 'BOLETO') {
        throw new Error('Expected a boleto instrument.');
      }

      expect(instrument.digitableLine).toHaveLength(47);
    });

    it('generates a numeric digitable line', async () => {
      const instrument = await provider.issue('BOLETO');

      if (instrument.type !== 'BOLETO') {
        throw new Error('Expected a boleto instrument.');
      }

      expect(instrument.digitableLine).toMatch(/^\d{47}$/);
    });

    it('generates nossoNumero', async () => {
      const instrument = await provider.issue('BOLETO');

      if (instrument.type !== 'BOLETO') {
        throw new Error('Expected a boleto instrument.');
      }

      expect(instrument.nossoNumero).not.toHaveLength(0);
    });

    it('generates a barcode', async () => {
      const instrument = await provider.issue('BOLETO');

      if (instrument.type !== 'BOLETO') {
        throw new Error('Expected a boleto instrument.');
      }

      expect(instrument.barcode).not.toHaveLength(0);
    });
  });

  describe('Pix', () => {
    it('generates a Pix instrument', async () => {
      const instrument = await provider.issue('PIX');

      expect(instrument).toBeDefined();
    });

    it('sets Pix as its type', async () => {
      const instrument = await provider.issue('PIX');

      expect(instrument.type).toBe('PIX');
    });

    it('generates a txid', async () => {
      const instrument = await provider.issue('PIX');

      if (instrument.type !== 'PIX') {
        throw new Error('Expected a Pix instrument.');
      }

      expect(instrument.txid).not.toHaveLength(0);
    });

    it('generates a BR Code', async () => {
      const instrument = await provider.issue('PIX');

      if (instrument.type !== 'PIX') {
        throw new Error('Expected a Pix instrument.');
      }

      expect(instrument.brCode).not.toHaveLength(0);
    });

    it('generates a QR Code', async () => {
      const instrument = await provider.issue('PIX');

      if (instrument.type !== 'PIX') {
        throw new Error('Expected a Pix instrument.');
      }

      expect(instrument.qrCode).not.toHaveLength(0);
    });
  });

  describe('controlled failure', () => {
    it('fails the next request', async () => {
      provider.failNextRequest();

      await expect(provider.issue('BOLETO')).rejects.toThrow();
    });

    it('works normally after the controlled failure', async () => {
      provider.failNextRequest();
      await expect(provider.issue('PIX')).rejects.toThrow();

      await expect(provider.issue('PIX')).resolves.toMatchObject({
        type: 'PIX',
      });
    });
  });
});
