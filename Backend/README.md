<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Market Data Module

The Market Data module (`src/modules/market-data/`) is the single owner of live
market data. The Trading Engine never imports it, never sees a raw broker tick,
and never knows which provider is active — it only ever subscribes to
`MarketPriceUpdatedEvent` on the Event Bus (`src/shared/events/`).

### Provider abstraction

`IMarketDataProvider` (`interfaces/market-data-provider.interface.ts`) defines
`connect/disconnect/subscribe/unsubscribe/reconnect/isConnected` plus three
registration hooks (`onTick`, `onHeartbeat`, `onConnectionStateChange`). Two
implementations exist today:

- **MockMarketDataProvider** (`providers/mock/`) — a fully in-memory simulator.
  In live mode it runs a real `setInterval`-driven random walk per subscribed
  instrument; in **deterministic mode** all timers are disabled and tests
  trigger ticks/heartbeats manually via `emitDeterministicTick()` /
  `emitDeterministicHeartbeat()` — no randomness, no timers, fully
  reproducible. This is the **default** provider; no Angel One credentials are
  ever required to run the backend.
- **AngelOneMarketDataProvider** (`providers/angel-one/`) — the production
  adapter. The real transport is fully isolated behind `IWebSocketClient`, so
  this class never touches a socket directly. It owns its own connection
  lifecycle, subscription framing, ping/pong heartbeat, and exponential
  backoff reconnection with jitter and a max-retry cap. Not exercised against
  the real Angel One feed in this environment — verify against a
  real/sandbox account before enabling Live market data.

Switching providers is a **configuration-only** change:
`MARKET_DATA_PROVIDER=MOCK` (default) or `MARKET_DATA_PROVIDER=ANGEL_ONE` in
`.env` — no code changes needed. `MarketDataModule` binds the `MARKET_DATA_PROVIDER`
DI token to whichever provider `ConfigService.marketDataProvider` selects.

### Tick normalization

Every provider's raw payload is converted to the broker-independent `Tick`
model (`models/tick.model.ts`: instrumentToken, tradingSymbol, exchange,
lastPrice, bid, ask, volume, openInterest, timestamp, sequenceNumber) before
it ever leaves that provider. Angel One's normalizer
(`providers/angel-one/angel-one-tick.normalizer.ts`) uses the shared
`Result<T, E>` type and never guesses: a malformed or token-mismatched payload
is a `Result.fail`, silently dropped by the provider rather than propagated as
a bad tick. A future broker plugs in by writing its own normalizer with the
same signature — nothing else changes.

### Subscription model

`SubscriptionManager` (`subscription/subscription-manager.ts`) is
reference-counted: many callers can each subscribe to the same instrument
token, but the broker only ever receives one subscribe request (on the
0→1 transition) and one unsubscribe request (on the 1→0 transition) —
duplicate broker subscriptions are structurally impossible.

### Event flow

`MarketDataService` is the only publisher of these events:

| Event | Meaning |
|---|---|
| `MarketPriceUpdatedEvent` (shared) | A normalized tick arrived — the Trading Engine's only input |
| `MarketDataConnectedEvent` | The active provider is connected |
| `MarketDataDisconnectedEvent` | The active provider is disconnected |
| `MarketDataReconnectingEvent` | A reconnect attempt is in progress (carries the attempt number) |
| `SubscriptionAddedEvent` / `SubscriptionRemovedEvent` | A subscriber was added/removed (fires for every subscriber, independent of broker-level dedup) |
| `HeartbeatReceivedEvent` | A heartbeat was observed from the active provider |

### Lifecycle & reconnection

`MarketDataService.start()`/`stop()` connect/disconnect the active provider —
nothing connects automatically at boot (a later Scheduler Service phase is
responsible for triggering this as part of its Morning Startup routine, so a
misconfigured Angel One provider can never block `npm start`). A
provider-agnostic heartbeat-staleness watchdog (`ReconnectOptions.heartbeatTimeoutMs`,
checked every `heartbeatCheckIntervalMs` via the shared `ITimerScheduler`
abstraction) calls `provider.reconnect()` if no heartbeat has been seen in
time — this applies uniformly even when the Mock provider is active.
`AngelOneMarketDataProvider` additionally reconnects its own socket
automatically on an unexpected drop, using the same shared exponential
backoff-with-jitter utility (`reconnect/reconnect-backoff.util.ts`), giving up
after `maxRetries`.

