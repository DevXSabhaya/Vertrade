import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import { FeatureFlagsService } from '../src/core/feature-flags/feature-flag.service';
import { SettingsService } from '../src/modules/settings/settings.service';

/**
 * Proves the Phase 1 pipeline end-to-end against a real MongoDB instance:
 * FeatureFlagsService / SettingsService publish a domain event through the
 * real Event Bus, and AuditLogSubscriber independently persists it to the
 * real `auditLogs` collection — with no direct call between the two.
 */
describe('Event pipeline (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists an audit log entry when a feature flag is updated', async () => {
    const featureFlagsService = app.get(FeatureFlagsService);
    const flagName = `test-flag-${Date.now()}`;

    await featureFlagsService.setEnabled(flagName, true);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditLogs = connection.collection('auditLogs');
    const entry = await auditLogs.findOne({
      eventName: 'feature-flag.updated',
      'payload.name': flagName,
    });

    expect(entry).not.toBeNull();
    expect(entry?.['payload']).toMatchObject({ name: flagName, enabled: true });
  });

  it('persists an audit log entry when a setting is updated', async () => {
    const settingsService = app.get(SettingsService);
    const key = `test-setting-${Date.now()}`;

    await settingsService.set(key, 42, 'e2e-test');
    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditLogs = connection.collection('auditLogs');
    const entry = await auditLogs.findOne({
      eventName: 'setting.updated',
      'payload.key': key,
    });

    expect(entry).not.toBeNull();
    expect(entry?.['payload']).toMatchObject({ key, value: 42 });
  });

  it('makes the updated setting immediately readable from the in-memory cache', async () => {
    const settingsService = app.get(SettingsService);
    const key = `cache-setting-${Date.now()}`;

    await settingsService.set(key, 'cached-value');

    expect(settingsService.get<string>(key)).toBe('cached-value');

    // Let this test's own background audit-log write finish before the
    // suite's afterAll() closes the Mongo connection pool.
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
