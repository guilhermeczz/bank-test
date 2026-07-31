import { Module } from '@nestjs/common';

import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';
import { FakePaymentProvider } from './fake-payment-provider';
import { InMemoryChargeRepository } from './in-memory-charge.repository';
import { PspWebhooksController } from './psp-webhooks.controller';
import { PspWebhooksService } from './psp-webhooks.service';

@Module({
  controllers: [ChargesController, PspWebhooksController],
  providers: [
    ChargesService,
    PspWebhooksService,
    InMemoryChargeRepository,
    FakePaymentProvider,
  ],
})
export class ChargesModule {}
