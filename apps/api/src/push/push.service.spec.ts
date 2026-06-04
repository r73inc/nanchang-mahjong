/**
 * push.service.spec.ts
 *
 * Feature coverage:
 *  - Push·subscription: storing a push subscription writes the right DDB item
 *  - Push·unsubscribe: removing a subscription deletes the DDB item
 *  - Push·send-no-subscription: sendToUser is a no-op when no subscription exists
 *  - Push·send-expired: 410/404 response auto-removes the stored subscription
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import { DynamoDBService, DK } from '../database/dynamodb.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webPush from 'web-push';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

const mockDb = {
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
} as unknown as DynamoDBService;

const VAPID_CONFIG = {
  subject: 'mailto:test@example.com',
  publicKey: 'BFake_Public_Key_For_Tests_Only_32bytesmin',
  privateKey: 'fake-private-key',
};

function makeConfigService(vapid = VAPID_CONFIG) {
  return {
    get: (key: string) => {
      if (key === 'vapid') return vapid;
      if (key === 'vapid.publicKey') return vapid.publicKey;
      return undefined;
    },
  } as unknown as ConfigService;
}

const MOCK_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  keys: { p256dh: 'BEtest_p256dh_key', auth: 'test_auth_key' },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PushService', () => {
  let service: PushService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ Item: undefined });
    mockPut.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
    (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: DynamoDBService, useValue: mockDb },
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    service.onModuleInit(); // initialise VAPID
  });

  // ── Push·subscription ──────────────────────────────────────────────────────

  it('Push·subscription — subscribe writes push sub to DDB', async () => {
    await service.subscribe('user-1', MOCK_SUBSCRIPTION);
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          ...DK.userPushSub('user-1'),
          endpoint: MOCK_SUBSCRIPTION.endpoint,
          p256dh: MOCK_SUBSCRIPTION.keys.p256dh,
          auth: MOCK_SUBSCRIPTION.keys.auth,
        }),
      }),
    );
  });

  it('Push·subscription — getSubscription returns null when no item in DDB', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    const result = await service.getSubscription('user-1');
    expect(result).toBeNull();
  });

  it('Push·subscription — getSubscription reconstructs sub from DDB item', async () => {
    mockGet.mockResolvedValue({
      Item: {
        PK: 'USER#user-1',
        SK: 'PUSH_SUB',
        endpoint: MOCK_SUBSCRIPTION.endpoint,
        p256dh: MOCK_SUBSCRIPTION.keys.p256dh,
        auth: MOCK_SUBSCRIPTION.keys.auth,
      },
    });
    const result = await service.getSubscription('user-1');
    expect(result).toEqual(MOCK_SUBSCRIPTION);
  });

  // ── Push·unsubscribe ───────────────────────────────────────────────────────

  it('Push·unsubscribe — unsubscribe deletes the DDB item', async () => {
    await service.unsubscribe('user-1');
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ Key: DK.userPushSub('user-1') }),
    );
  });

  // ── Push·send ─────────────────────────────────────────────────────────────

  it('Push·send-no-subscription — sendToUser is a no-op when no sub exists', async () => {
    mockGet.mockResolvedValue({ Item: undefined });
    await service.sendToUser('user-1', { title: 'Test', body: 'Hello' });
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });

  it('Push·send — sendToUser calls webPush.sendNotification with subscription', async () => {
    mockGet.mockResolvedValue({
      Item: {
        PK: 'USER#user-1',
        SK: 'PUSH_SUB',
        endpoint: MOCK_SUBSCRIPTION.endpoint,
        p256dh: MOCK_SUBSCRIPTION.keys.p256dh,
        auth: MOCK_SUBSCRIPTION.keys.auth,
      },
    });
    await service.sendToUser('user-1', { title: 'Your Turn', body: 'Go!' });
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      MOCK_SUBSCRIPTION,
      JSON.stringify({ title: 'Your Turn', body: 'Go!' }),
    );
  });

  it('Push·send-expired — 410 response auto-removes the subscription', async () => {
    mockGet.mockResolvedValue({
      Item: {
        PK: 'USER#user-1',
        SK: 'PUSH_SUB',
        endpoint: MOCK_SUBSCRIPTION.endpoint,
        p256dh: MOCK_SUBSCRIPTION.keys.p256dh,
        auth: MOCK_SUBSCRIPTION.keys.auth,
      },
    });
    (webPush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
    await service.sendToUser('user-1', { title: 'X', body: 'Y' });
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({ Key: DK.userPushSub('user-1') }),
    );
  });

  it('Push·send — disabled without VAPID keys — sendToUser does nothing', async () => {
    const noKeyConfig = makeConfigService({ subject: '', publicKey: '', privateKey: '' });
    const mod = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: DynamoDBService, useValue: mockDb },
        { provide: ConfigService, useValue: noKeyConfig },
      ],
    }).compile();
    const disabledService = mod.get<PushService>(PushService);
    disabledService.onModuleInit();
    await disabledService.sendToUser('user-1', { title: 'T', body: 'B' });
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});
