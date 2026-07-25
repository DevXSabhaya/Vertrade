import { TradeManager } from './trade-manager.service';
import type { PositionManager } from './position-manager.service';
import type { ExitManager } from './exit-manager.service';
import type { ITradeHistoryRepository } from './interfaces/trade-history-repository.interface';

describe('TradeManager', () => {
  let positionManager: jest.Mocked<
    Pick<
      PositionManager,
      'getAllPositions' | 'getActivePositions' | 'getPosition'
    >
  >;
  let exitManager: jest.Mocked<Pick<ExitManager, 'manualExit' | 'forceExit'>>;
  let historyRepository: jest.Mocked<ITradeHistoryRepository>;
  let manager: TradeManager;

  beforeEach(() => {
    positionManager = {
      getAllPositions: jest.fn().mockResolvedValue([]),
      getActivePositions: jest.fn().mockResolvedValue([]),
      getPosition: jest.fn().mockResolvedValue({ tradeId: 't1' }),
    };
    exitManager = {
      manualExit: jest.fn().mockResolvedValue({ tradeId: 't1' }),
      forceExit: jest.fn().mockResolvedValue({ tradeId: 't1' }),
    };
    historyRepository = {
      save: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
    };
    manager = new TradeManager(
      positionManager as unknown as PositionManager,
      exitManager as unknown as ExitManager,
      historyRepository,
    );
  });

  it('getAllTrades delegates to PositionManager.getAllPositions', async () => {
    await manager.getAllTrades();
    expect(positionManager.getAllPositions).toHaveBeenCalled();
  });

  it('getTrade delegates to PositionManager.getPosition', async () => {
    await manager.getTrade('t1');
    expect(positionManager.getPosition).toHaveBeenCalledWith('t1');
  });

  it('getActiveTrades delegates to PositionManager.getActivePositions', async () => {
    await manager.getActiveTrades();
    expect(positionManager.getActivePositions).toHaveBeenCalled();
  });

  it('getHistory delegates to the history repository with defaults', async () => {
    await manager.getHistory();
    expect(historyRepository.findAll).toHaveBeenCalledWith(50, 0);
  });

  it('getHistory forwards explicit limit/offset', async () => {
    await manager.getHistory(10, 5);
    expect(historyRepository.findAll).toHaveBeenCalledWith(10, 5);
  });

  it('manualExit delegates to ExitManager.manualExit', async () => {
    await manager.manualExit('t1');
    expect(exitManager.manualExit).toHaveBeenCalledWith('t1');
  });

  it('forceExit delegates to ExitManager.forceExit', async () => {
    await manager.forceExit('t1');
    expect(exitManager.forceExit).toHaveBeenCalledWith('t1');
  });
});
