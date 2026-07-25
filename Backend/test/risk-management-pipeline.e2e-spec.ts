import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { RiskEvaluationService } from '../src/modules/risk-management/risk-evaluation.service';
import { RiskPolicyService } from '../src/modules/risk-management/risk-policy.service';
import { KillSwitchService } from '../src/modules/risk-management/kill-switch.service';
import { EmergencyStopService } from '../src/modules/risk-management/emergency-stop.service';
import { CooldownService } from '../src/modules/risk-management/cooldown.service';
import { KillSwitchStatus } from '../src/modules/risk-management/models/kill-switch-status.enum';
import { RiskReasonCode } from '../src/modules/risk-management/models/risk-reason-code.enum';
import { CooldownReason } from '../src/modules/risk-management/models/cooldown.model';
import { DEFAULT_RISK_POLICY } from '../src/modules/risk-management/models/risk-policy.model';
import { TradeDirection } from '../src/modules/trading-engine/domain/trade-direction.enum';
import type { TradeRiskContext } from '../src/modules/risk-management/models/trade-risk-context.model';

/**
 * Requires a reachable MongoDB instance (MONGODB_URI in .env), same as every
 * other e2e suite in this project. Exercises the real Risk Management module
 * wired into the real AppModule — real Mongo-backed policy/kill-switch/
 * emergency-stop/cooldown state, real `RiskEvaluationService`, and the real
 * `RiskManagementController` HTTP surface — not mocks.
 */