## Trade Validation Engine & Order Queue

Every trade request flows through exactly one path: **Trade -> Validation ->
Queue -> Lock -> Executor -> Success/Retry/Failed**. Nothing skips it — the
Trading Engine never receives a trade that didn't pass through
`TradeValidationService`, and the broker never receives a duplicate order
because `OrderQueueService` guarantees exactly-once execution before the
Trading Engine is ever touched.

### Validation flow

`TradeValidationModule` (`src/modules/trade-validation/`) runs a fixed
pipeline of 10 isolated rules, in this exact order, stopping at the first
failure: **RequiredFields -> InstrumentExists -> MarketOpen -> Quantity ->
EntryPrice -> StopLoss -> Target -> DuplicateTrade -> Risk -> FeatureFlag**.
Each rule is a small, independently-testable class implementing
`IValidationRule`; the ordered list is assembled once, in
`TradeValidationModule`, and injected as a single array (the "Rule
Registry") — adding a new rule is a one-line addition there, never a change
to `TradeValidationService` itself (Open/Closed). A rule never throws for a
normal failure — it returns a `Result<void, ValidationFailure>` carrying a
`code`, `reason`, `message`, `failedRule`, and `timestamp`. `RiskRule` is the
Risk Gate: max open trades, max daily trades, max daily loss (computed from
today's realized PnL across all trades the Trading Engine already holds),
and max quantity, with separate (configurable) limits for `TRADING_MODE=PAPER`
vs `LIVE`. `FeatureFlagRule` is the last gate: the static, per-process Kill
Switch (`KILL_SWITCH_ENABLED`) is checked first (no DB round-trip), followed
by the runtime-toggleable `TRADING_ENABLED` feature flag.

### Queue flow & states

`OrderQueueModule` (`src/modules/order-queue/`) owns everything after
validation. A `QueueItem` aggregate (mirroring the Trade aggregate's own
design: private fields, a transition-validated state machine, a history log)
moves through **Queued -> Locked -> Processing -> Submitted -> Completed**,
with **Retrying** looping back to **Locked** and **Cancelled**/**Expired**/
**Failed** as the other terminal/pre-processing exits.

### Lock strategy

`LockManager` is in-memory, keyed by instrument token: the worker acquires a
lock (`Queued -> Locked`) before ever calling the Trading Engine, and
releases it on completion or terminal failure. A lock older than
`LOCK_TIMEOUT_MS` (default 30s) is considered abandoned — a crashed
worker, an unhandled exception — and can be stolen by the next attempt
("deadlock cleanup"): no lock can permanently starve the queue.

### Retry strategy

`RetryStrategy` is exponential backoff with jitter (the same formula used by
Market Data's reconnect logic, reimplemented locally to avoid a cross-module
dependency). Failures are classified: `InvalidTradeDefinitionException` and
`IllegalTradeStateTransitionException` from the Trading Engine are
**permanent** (never retried — a race against another already-resolved
trade, not a transient problem); everything else, including a lock still
held by another attempt, is **transient** and retried up to `maxRetries`
times before the item is marked `Failed`.

### Idempotency & exactly-once execution

`IdempotencyKeyGenerator` prefers a caller-supplied key (a UUID the frontend
generates once per click and resends on every retry of that click) — this is
the only mechanism that can dedupe requests seconds or minutes apart.
Without one, a key is derived from the trade's own shape (instrument, order
type, direction, quantity, entry price) plus a coarse time bucket, wide
enough to absorb a double-click, a duplicate WebSocket message, or an
immediate network retry. `OrderQueueService.submitTrade()` checks-then-
inserts synchronously (no `await` between the read and the write), which —
since Node.js runs a single-threaded event loop — is what actually makes
"duplicate requests return the existing item, never create a second one"
race-free, including for two literally-concurrent calls.

### Recovery flow

Every `QueueItem` state change is persisted to MongoDB
(`QueueItemRepository`) in addition to the in-memory map that's the runtime
source of truth. On startup, `OrderQueueService.onModuleInit()` reloads every
non-terminal item; anything left `Locked`/`Processing`/`Retrying` from a
crash is reset to `Queued` (any lock held by a now-dead process is
meaningless after a restart) and handed back to the worker automatically.

## Broker Health Monitor & Scheduler Service

Two modules close the loop between "the broker is fine" and "the system
acts on it": `BrokerHealthModule` continuously observes broker/session/
infrastructure health and drives recovery, while `SchedulerModule` drives
time-based automation (periodic checks, morning startup, market close).
Neither ever calls the Trading Engine or Order Queue's execution path
directly — all cross-module signalling is through the Event Bus.

### Health architecture

`BrokerHealthService` (`src/modules/broker-health/`) orchestrates 11
independent `IHealthIndicator` implementations — Broker Auth, REST API,
Order API, Market Data WebSocket, Market Data Provider, Instrument Master
freshness, Internet connectivity, Database connectivity, Event Bus,
Scheduler, and Order Queue — assembled as a single injected array (the
"Health Indicator Registry"), the same Open/Closed pattern used by the
Validation Rule Registry. `runHealthCheck()` runs every indicator via
`HealthAggregatorService.runAll()` (`Promise.all`), maps the results into a
`HealthSnapshot` (timestamp, overallStatus, brokerStatus, restApiStatus,
websocketStatus, marketDataStatus, authStatus, schedulerStatus,
databaseStatus, queueStatus, latency, heartbeatAge, lastSuccessfulRequest,
activeSubscriptions, connectedSince), persists it, and publishes
`HealthSnapshotUpdatedEvent`. `HealthAggregationPolicy` derives
`overallStatus` from the worst indicator by a fixed severity ranking
(`HEALTHY < UNKNOWN < WARNING < RECOVERING < DEGRADED < DISCONNECTED`), with
`MAINTENANCE` as an explicit override outside that ranking.
`HeartbeatMonitorService` separately watches Market Data's own heartbeat
stream, publishing `HeartbeatReceived` / `HeartbeatTimeout` /
`HeartbeatRecovered` based on a configurable timeout.

To avoid a circular module dependency (Scheduler's `HealthCheckJob`
legitimately needs to import `BrokerHealthModule`), `SchedulerHealthIndicator`
never imports `SchedulerModule` — it observes scheduler activity purely by
subscribing to the event-name strings `scheduler.started`,
`scheduler.stopped`, and `scheduler.job.completed` on the Event Bus.

### Scheduler architecture

`SchedulerService` (`src/modules/scheduler/`) owns three periodic timers
(health check, instrument refresh, cleanup — intervals from
`SchedulerConfig`) plus two on-demand workflows: `triggerMorningStartup()`
and `triggerMarketClose()`. Each of the five jobs (`MorningStartupJob`,
`MarketCloseJob`, `HealthCheckJob`, `InstrumentRefreshJob`, `CleanupJob`) is
an independently injectable `IScheduledJob`, held in a `JobRegistry` (the
same array-behind-a-token registry pattern as everywhere else). `runJob()`
always catches the job's own errors, records a `JobResult`, persists it, and
publishes `SchedulerJobCompletedEvent` or `JobFailedEvent` — a single job
failure never crashes the scheduler or blocks the next tick.

`MorningStartupJob` runs `ensureSession() -> refresh instrument master ->
start market data -> verify session/WS -> MorningStartupCompletedEvent`.
`MarketCloseJob` runs `stop market data -> expire stale queue items ->
cleanup stale locks -> MarketCloseCompletedEvent`; three architecture steps
(flush pending events, persist caches/archive trades, rotate logs) have no
real backing infrastructure in the current in-memory-Engine, synchronous-
event-bus architecture and are documented as intentional no-ops in the job's
source rather than faked. Like every service in this codebase that talks to
the network, `SchedulerService.start()` is never called from
`onModuleInit()` — it (and the two on-demand workflows) must be triggered
explicitly, so `npm start` never opens real connections on boot.

### Recovery strategy

`RecoveryManagerService` runs a fixed sequence — reconnect Market Data
(`stop()` then `start()`), refresh the broker session (falling back to a
full re-login on failure), then refresh the Instrument Master cache — and
records every attempt (success or failure) to a recovery-history
repository. `BrokerHealthService` triggers it automatically only when the
overall status is DEGRADED or DISCONNECTED, the `AUTOMATIC_RECOVERY`
feature flag is enabled, maintenance mode is off, and `ReconnectBackoffPolicy`
says enough time has passed since the last attempt (exponential backoff with
jitter, so a persistently-down broker is not hammered with reconnect
attempts). `RecoveryManagerService` deliberately never imports
`TradingEngineService` or `OrderQueueService` — recovery reconnects
infrastructure, it never re-submits a trade or touches Trading Engine state.

## Startup Recovery & Position Reconciliation

Two modules close the last gap: what happens if the backend crashes while
trades are active. `RecoveryModule` (`src/modules/recovery/`) rebuilds exact
in-memory state on restart without ever submitting a duplicate order;
`PositionReconciliationModule` (`src/modules/position-reconciliation/`)
continuously verifies that rebuilt state against what the broker actually
holds.

### Recovery flow & state machine

`RecoveryCoordinator` walks a fixed sequence of steps — Load Configuration,
Verify Database, Restore Feature Flags/Settings, Restore Broker
Authentication, Reconnect Broker, Reconnect Market Data, Reload Instrument
Master, Restore Active Trades, Restore Trading Engine, Restore Order Queue
(+ Idempotency Keys + Pending Orders), Resume Tick Processing, Resume
Monitoring, Verify Positions — each one mapped onto a transition of
`RecoveryStateMachine` (`Idle -> Starting -> ... -> Completed`, with `Failed`
reachable from any non-terminal state). Network/IO-bound steps (database,
broker auth, market data, instrument master) retry with exponential backoff
up to `RecoveryConfig.maxRetries`; every other step either can't transiently
fail or, for Position Reconciliation specifically, is treated as
non-fatal — a broker outage mid-reconciliation is logged and skipped rather
than failing the entire recovery run. A crashed run's `RecoveryHistoryEntry`
records exactly which steps completed, so `run({ resume: true })` skips them
on the next attempt instead of repeating work ("never restart completed
steps").

Trade rehydration reuses machinery the Trade aggregate was already built
with in Phase 5: `Trade.fromSnapshot()` reconstructs an aggregate from a
persisted `TradeSnapshot` with no re-emitted events, then
`TradingEngineService.restoreTrade()` inserts it into the Engine's map
(idempotent — restoring an already-present trade is a no-op). Non-terminal
trades are then run through `enterRecovery()`/`resumeFromRecovery()` — the
exact RECOVERY-state round trip the state machine and `TradeRecoveredEvent`
were pre-built for — and re-subscribed on Market Data. The Order Queue needs
no separate recovery logic here: `OrderQueueService.onModuleInit()` (Phase
7) already reloads every non-terminal queue item before `RecoveryModule`'s
own `onModuleInit` can run; the coordinator's queue-related steps verify
that happened and report the count, rather than reloading it a second time.

`RecoverySnapshotService` persists a `RecoverySnapshot` (every trade, every
queue item, derived idempotency keys and market subscriptions, the broker
session's client code, the last observed tick) automatically — it subscribes
to every domain event on the bus and captures a debounced snapshot
shortly after any of them fire, deliberately ignoring its own `recovery.*`
events to avoid a feedback loop — plus explicitly at the end of every
recovery run.

Like every network-touching service in this codebase, the whole flow is
gated behind a feature flag — `STARTUP_RECOVERY_ENABLED`, default disabled —
so `npm start`/e2e boots never make a real broker/network call merely
because the process started. Once an operator enables it,
`RecoveryBootstrapService.onModuleInit()` runs the full flow automatically
on every restart — no manual `POST /recovery/start` call is ever required —
and, since Nest awaits every module's `onModuleInit` before `main.ts`
reaches `app.listen()`, this is guaranteed to finish before anything could
call `MarketDataService.start()` and start delivering ticks to the Engine.

### Position reconciliation flow

`PositionReconciliationService.reconcile()` asks `LocalPositionProvider` for
every non-terminal trade, asks `BrokerPositionProvider` to look up each
one's entry/exit order status via `IOrderExecutor.getOrderStatus()` (the
only broker-position capability the executor contract actually exposes —
there is no broker-wide "list positions" endpoint, so a report is built
per-trade from the specific order ids that trade already recorded), and runs
`MismatchDetector` across all 14 fields the frozen architecture calls for.
Fields the broker's order-status response cannot report at all (symbol,
exchange, token, side, quantity, SL, targets, trailing SL) are marked
`NO_DIFFERENCE` with an explicit "not broker-verifiable" note rather than
silently skipped. One trade's broker lookup failing never aborts
reconciliation for the others.

Mismatches are leveled `NO_DIFFERENCE < INFO < WARNING < ERROR < CRITICAL`.
Exactly one mismatch shape is ever auto-repaired: the broker already
confirmed an entry fill (`FILLED`/`PARTIALLY_FILLED`) that the local trade,
still `ENTRY_PENDING`, never recorded — the "crash after broker response"
scenario. `AutoRepairService` replays that broker response through
`TradingEngineService.applyRecoveredOrderResponse()`, which is a thin
passthrough to the exact same `Trade.applyEntryOrderResponse()` command the
live tick path uses — never a new order placement. Anything CRITICAL, or
any mismatch outside that one safe shape, goes to `ManualReviewService`
instead, which only publishes `ManualReviewRequiredEvent` and flags the
report — it never mutates trade or order state. `RecoveryScheduler` re-runs
reconciliation on a configurable interval once the boot recovery run has
succeeded, so drift is caught continuously, not just at startup.

## Trade Lifecycle Engine

Phase 10 extends the Trading Engine (Phase 5) rather than replacing it. The
`Trade` aggregate and its state machine remain the single source of truth for
what a trade is and how it behaves; `TradeLifecycleModule`
(`src/modules/trade-lifecycle/`) is a layer of orchestration and reporting on
top of it — new services, a richer read model, and new REST APIs, with zero
changes to Phase 5's existing behavior.

### Why extend instead of rebuild

The spec's granular state list (`CREATED -> VALIDATED -> QUEUED ->
ORDER_PLACED -> ... -> TARGET1_HIT -> ... -> COMPLETED`) describes the same
lifecycle Trade's own state machine and Order Queue's `QueueItemState`
already implement together, just at finer granularity. Building it as a
second, independent state machine would create two competing definitions of
"what state is this trade in" — precisely what Phases 6-9 already depend on
not happening. Instead, `TradeLifecycleStage` (in
`domain/trade-lifecycle-mapper.ts`) is a pure, read-only projection computed
from the existing `TradeSnapshot` (state + order-lifecycle sub-state) plus
one new field this module owns (`exitReason`) — it can never drift from the
real state machine because it has no state of its own to drift.

### The composed "Trade Aggregate" read model

Every field the spec's Trade Aggregate lists (`SignalId`, `BrokerPositionId`,
`BrokerMetadata`, `RiskReward`, `ExitReason`, `TrailingConfiguration`, etc.)
that Phase 5's `Trade` has no field for lives in a small, separately
persisted `TradeExtension` (Mongo, `tradeExtensions`) keyed by `tradeId` —
never merged into `Trade` itself. `composeTradeRecord()` joins a
`TradeSnapshot` with its `TradeExtension` (plus a live PnL figure and the
derived lifecycle stage) into one `TradeRecord` on every read — the unified
view the REST APIs return. `signalId` is read straight from `Trade`'s own
existing `metadata` field, needing no extension storage at all.

### PositionManager, PnLService

`PnLService` tracks only the last observed price per instrument (Market
Data, Phase 6, never persists a price history — there is nothing more to
track) and computes every PnL figure — live, booked, MTM, points,
percentage — fresh from a `TradeSnapshot` plus that price, reusing the exact
same `calculateUnrealizedPnl`/`calculateBookedPnl` formulas `Trade` itself
uses (extracted into `trading-engine/domain/pnl.util.ts` so there is exactly
one implementation of each formula). `PositionManager` is the "Active Trade
Repository": a `TradeRecord` cache invalidated (not incrementally patched)
whenever any event names a `tradeId`, so a read always recomputes from the
authoritative source on the next access rather than risking staleness.

### StopLossManager, TrailingManager — configurable trailing

Trade's own per-target trailing rule (Phase 5, `advancePrice()`) still
always applies to every trade, unconditionally — nothing here changes that.
`TrailingManager` is a fully opt-in second layer: for a trade whose
`TradeExtension.trailingEnabled` is `true`, it evaluates a configured
strategy (`FIXED_POINTS`, `PERCENTAGE`, `STEP`, `BREAK_EVEN` — `ATR` is
architecture-only, see `TrailingStrategy.ATR`'s docstring: no volatility
data source exists in this system) on every tick and, if it proposes an
improvement, calls the new `Trade.moveStopLoss()` command — the one place
"never move the stop loss backward" is actually enforced, so a strategy here
can propose anything without risk. `StopLossManager` owns configuration
(enable/disable trailing, a one-call break-even convenience) and an
in-memory audit history of every stop-loss move.

### TargetManager — optional partial exit on target hit

Target *detection* stays exactly where it already was (`Trade.advancePrice()`
— never duplicated here). What's new: a trade can optionally carry a
`targetExitQuantities` plan on its extension; when configured,
`TargetManager` reacts to the existing `TargetHitEvent` by booking that
quantity through `ExitManager`. A trade with no plan configured — the
default — behaves exactly as it always has: trailing only, no partial exit.

### ExitManager — every exit, one place

Manual, force, market-close, broker-disconnect, and emergency exits are all
genuinely placed here, through two new `TradingEngineService` methods
(`requestPartialExit`/`requestFullExit`) that reuse the same executor call
and `Trade.applyExitOrderResponse()` command the tick-driven stop-loss exit
already uses — `Trade`'s existing partial-fill handling (stay ACTIVE,
awaiting the remainder) needed no changes to support a partial exit
triggered by something other than a retry. The tick-driven stop-loss exit
itself is unchanged and still executes inside `TradingEngineService`'s own
evaluation loop; `ExitManager` only *attributes* the reason by subscribing
to `StopLossHitEvent`, so the archived `TradeRecord` correctly reports
`exitReason: STOPLOSS` once it completes.

### Events

New: `PositionOpenedEvent`, `StopLossMovedEvent` (distinct from Trading
Engine's own `TrailingSLMovedEvent` — both fire for the same underlying
move; this one carries which configured strategy did it), `ExitRequestedEvent`,
`PositionClosedEvent`. Reused, never duplicated: `TradeCreatedEvent`,
`TradeValidatedEvent`/`OrderQueuedEvent` (Phase 7), `EntryTriggeredEvent`/
`EntryFilledEvent`, `TargetHitEvent`, `TrailingSLMovedEvent`,
`TradeCompletedEvent`/`TradeCancelledEvent`/`TradeRejectedEvent`/
`TradeFailedEvent`.

### REST APIs

`GET /trades`, `GET /trades/:id`, `GET /trades/active`, `GET /trades/history`,
`POST /trades/manual-exit`, `POST /trades/force-exit` (`TradesController`);
`GET /positions`, `GET /positions/active` (`PositionsController`) — both
backed by `TradeManager`, the facade wrapping `PositionManager` and
`ExitManager`. The two POST bodies are the first `class-validator` DTOs in
this codebase to actually exercise the global `ValidationPipe` that has been
configured since `main.ts`'s very first version.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
