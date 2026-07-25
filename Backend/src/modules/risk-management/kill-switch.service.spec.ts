import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import type { ExitManager } from '@modules/trade-lifecycle/exit-manager.service';
import type { IKillSwitchStateRepository } from './interfaces/kill-switch-state-repository.interface';
import { KillSwitchService } from './kill-switch.service';
import type { RiskEventPublisher } from './risk-event-publisher';
import { KillSwitchStatus } from './models/kill-switch-status.enum';
import type { KillSwitchState } from './models/kill-switch-state.model';
import { FakeClock } from './testing/fake-clock';

function repository(
  persisted: KillSwitchState | null = null,
): jest.Mocked<IKillSwitchStateRepository> {
  return {
    find: jest.fn().mockResolvedValue(persisted),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function tradingEngineService(
  trades: Array<Pick<TradeSnapshot, 'id' | 'state'>> = [],
): jest.Mocked<Pick<TradingEngineService, 'getAllTrades' | 'cancelTrade'>> {
  return {
    getAllTrades: jest.fn().mockReturnValue(trades),
    cancelTrade: jest.fn().mockResolvedValue(undefined),
  };
}

function exitManager(): jest.Mocked<Pick<ExitManager, 'emergencyExitAll'>> {
  return { emergencyExitAll: jest.fn().mockResolvedValue(undefined) };
}

function eventPublisher(): jest.Mocked<
  Pick<RiskEventPublisher, 'killSwitchActivated' | 'killSwitchDeactivated'>
> {
  return { killSwitchActivated: jest.fn(), killSwitchDeactivated: jest.fn() };
}

describe('KillSwitchService', () => {
  it('defaults to ACTIVE (not blocking) when nothing is persisted', async () => {
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      tradingEngineService() as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();
    expect(service.getState().status).toBe(KillSwitchStatus.ACTIVE);
    expect(service.isBlocking()).toBe(false);
  });

  it('activates TRADING_DISABLED, persists it, and publishes the event without cancelling trades', async () => {
    const repo = repository(null);
    const publisher = eventPublisher();
    const engine = tradingEngineService([
      { id: 't1', state: TradeState.WAITING_ENTRY },
    ]);
    const service = new KillSwitchService(
      repo,
      new FakeClock(),
      engine as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    const state = await service.activate(
      KillSwitchStatus.TRADING_DISABLED,
      'manual pause',
      'operator',
      false,
    );

    expect(state.status).toBe(KillSwitchStatus.TRADING_DISABLED);
    expect(service.isBlocking()).toBe(true);
    expect(publisher.killSwitchActivated).toHaveBeenCalledWith(
      KillSwitchStatus.TRADING_DISABLED,
      'manual pause',
      'operator',
    );
    expect(engine.cancelTrade).not.toHaveBeenCalled();
  });

  it('activating EMERGENCY_STOP cancels pending (non-terminal, non-active) trades', async () => {
    const engine = tradingEngineService([
      { id: 't1', state: TradeState.WAITING_ENTRY },
      { id: 't2', state: TradeState.ENTRY_PENDING },
      { id: 't3', state: TradeState.ACTIVE },
      { id: 't4', state: TradeState.COMPLETED },
    ]);
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      engine as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.activate(
      KillSwitchStatus.EMERGENCY_STOP,
      'broker unavailable',
      'system',
      false,
    );

    expect(engine.cancelTrade).toHaveBeenCalledTimes(2);
    expect(engine.cancelTrade).toHaveBeenCalledWith('t1', expect.any(String));
    expect(engine.cancelTrade).toHaveBeenCalledWith('t2', expect.any(String));
  });

  it('activating EMERGENCY_STOP with forceExitPositions force-exits all active positions', async () => {
    const engine = tradingEngineService([]);
    const exits = exitManager();
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      engine as unknown as TradingEngineService,
      exits as unknown as ExitManager,
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.activate(
      KillSwitchStatus.EMERGENCY_STOP,
      'daily loss breach',
      'system',
      true,
    );

    expect(exits.emergencyExitAll).toHaveBeenCalledTimes(1);
  });

  it('does not force-exit when forceExitPositions is false', async () => {
    const exits = exitManager();
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      tradingEngineService() as unknown as TradingEngineService,
      exits as unknown as ExitManager,
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.activate(
      KillSwitchStatus.EMERGENCY_STOP,
      'reason',
      'system',
      false,
    );

    expect(exits.emergencyExitAll).not.toHaveBeenCalled();
  });

  it('is idempotent: activating the same status twice does not re-publish or re-run protective actions', async () => {
    const engine = tradingEngineService([
      { id: 't1', state: TradeState.WAITING_ENTRY },
    ]);
    const publisher = eventPublisher();
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      engine as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.activate(
      KillSwitchStatus.TRADING_DISABLED,
      'first',
      'operator',
      false,
    );
    await service.activate(
      KillSwitchStatus.TRADING_DISABLED,
      'second',
      'operator',
      false,
    );

    expect(publisher.killSwitchActivated).toHaveBeenCalledTimes(1);
    expect(service.getState().reason).toBe('first');
  });

  it('deactivate() restores ACTIVE and publishes the event', async () => {
    const publisher = eventPublisher();
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      tradingEngineService() as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();
    await service.activate(
      KillSwitchStatus.TRADING_DISABLED,
      'reason',
      'operator',
      false,
    );

    const state = await service.deactivate('operator');

    expect(state.status).toBe(KillSwitchStatus.ACTIVE);
    expect(service.isBlocking()).toBe(false);
    expect(publisher.killSwitchDeactivated).toHaveBeenCalledWith('operator');
  });

  it('deactivate() is idempotent when already ACTIVE', async () => {
    const publisher = eventPublisher();
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      tradingEngineService() as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      publisher as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.deactivate('operator');

    expect(publisher.killSwitchDeactivated).not.toHaveBeenCalled();
  });

  it('continues cancelling remaining trades if one cancellation fails', async () => {
    const engine = tradingEngineService([
      { id: 't1', state: TradeState.WAITING_ENTRY },
      { id: 't2', state: TradeState.WAITING_ENTRY },
    ]);
    (engine.cancelTrade as jest.Mock).mockRejectedValueOnce(
      new Error('broker timeout'),
    );
    const service = new KillSwitchService(
      repository(null),
      new FakeClock(),
      engine as unknown as TradingEngineService,
      exitManager() as unknown as ExitManager,
      eventPublisher() as unknown as RiskEventPublisher,
    );
    await service.load();

    await service.activate(
      KillSwitchStatus.EMERGENCY_STOP,
      'reason',
      'system',
      false,
    );

    expect(engine.cancelTrade).toHaveBeenCalledTimes(2);
  });
});
