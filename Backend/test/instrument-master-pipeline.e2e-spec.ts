import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import { INSTRUMENT_MASTER_PROVIDER } from '../src/modules/instrument-master/instrument-master.constants';
import { InstrumentMasterService } from '../src/modules/instrument-master/instrument-master.service';
import { InstrumentResolverService } from '../src/modules/instrument-resolver/instrument-resolver.service';
import { Instrument } from '../src/modules/instrument-master/entities/instrument.entity';
import { OptionType } from '../src/modules/instrument-master/option-type.enum';
import type { IInstrumentMasterProvider } from '../src/modules/instrument-master/interfaces/instrument-master-provider.interface';

/**
 * Proves the Phase 3 pipeline end-to-end against real MongoDB WITHOUT ever
 * calling the real Angel One instrument-master endpoint: the broker provider
 * is overridden with an in-memory stub, while InstrumentMasterService,
 * InstrumentCache, the Mongo backup repository, InstrumentResolverService,
 * and the Event Bus / audit log pipeline are all real.
 */
describe('Instrument master pipeline (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let stubProvider: jest.Mocked<IInstrumentMasterProvider>;

  const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const stubInstruments = [
    new Instrument(
      'E2E1',
      'BFO',
      'OPTIDX',
      'SENSEX77200CE',
      'SENSEX',
      futureExpiry,
      77200,
      OptionType.CE,
      10,
      0.05,
      2,
    ),
    new Instrument(
      'E2E2',
      'NSE',
      'EQ',
      'RELIANCE-EQ',
      'RELIANCE',
      null,
      null,
      null,
      1,
      0.05,
      2,
    ),
  ];

  beforeAll(async () => {
    stubProvider = {
      brokerName: 'e2e-stub-broker',
      fetchInstruments: jest.fn().mockResolvedValue(stubInstruments),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(INSTRUMENT_MASTER_PROVIDER)
      .useValue(stubProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    connection = app.get<Connection>(getConnectionToken());

    // Startup itself is network-free (backup-restore only); explicitly
    // trigger the (stubbed, never-real) live refresh once, the way a manual
    // trigger or the daily cron would in production.
    await app.get(InstrumentMasterService).refresh();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loads the instrument master into the in-memory cache via refresh(), without calling the real broker', () => {
    const masterService = app.get(InstrumentMasterService);
    expect(stubProvider.fetchInstruments).toHaveBeenCalled();
    expect(masterService.getSnapshot().instrumentCount).toBe(2);
    expect(masterService.getCache().findByToken('E2E1')).toBeDefined();
  });

  it('persists a real backup snapshot to MongoDB', async () => {
    const masterService = app.get(InstrumentMasterService);
    const { version } = masterService.getSnapshot();

    const instrumentsCollection = connection.collection('instruments');
    const docs = await instrumentsCollection
      .find({ version, token: { $in: ['E2E1', 'E2E2'] } })
      .toArray();
    expect(docs).toHaveLength(2);
  });

  it('records real audit log entries for the refresh lifecycle', async () => {
    const auditLogs = connection.collection('auditLogs');
    const loadingStarted = await auditLogs.findOne({
      eventName: 'instrument-master.loading.started',
    });
    const refreshStarted = await auditLogs.findOne({
      eventName: 'instrument-master.refresh.started',
    });
    const refreshCompleted = await auditLogs.findOne({
      eventName: 'instrument-master.refresh.completed',
    });

    expect(loadingStarted).not.toBeNull();
    expect(refreshStarted).not.toBeNull();
    expect(refreshCompleted).not.toBeNull();
  });

  it('resolves a real option symbol end-to-end through InstrumentResolverService', () => {
    const resolver = app.get(InstrumentResolverService);

    const resolved = resolver.resolve('Sensex 77200 CE');

    expect(resolved.instrumentToken).toBe('E2E1');
    expect(resolved.exchange).toBe('BFO');
    expect(resolved.lotSize).toBe(10);
  });

  it('resolves a plain equity symbol end-to-end', () => {
    const resolver = app.get(InstrumentResolverService);
    const resolved = resolver.resolve('RELIANCE');
    expect(resolved.instrumentToken).toBe('E2E2');
  });

  it('rejects an unknown symbol and records InstrumentResolutionFailed in the audit log', async () => {
    const resolver = app.get(InstrumentResolverService);

    expect(() => resolver.resolve('NoSuchSymbol')).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditLogs = connection.collection('auditLogs');
    const failedEntry = await auditLogs.findOne({
      eventName: 'instrument.resolution.failed',
      'payload.rawSymbol': 'NoSuchSymbol',
    });
    expect(failedEntry).not.toBeNull();
  });

  it('keeps serving the previous cache generation if a manual refresh fails', async () => {
    const masterService = app.get(InstrumentMasterService);
    const before = masterService.getSnapshot();

    stubProvider.fetchInstruments.mockRejectedValueOnce(
      new Error('simulated broker outage'),
    );
    await expect(masterService.refresh()).rejects.toThrow(
      'simulated broker outage',
    );

    expect(masterService.getSnapshot()).toEqual(before);
    expect(masterService.getCache().findByToken('E2E1')).toBeDefined();

    // Let this test's own background audit-log write (from RefreshFailedEvent)
    // finish before the suite's afterAll() closes the Mongo connection pool.
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
