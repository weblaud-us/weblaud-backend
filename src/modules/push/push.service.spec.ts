import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webpush from 'web-push';
import { PushService } from './push.service';
import { PushSubscriptionRecord } from './schemas/push-subscription.schema';

const USER = '507f1f77bcf86cd799439011';
const sub = (id: string, host: string) => ({
  _id: id,
  endpoint: `https://${host}/push/${id}`,
  keys: { p256dh: 'p', auth: 'a' },
});

describe('PushService', () => {
  let model: { find: jest.Mock; updateOne: jest.Mock; deleteOne: jest.Mock };
  let config: Record<string, string | undefined>;
  const send = webpush.sendNotification as jest.Mock;

  async function build() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: getModelToken(PushSubscriptionRecord.name), useValue: model },
        { provide: ConfigService, useValue: { get: (k: string) => config[k] } },
      ],
    }).compile();
    const service = module.get(PushService);
    service.onModuleInit();
    return service;
  }

  beforeEach(() => {
    send.mockReset();
    model = {
      find: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([sub('s1', 'fcm.googleapis.com'), sub('s2', 'web.push.apple.com')]),
      }),
      updateOne: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    config = {
      'push.vapidPublicKey': 'pub',
      'push.vapidPrivateKey': 'priv',
      'push.vapidSubject': 'mailto:admin@example.com',
    };
  });

  it('sends to every device and drops subscriptions the browser revoked', async () => {
    send
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const service = await build();

    await service.sendToUser(USER, { title: 'New update', link: '/portal' });

    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0][1])).toEqual({
      title: 'New update',
      link: '/portal',
    });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 's2' });
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 's1' },
      { $set: { lastSuccessAt: expect.any(Date) } },
    );
  });

  it('keeps the subscription on a transient failure', async () => {
    send.mockRejectedValue(Object.assign(new Error('Busy'), { statusCode: 503 }));
    const service = await build();

    await expect(service.sendToUser(USER, { title: 'x' })).resolves.toBeUndefined();
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('is a silent no-op without VAPID keys', async () => {
    config = {};
    const service = await build();

    await service.sendToUser(USER, { title: 'x' });
    expect(service.publicKey()).toBeNull();
    expect(model.find).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
