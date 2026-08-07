import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import { BROKER_AUTH } from '../src/modules/broker/broker-auth/broker-auth.constants';
import { BrokerSessionManager } from '../src/modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '../src/modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '../src/modules/broker/broker-auth/value-objects/broker-token.vo';
import type { IBrokerAuth } from '../src/modules/broker/broker-auth/interfaces/broker-auth.interface';

/**
 * Proves the Phase 2 pipeline end-to-end against real MongoDB WITHOUT ever
 * calling the real Dhan API: BROKER_AUTH is overridden with an in-memory
 * stub, while everything downstream (BrokerSessionManager, the Event Bus,
 * AuditLogSubscriber, BrokerTokenRepository's encryption) is real.
 */
describe('Broker auth pipeline (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let stubBrokerAuth: jest.Mocked<IBrokerAuth>;

  const accountId = 'system';

  const fakeSession = new BrokerSession(
    'E2E_CLIENT',
    new BrokerToken('fake-access-token-value'),
    new Date(),
    new Date(Date.now() + 60_000),
  );

  beforeAll(async () => {
    stubBrokerAuth = {
      login: jest.fn().mockResolvedValue(fakeSession),
      refresh: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
      validateSession: jest.fn().mockReturnValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BROKER_AUTH)
      .useValue(stubBrokerAuth)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in without ever calling the real Dhan API', async () => {
    const sessionManager = app.get(BrokerSessionManager);

    const session = await sessionManager.login(accountId);

    expect(stubBrokerAuth.login).toHaveBeenCalledTimes(1);
    expect(session.clientCode).toBe('E2E_CLIENT');
  });

  it('persists the session to brokerTokens with the tokens encrypted, not in plaintext', async () => {
    const brokerTokens = connection.collection('brokerTokens');
    const doc = await brokerTokens.findOne({
      userId: 'system',
      broker: 'dhan',
    });

    expect(doc).not.toBeNull();
    expect(doc?.['encryptedPayload']).toEqual(expect.any(String));
    expect(doc?.['encryptedPayload']).not.toContain('fake-access-token-value');
  });

  it('records a real audit log entry for the login event, via the Event Bus, not a direct call', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditLogs = connection.collection('auditLogs');
    const startedEntry = await auditLogs.findOne({
      eventName: 'broker.login.started',
    });
    const succeededEntry = await auditLogs.findOne({
      eventName: 'broker.login.succeeded',
    });

    expect(startedEntry).not.toBeNull();
    expect(succeededEntry).not.toBeNull();
    expect(succeededEntry?.['payload']).toMatchObject({
      clientCode: 'E2E_CLIENT',
    });
  });

  it('logs out, clears storage, and records the logout event', async () => {
    const sessionManager = app.get(BrokerSessionManager);

    await sessionManager.logout(accountId);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(stubBrokerAuth.logout).toHaveBeenCalledTimes(1);
    expect(sessionManager.getActiveSession(accountId)).toBeNull();

    const brokerTokens = connection.collection('brokerTokens');
    const doc = await brokerTokens.findOne({
      userId: 'system',
      broker: 'dhan',
    });
    expect(doc).toBeNull();

    const auditLogs = connection.collection('auditLogs');
    const logoutEntry = await auditLogs.findOne({
      eventName: 'broker.logout.completed',
    });
    expect(logoutEntry).not.toBeNull();
  });
});