describe('Risk management pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let riskEvaluationService: RiskEvaluationService;
  let riskPolicyService: RiskPolicyService;
  let killSwitchService: KillSwitchService;
  let emergencyStopService: EmergencyStopService;
  let cooldownService: CooldownService;

  function tradeContext(
    overrides: Partial<TradeRiskContext> = {},
  ): TradeRiskContext {
    return {
      rawSymbol: 'E2E-RISK-TEST',
      instrumentToken: `TOKEN-${Date.now()}`,
      tradingSymbol: 'E2E-RISK-TEST-EQ',
      direction: TradeDirection.LONG,
      quantity: 1,
      entryTriggerPrice: 100,
      initialStopLoss: 95,
      targets: [110],
      ...overrides,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    riskEvaluationService = app.get(RiskEvaluationService);
    riskPolicyService = app.get(RiskPolicyService);
    killSwitchService = app.get(KillSwitchService);
    emergencyStopService = app.get(EmergencyStopService);
    cooldownService = app.get(CooldownService);
  });

  afterEach(async () => {
    // Restore a clean baseline so state from one test never leaks into the next.
    await riskPolicyService.updatePolicy(DEFAULT_RISK_POLICY);
    await emergencyStopService.reset('e2e-cleanup');
    await killSwitchService.deactivate('e2e-cleanup');
    await cooldownService.end();
  });

  afterAll(async () => {
    await app.close();
  });

  it('approves a trade that is within every configured risk limit', async () => {
    const decision = await riskEvaluationService.evaluate(tradeContext());

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBeNull();
    expect(decision.riskSnapshot.killSwitchStatus).toBe(
      KillSwitchStatus.ACTIVE,
    );
  });

  it('rejects a trade once the maximum open trades policy limit is set to 0', async () => {
    await riskPolicyService.updatePolicy({ maxOpenTrades: 0 });

    const decision = await riskEvaluationService.evaluate(tradeContext());

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(RiskReasonCode.MAX_OPEN_TRADES_REACHED);
  });

  it('rejects a trade that exceeds the configured max risk per trade', async () => {
    await riskPolicyService.updatePolicy({
      maxRiskPerTrade: 10,
      maxRiskPerTradePercentage: 100,
    });

    const decision = await riskEvaluationService.evaluate(
      tradeContext({
        entryTriggerPrice: 100,
        initialStopLoss: 50,
        quantity: 100,
      }),
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe(
      RiskReasonCode.MAX_RISK_PER_TRADE_EXCEEDED,
    );
  });

  it('activates the kill switch via the HTTP API and reflects it in GET /risk/status', async () => {
    await request(app.getHttpServer())
      .post('/risk/kill-switch/activate')
      .send({ status: KillSwitchStatus.TRADING_DISABLED, reason: 'e2e test' })
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe(KillSwitchStatus.TRADING_DISABLED);
      });

    const status = await request(app.getHttpServer())
      .get('/risk/status')
      .expect(200);
    expect(status.body.killSwitchStatus).toBe(
      KillSwitchStatus.TRADING_DISABLED,
    );
    expect(status.body.tradingBlocked).toBe(true);
  });

  it('blocks a new trade while the kill switch is engaged, and allows it again after deactivation', async () => {
    await killSwitchService.activate(
      KillSwitchStatus.TRADING_DISABLED,
      'e2e test',
      'e2e',
      false,
    );

    const blocked = await riskEvaluationService.evaluate(tradeContext());
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCode).toBe(RiskReasonCode.KILL_SWITCH_ACTIVE);

    await request(app.getHttpServer())
      .post('/risk/kill-switch/deactivate')
      .send({ deactivatedBy: 'e2e' })
      .expect(201);

    const allowed = await riskEvaluationService.evaluate(tradeContext());
    expect(allowed.allowed).toBe(true);
  });

  it('triggers emergency stop via the HTTP API, blocking trading until both it and the kill switch are cleared', async () => {
    // No cooldown-after-emergency-exit noise in this test — it isolates the kill-switch/emergency-stop interaction only.
    await riskPolicyService.updatePolicy({ cooldownAfterEmergencyExitMs: 0 });

    await request(app.getHttpServer())
      .post('/risk/emergency-stop')
      .send({ reason: 'e2e simulated failure' })
      .expect(201)
      .expect((res) => {
        expect(res.body.active).toBe(true);
      });

    let status = await request(app.getHttpServer())
      .get('/risk/status')
      .expect(200);
    expect(status.body.emergencyStopActive).toBe(true);
    expect(status.body.tradingBlocked).toBe(true);

    const blocked = await riskEvaluationService.evaluate(tradeContext());
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCode).toBe(RiskReasonCode.EMERGENCY_STOP_ACTIVE);

    await request(app.getHttpServer())
      .post('/risk/emergency-stop/reset')
      .send({ resetBy: 'e2e' })
      .expect(201);

    // Resetting emergency stop alone must not silently re-enable trading —
    // the kill switch (still EMERGENCY_STOP) requires a separate, deliberate deactivation.
    status = await request(app.getHttpServer()).get('/risk/status').expect(200);
    expect(status.body.emergencyStopActive).toBe(false);
    expect(status.body.killSwitchStatus).toBe(KillSwitchStatus.EMERGENCY_STOP);
    expect(status.body.tradingBlocked).toBe(true);

    await request(app.getHttpServer())
      .post('/risk/kill-switch/deactivate')
      .send({ deactivatedBy: 'e2e' })
      .expect(201);

    status = await request(app.getHttpServer()).get('/risk/status').expect(200);
    expect(status.body.tradingBlocked).toBe(false);
  });

  it('updates the risk policy via PUT /risk/policy and reflects it in GET /risk/policy', async () => {
    await request(app.getHttpServer())
      .put('/risk/policy')
      .send({ maxOpenTrades: 9 })
      .expect(200)
      .expect((res) => {
        expect(res.body.maxOpenTrades).toBe(9);
      });

    const policy = await request(app.getHttpServer())
      .get('/risk/policy')
      .expect(200);
    expect(policy.body.maxOpenTrades).toBe(9);

    const limits = await request(app.getHttpServer())
      .get('/risk/limits')
      .expect(200);
    expect(limits.body.maxOpenTrades).toBe(9);
  });

  it('blocks new trades while a cooldown is active, and allows them again once it expires', async () => {
    await cooldownService.start(CooldownReason.DAILY_LOSS, 300);

    const cooldownResponse = await request(app.getHttpServer())
      .get('/risk/cooldown')
      .expect(200);
    expect(cooldownResponse.body).not.toBeNull();
    expect(cooldownResponse.body.reason).toBe(CooldownReason.DAILY_LOSS);

    const blocked = await riskEvaluationService.evaluate(tradeContext());
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCode).toBe(RiskReasonCode.COOLDOWN_ACTIVE);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const statusResponse = await request(app.getHttpServer())
      .get('/risk/status')
      .expect(200);
    expect(statusResponse.body.cooldownActive).toBe(false);

    const allowed = await riskEvaluationService.evaluate(tradeContext());
    expect(allowed.allowed).toBe(true);
  });

  it('records a risk violation retrievable via GET /risk/violations after a rejection', async () => {
    await riskPolicyService.updatePolicy({ maxOpenTrades: 0 });
    const rejectedSymbol = `E2E-VIOLATION-${Date.now()}`;
    await riskEvaluationService.evaluate(
      tradeContext({ rawSymbol: rejectedSymbol }),
    );

    // The recorder persists asynchronously off the event bus.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const violations = await request(app.getHttpServer())
      .get('/risk/violations?limit=50')
      .expect(200);
    expect(
      (violations.body as Array<{ rawSymbol: string }>).some(
        (v) => v.rawSymbol === rejectedSymbol,
      ),
    ).toBe(true);
  });
});
