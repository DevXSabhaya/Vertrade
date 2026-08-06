# Architecture Review — Trading Platform
**Date:** 2026-08-05
**Scope:** Full-stack review (NestJS/Mongoose backend, React/TS frontend)
**Reviewer role:** Lead Software Architect (pre-implementation study — no code changed)

---

## 0. Executive Summary

This is a **substantially more disciplined codebase than the typical early-stage trading platform**. The backend consistently applies Clean Architecture / Ports & Adapters: three parallel broker-abstraction interfaces (`IOrderExecutor`, `IMarketDataProvider`, `IInstrumentMasterProvider`) each with Mock/Paper and Dhan implementations, a framework-free domain aggregate (`Trade`) with an explicit state machine, pure-function decision logic decoupled from I/O (risk evaluation, validation rules, health aggregation), a genuine event-driven backbone connecting ~15 modules with zero observed circular imports, and unusually strong time-based testability (`IClock`/`ITimerScheduler` injected everywhere with fake implementations).

It is **not yet production-grade for real money at scale**. The most serious gaps are not architectural style violations — they're operational: no DB transactions around money-affecting multi-collection writes (settlement can silently half-complete), no session revocation (a password reset doesn't invalidate existing tokens), no RBAC (any authenticated user can flip LIVE trading or the kill switch), a duplicate-collection-name bug between two `recoveryHistory` schemas, and unbounded list endpoints that will degrade as data grows. None of these require an architecture rewrite — they're targeted, well-scoped fixes inside an already-sound structure.

**Bottom line:** the foundation is good enough to build on. The roadmap below is about closing operational/production-readiness gaps and adding the still-missing product surface (bots, scanner, alerts, analytics, dynamic trailing SL is partially there), not about re-architecting.

---

## 1. Folder Structure Review

```
Backend/src/
  bootstrap/        — process entrypoint helpers (encryption key bootstrap)
  common/           — exception hierarchy, global filter
  core/             — config, correlation, event-bus, feature-flags, logger (framework-adjacent infra)
  modules/          — ~30 feature modules, one per bounded context
  shared/           — clock, scheduler abstractions, value-objects, dto, enums, types, events, security, http
Frontend/src/
  app/              — routing/providers
  components/       — trading/, ui/ (design system), navigation/, marketing/, seo/
  features/trading/ — trading-specific composed components
  hooks/, services/, store/, lib/, pages/{app,auth,public}/
```

**Assessment:** The `core/ vs modules/ vs shared/` split is a legitimate and consistently-followed convention (core = platform infrastructure, modules = bounded contexts, shared = cross-cutting pure utilities/events). Every module reviewed follows the same internal shape (`*.service.ts`, `repository/`, `domain/` or `models/`, `schema/`, `*.module.ts`, `testing/` fakes). This consistency is itself a strength — a new engineer can predict where to find things in any of the 30 modules.

Minor issues:
- `modules/settings` and `modules/app-config` are both quasi-core (platform configuration) but live under `modules/` rather than `core/` — mild inconsistency, not a real problem.
- Frontend `store/` contains only `auth-context.tsx` — the name implies a Redux/Zustand-style store; a reader will be misled. Cosmetic.

---

## 2. Module Review

30 backend modules, each single-purpose. Standout separations of concern:
- `trading-engine` (pure orchestration of the `Trade` domain aggregate) vs `trade-lifecycle` (read-model composition + REST surface) vs `trade-validation` (pre-trade gate) vs `order-queue` (the only entry point into the engine) — four distinct responsibilities that a less disciplined codebase would collapse into one "trades" module.
- `paper-account` (ledger only) vs `paper-trading` (product-API orchestration + per-user ownership) — correctly split so the ledger has zero knowledge of ownership/API concerns.
- `broker-health` (liveness/reconnect) vs `recovery` (startup/crash Saga) vs `position-reconciliation` (state-mismatch repair) — three different "recovery" concepts, each well-scoped internally but **overlapping in name**, which will confuse newcomers and cross-team discussion. Recommend a short glossary note, not a rename.

**Repeated idioms** (found identically in 3+ modules — a sign of deliberate convention, not accident):
- "Pure decision function fed by a thin gathering service" (`Trade` aggregate, `evaluateTradeRisk()`, `TradeValidationService`+rules, `HealthAggregationPolicy`, `MismatchDetector`).
- "Registry of interface-typed strategies" via NestJS multi-provider tokens (`RuleRegistry`, `HEALTH_INDICATORS`, `SCHEDULED_JOBS`).
- "Prepare/commit/abort atomic switch" for PAPER↔LIVE transitions (`TradingModeService`, `MarketDataService`, `InstrumentMasterService`) — genuinely reusable protocol, applied identically three times.
- Repository-interface + Mongoose-adapter separation — universal; no schema type observed leaking past a repository class.

---

## 3. Dependency Review

**No circular module imports found** across any module examined. Layering is deliberately DAG-shaped and self-documented in module docstrings (e.g. `risk-management` explicitly states it sits "below" `trade-validation`/`scheduler`/`recovery` and never imports them back; `market-data`/`instrument-master` explicitly never import `trading-mode` back, exposing `prepareX/commitX/abortX` methods instead so `TradingModeService` can call *into* them).

**One confirmed DIP violation**, narrow and deliberate: `TradingEngineService` (`modules/trading-engine/trading-engine.service.ts:6-9,45-46`) injects `PaperExecutor` and `DhanExecutor` as **concrete classes**, not via the `ORDER_EXECUTOR` interface token used everywhere else. This is done intentionally to pin a trade's executor once at creation time (so an in-flight trade can never straddle a mid-trade PAPER/LIVE mode flip) — the call site still only ever *invokes* through the `IOrderExecutor` type. It's real, but it's the **only** such violation found in the entire broker-abstraction surface; every other consumer (`position-reconciliation`'s `BrokerPositionProvider`, `order-queue`) depends on the interface token correctly. Recommend documenting this exception in one central ADR instead of two duplicated docstrings.

**High fan-in hotspot:** `RecoveryCoordinator` has 19 constructor-injected dependencies (trading-engine, order-queue, market-data, instrument-master, position-reconciliation, 4 risk-management services, broker-auth, settings, feature-flags, 2 repositories, clock, timer-scheduler, config, Mongoose connection). Not a God class in logic terms (each step is a clean, named, retried `RecoveryStep`), but it is the single file most likely to require a change whenever another module's public API changes. Worth flagging as a future refactor candidate (split into per-domain recovery step objects) if the module count keeps growing.

**Minor duplication:** the "evict terminal entries older than maxAgeMs" pruning pattern is independently implemented three times (`TradingEngineService.pruneCompletedTrades`, `PositionManager.pruneCache`, `OrderQueueService.pruneCompletedItems`) — each author reasoned about it individually rather than sharing a `TtlCache<T>` utility. Low priority.

**Scheduling inconsistency:** `InstrumentMasterService.refresh()` carries a direct `@Cron('0 8 * * *')` decorator *and* is separately triggered by `SchedulerModule`'s `InstrumentRefreshJob` — two independent scheduling mechanisms for the same operation, whereas every other module (`MarketDataService`, `BrokerHealthService`) deliberately avoids self-triggering and lets `SchedulerService` own all periodic triggering. Self-documented as an intentional (idempotent) coexistence, but it breaks the "Scheduler is the only periodic trigger" convention followed everywhere else.

---

## 4. Event Flow Review

Genuinely event-driven: `IEventBus` interface (in-process `EventEmitter2` implementation, swappable for Redis Streams/Kafka without touching any publisher/subscriber) sits behind ~15 modules publishing fine-grained domain events (trade lifecycle, order-queue transitions, broker-auth session events, health-state transitions, risk violations/breaches, recovery steps, reconciliation mismatches, scheduler job results). Cross-module reactions happen almost entirely via subscription rather than direct method calls — e.g. `MarketDataService`/`InstrumentMasterService` react to `BrokerLoginSucceededEvent`/`BrokerLogoutCompletedEvent` without broker-auth knowing they exist.

`AuditLogSubscriber` and `ApplicationLogSubscriber` both wildcard-subscribe (`subscribeToAll`) to persist every event to Mongo and stdout respectively — a working audit backbone, but see §13/§18 for real gaps in what actually reaches it.

**Structural risk:** `EventEmitterEventBus` handlers are fire-and-forget (`void handler(payload)`) — an unhandled rejection in a subscriber does not propagate to the publisher. Every subscriber observed does self-guard with `.catch()`, but this is convention, not compiler/runtime-enforced. A future subscriber that forgets to catch will fail silently.

**Durability gap:** the event bus is in-process only, no outbox/persistence. A process crash between a domain action and its audit-subscriber write silently drops that audit entry — in tension with the audit module's "immutable audit trail" framing.

---

## 5. Database Review

27 distinct Mongoose schemas (one bug: two *different* schemas both map to collection `recoveryHistory` — see §16 Critical list). Every schema is a thin `@Prop`-only class; **zero business logic found in any schema file** — domain logic consistently lives in separate services/aggregates, repositories translate `XDocument ↔ domain model`. This is clean and consistent across all 27 schemas.

All relationships are soft string references (`userId`, `tradeId`, `queueItemId`) rather than Mongoose `ref`/`populate()` — deliberate, treats each collection as an independently-keyed aggregate. Reasonable for this domain (no complex join queries needed), but means referential integrity is entirely application-enforced.

**No Mongoose transactions anywhere in the codebase** (`grep -r "startSession|withTransaction|ClientSession"` — zero real Mongo-session hits). Single-document atomic updates (`findOneAndUpdate` with `$inc` + a guard condition) are used correctly for the margin-reservation hot path — that part is solid. But multi-collection sequences (trade settlement: mark ownership `CLOSED` then separately update account balance/PnL) are **not transactional**, and failures are caught, logged, and swallowed rather than retried — see Critical Problem #1.

**Missing indexes** on several hot paths: `passwordResetRequests` (used for per-email rate-limiting — no index on `email`/`requestedAt`), `passwordResetTokens` (no index at all), `healthSnapshots`, `schedulerHistory` (append-only, unbounded, no TTL, no index). `queueItems` has no index on `state`/`lockOwner` despite that being exactly what a stuck-lock sweep would filter on.

**No migration/seeding tooling** — schema evolution relies entirely on optional fields + upserts. Fine for purely additive changes; has no story for renames or backfills.

**Oversized-document risk:** `RecoverySnapshotDocumentSchema` stores a full point-in-time dump of every open trade + queue item as one `Mixed` document, with no equivalent safeguard to the one `InstrumentDocumentSchema` deliberately applies (one-doc-per-instrument, explicitly to avoid the 16MB limit).

---

## 6. API Review

14 controllers, all unauthenticated-by-default-deny (`JwtAuthGuard` applied per-controller/route, not globally) with a small number of deliberately public routes (`/health`, `GET /config/trading-mode`). **No API versioning at all** — no `setGlobalPrefix`/`enableVersioning`, every route is bare (`/trades`, `/risk`, `/paper/trades`...). Retrofitting versioning after real clients exist is disruptive; recommend adding a `/v1` prefix now while the surface is still small.

**No shared response envelope** — success responses are raw domain objects/arrays with no `{data, meta}` wrapper; only *error* responses go through a consistent shape via `GlobalExceptionFilter`. List endpoints have no `total`/`hasMore` metadata anywhere.

**Pagination is inconsistent**: one endpoint (`/paper/trades/history`) uses a properly `class-validator`-bounded DTO; `/trades/history` and `/risk/events`/`/violations` use raw unvalidated `@Query()` strings with no upper bound; `/positions`, `/trades`, `/paper/orders`, `/reconciliation/history`, `/recovery/history` have **no pagination at all** — full-collection responses that will degrade under growth.

**N+1 queries**: `/paper/trades/active` and `/paper/trades/history` loop over ownership rows and call `TradeExtensionStore.get(tradeId)` individually per trade, even though a batched `getMany()` already exists and is used elsewhere in the same codebase for positions.

---

## 7. Frontend Review

React + TanStack Query for all server state (sensible retry policy: never retries 4xx, caps 5xx retries at 2) + a single Auth Context for session state — no Redux/Zustand, and this restraint is appropriate for the app's actual complexity. Single `apiFetch<T>()` chokepoint for all HTTP, normalizing backend error shape into a typed `ApiError`; single socket.io connection with explicit, commented reconnection policy; realtime price stream uses `useSyncExternalStore` against the socket (the architecturally correct primitive, not `useState`+effects).

Component architecture is generally thin/composable (`TradeCard`, `TargetProgress`, `TrailingStopStatus` all under 100 lines); `PriceChart.tsx` is a deliberate dependency-free hand-rolled SVG chart, well-composed as a pure presentational component with 4 explicitly modeled states (no-instrument / waiting-for-first-tick / stale / connected). `NewTrade.tsx` at 481 lines is the one outsized component — combines form state, instrument resolution, R:R calculation, and live-trade confirmation gating; a reasonable extraction candidate (`useNewTradeForm` hook) but not urgent.

**Real gap:** frontend types are hand-mirrored against backend DTOs by comment convention (`types/api.ts` explicitly documents it mirrors `global-exception.filter.ts`), not shared via codegen or a shared package, and there's no runtime schema validation (`apiFetch` casts `payload as T` with no check). A backend DTO change won't fail the frontend build — it'll surface as a runtime `undefined` in the UI. This is the single most notable type-safety gap in an otherwise strongly-typed codebase.

---

## 8. State Management Review

Covered in §7 — clean split of server-state (React Query) vs UI/session-state (one Context) vs push-realtime-state (`useSyncExternalStore`), no prop drilling observed, no over-scoped global store. This is a well-judged, appropriately minimal choice for the app's actual needs — no changes recommended here.

---

## 9. Broker Layer Review

The strongest part of the codebase. Three parallel interfaces — `IOrderExecutor`, `IMarketDataProvider`, `IInstrumentMasterProvider` — each with exactly one Mock/Paper implementation and one Dhan implementation, each swappable via the identical prepare/commit/abort protocol, each with Dhan-specific types fully contained inside their own subfolder (no leakage observed anywhere else in the codebase).

`IOrderExecutor` additionally ships a **shared contract test suite** run against both `PaperExecutor` and `DhanExecutor` to operationally enforce Liskov substitutability — this is genuinely rare engineering discipline and should be the template for any new interface added later (scanner data feed, alert channel, additional broker).

Adding a new broker (per the codebase's own design intent): implement the three interfaces, run the executor through the existing contract suite, register in the relevant `*.module.ts` DI wiring. No business-logic module needs to change — this claim is verified true by the research, not just asserted by comments.

The one DIP exception (`TradingEngineService` importing `PaperExecutor`/`DhanExecutor` concretely) is documented in §3 — deliberate, narrow, doesn't undermine the overall claim.

---

## 10. Trading Engine Review

`Trade` (`modules/trading-engine/domain/trade.aggregate.ts`) is a textbook DDD aggregate: plain class, zero framework decorators, private fields, mutation only via named command methods (`arm`, `triggerEntry`, `applyEntryOrderResponse`, `advancePrice`, `moveStopLoss`, `beginExitAttempt`, `enterRecovery`/`resumeFromRecovery`), each queuing its own domain events via `pullDomainEvents()`. `TradingEngineService` is a thin shell around an in-memory `Map<string, Trade>` — no persistence, no HTTP, exactly as its own docstring states.

Supporting pure-domain helpers (`TradeStateTransitions`, `OrderLifecycleTransitions`, `PriceCrossing`, `pnl.util`) are all independently unit-tested pure functions. `order-queue` is confirmed as the **sole entry point** — `Trade -> Validation -> Queue -> Lock -> Executor -> Success/Retry/Failed`, nothing skips it, with careful idempotency-key locking exploiting Node's single-threaded event loop.

Error handling is solid: executor failures are caught and routed into domain transitions (`markEntryOrderFailed`/`markExitAttemptFailed`) rather than left to throw uncaught.

---

## 11. Market Data Review

`MarketDataService` owns Mock↔Dhan provider switching independently of (but coordinated with) `TradingModeService`'s overall mode. Both providers are always-constructed singletons; only one is ever `connect()`-ed; ticks/heartbeats from the inactive provider are explicitly filtered by a `sourceType === activeProviderType` guard — a subtle mid-teardown race condition correctly handled. Confirmed: `MarketDataModule` never imports `TradingEngineModule`; the trading engine only ever sees the broker-agnostic `MarketPriceUpdatedEvent` (deliberately relocated to `shared/events/` specifically to satisfy this dependency direction, per its own code comment).

No horizontal-scaling story for the realtime layer generally — see §18.

---

## 12. Instrument Master Review

`IInstrumentMasterProvider` interface mirrors the market-data pattern exactly, with an in-memory `InstrumentCache` swapped atomically plus a Mongo-backed snapshot for network-free boot. One-document-per-instrument-per-version schema design, explicitly to avoid MongoDB's 16MB document cap — good foresight that `RecoverySnapshotDocumentSchema` (§5) should borrow.

The `@Cron` + `SchedulerModule` double-triggering noted in §3 lives here.

---

## 13. Authentication Review

Hand-rolled JWT bearer auth (no Passport — a reasonable simplicity trade-off for a single credential type), bcrypt at 12 salt rounds, `JwtAuthGuard` re-checks user `status === ACTIVE` on **every** request (immediate account-disablement enforcement, at the cost of one DB read per request — no caching). Global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})` closes mass-assignment. Layered rate limiting: global 100/min IP throttle + stricter per-route throttles (login 5/min) + password-reset-specific per-email cooldown/attempt caps.

**No refresh-token or session-revocation mechanism at all** — stateless JWTs, `1d` default expiry, no logout endpoint, and explicitly acknowledged in the password-reset code's own comment that a reset does **not** invalidate previously-issued tokens. This is the single biggest authentication gap.

**No RBAC** — any authenticated user can flip PAPER↔LIVE trading mode, activate/deactivate the kill switch, or trigger emergency stop (explicitly acknowledged in `app-config.controller.ts`/`risk-management.controller.ts` comments as "no separate role system exists yet"). Fine for a single-operator deployment; a real gap the moment a second account exists.

**Positive:** environment validation at startup actively rejects weak/placeholder `JWT_SECRET`/`TOKEN_ENCRYPTION_KEY` in production (not just presence-checks); the structured logger has a built-in redaction layer applied to *every* log line as defense-in-depth beyond call-site masking discipline; broker tokens are encrypted at rest with AES-256-GCM and a carefully bootstrapped, persisted encryption key.

---

## 14. Paper Trading Review

Clean layering: `paper-account` (ledger, atomic single-document reserve/release) has zero knowledge of `paper-trading` (per-user ownership + product API) or `trading-engine`. `PaperTradingService.createTrade()` reserves margin, submits through the standard order-queue pipeline (never bypasses it, never creates a `Trade` directly), and rolls back the reservation on every rejection path — correct saga-style compensation for the happy/rejection paths.

The unhappy path — a crash *between* successful margin settlement steps — is exactly the untransacted gap flagged in §5/§16 Critical #1. This is the main risk in an otherwise well-designed module.

---

## 15. Live Trading Review

`LiveOrderSafetyGateService` gates every live entry order (bypassed only for `exitPosition`, correctly — closing a live position must never be blocked by a stale confirmation flag). `DhanExecutor` has session-expiry-aware retry (401 detection → `sessionManager.refresh()`) and exponential-backoff transient retry, plus local bookkeeping for Dhan's lack of an EXITED order-book concept. `selectOrderExecutor()` pins a trade's executor at creation time specifically so a mid-trade PAPER/LIVE flip can never cause one trade's legs to straddle both modes — a real correctness property, well engineered.

No independent broker-side reconciliation of live fills beyond `position-reconciliation`'s one auto-repairable case (crash-between-broker-fill-and-local-record) — everything else routes to manual review, a conservative and appropriate choice for a system moving real money.

---

## 16. Recovery System Review

`RecoveryCoordinator` runs a fixed, named, individually-retried sequence of `RecoveryStep`s, is resumable (skips steps already recorded in `stepsCompleted`), and never throws at the top level — always resolves to a `RecoveryHistoryEntry`, explicitly so a crashed broker/market-data connection during recovery can never crash the whole app. Position-reconciliation failure during recovery is treated as non-fatal/supplementary, appropriately.

The 19-dependency fan-in (§3) is the main structural concern — not a logic smell, but a coupling hotspot to watch as the module count grows.

**Confirmed bug** (not just a review comment): `modules/broker-health/repository/recovery-history.schema.ts` and `modules/recovery/repository/recovery-history.schema.ts` are two structurally different Mongoose models both bound to collection name `recoveryHistory`. If both are registered in the same process (need to verify at implementation time whether the broker-health one is actually still wired into a module), this is a live data-corruption risk, not a hypothetical one. See Critical #2.

---

## 17. Scheduler Review

`SchedulerService` is a clean central runner: `SCHEDULER_ENABLED_FLAG`-gated, uses injected `ITimerScheduler` (fully fake-clock testable), an `inFlightJobs` guard prevents overlapping runs of the same job (specifically reasoned about for `INSTRUMENT_REFRESH`'s cache-swap race), and every job failure is caught so one bad job can never crash the scheduler or block the next tick. `JobRegistry` reuses the same Strategy/multi-provider-token pattern as `RuleRegistry` and `HEALTH_INDICATORS` — consistent architecture. The one blemish is the `@Cron` decorator duplication noted in §3/§12.

---

## 18. Logging Review

`core/logger/LoggerService` emits structured JSON (`{timestamp, level, message, context, trace}`) via raw `process.stdout/stderr.write` (bypasses Nest's console formatter — correct choice for log-aggregator ingestion), with a **regex-based redaction layer applied to every log line** (`password|token|secret|otp|apikey|authorization|totp` key-value pairs, `Bearer <token>` strings, JWT-shaped strings) as a systemic last-resort net beyond call-site masking (`maskEmail`, `maskSecret`). This is genuinely strong, uncommon practice.

Correlation IDs propagate end-to-end: middleware → `AsyncLocalStorage`-backed store → `BaseException` constructor (tags the exception with whatever correlation context was active at throw time) → logs → audit entries. `ApplicationLogSubscriber` duplicates `AuditLogSubscriber`'s wildcard event subscription for a separate stdout-oriented stream — deliberate separation of "queryable audit trail" vs "grep-able live logs," acceptable double-handling overhead.

---

## 19. Error Handling Review

Single, consistently-enforced exception hierarchy: `BaseException` (abstract) → `BusinessException`(422) / `InfrastructureException`(500) / `ValidationException`(400) / `BrokerException`(502), auto-capturing `timestamp`/`correlationId`/`metadata`. Every domain exception across every module extends one of these — verified, not just claimed. `GlobalExceptionFilter` is the sole `@Catch()` filter, normalizes every response to `{statusCode, timestamp, path, message, code?, correlationId?}`, and deliberately never leaks a raw error message or stack trace to the client for unexpected errors.

**One real inconsistency:** framework-thrown exceptions (`UnauthorizedException` from `JwtAuthGuard`, `BadRequestException` from `ValidationPipe`) bypass `BaseException` entirely and therefore never carry `code`/`correlationId` in the response body, even though the `X-Correlation-Id` *header* is always present. Minor but worth a 30-minute fix (wrap or catch these at the guard/pipe level, or extend the filter to synthesize a correlation ID for non-`BaseException` errors).

---

## 20. Testing Review

**Backend:** 166 spec files across 677 non-spec source files, with strong depth in the areas that matter most — `trade-validation` and `trade-lifecycle` have the highest spec-to-file ratios in the codebase, `recovery` has dedicated fake-clock/fake-repository test infrastructure enabling deterministic tests, and `trading-mode-switch-cycle.e2e-spec.ts` is a genuinely rigorous e2e suite: 12 real alternating PAPER↔LIVE switches with cross-service consistency assertions, a cache-re-sourcing check, and two real concurrency/race-condition tests (8 concurrent identical mode-switches asserting zero duplicate broker logins; rapid alternating concurrent switches asserting no split-brain state). 13 other e2e specs cover CORS, rate limiting, auth hardening, password reset, realtime, and the core trade pipeline.

**Real gap:** `routing-order-executor.ts` and `select-order-executor.util.ts` — the functions deciding whether an order routes to the live Dhan executor or the paper executor, arguably the single most safety-critical branch point in the system — have no dedicated unit spec (only indirect e2e coverage). `paper-account` (money ledger) has just 1 spec file for 15 source files.

**Frontend:** 15 test files. Quality is high where it exists (`PriceChart.test.tsx` uses fake timers to test real 15s/10s timeout state machines, not shallow snapshots; `NewTrade.test.tsx` mocks real service boundaries and drives full user flows). Breadth is the gap: 4 of 9 authenticated app pages (`Dashboard`, `Positions`, `Orders`, `Watchlist`) have zero tests, no hook has a dedicated test file (all covered only transitively), and the entire `components/ui/` design-system layer is untested directly.

---

# Scorecard

| Category | Score | Rationale |
|---|---|---|
| Architecture | 9/10 | Clean Architecture genuinely followed, not just claimed; verified zero circular deps, one narrow documented DIP exception |
| Scalability | 6/10 | Single-instance assumptions throughout (in-memory WS subscription map, no Redis adapter, settings cache has no cross-instance invalidation); unbounded list endpoints |
| Performance | 7/10 | Atomic single-doc money ops are efficient; N+1 queries on paper-trade list endpoints; several missing indexes on hot paths |
| Security | 6/10 | Strong secret handling, redaction, encryption at rest, rate limiting — undercut by no session revocation and no RBAC |
| Code Quality | 9/10 | Deliberate, repeated, well-documented idioms across 30 modules; deep domain/framework separation |
| Maintainability | 8/10 | High consistency aids onboarding; RecoveryCoordinator fan-in and triple-duplicated pruning logic are the main friction points |
| Testing | 7/10 | Excellent depth on core state-machine and concurrency behavior; real breadth gaps on the live/paper routing decision and paper-account ledger |
| Production Readiness | 5/10 | Untransacted money-affecting writes and the recoveryHistory collection collision are real production risk, not style issues |

**Overall: 7.1/10 — a well-architected pre-production system with a short, well-defined list of hardening work before it should handle real capital at any scale.**

---

# Problem List

## Critical
1. **Untransacted multi-collection money writes.** Trade settlement (`PaperTradeEventListener.onTradeCompleted` and siblings for cancelled/rejected/failed) updates `paperTradeOwnerships` status and `paperAccounts` balance as two separate writes with no Mongoose session; failure of the second write is logged and swallowed, not retried. A crash between them leaves a trade permanently marked closed with the account balance never settled. No compensating job exists to detect/repair this. — `Backend/src/modules/paper-trading/paper-trade-event-listener.service.ts`
2. **`recoveryHistory` collection name collision.** Two structurally incompatible Mongoose schemas (`modules/broker-health/repository/recovery-history.schema.ts` and `modules/recovery/repository/recovery-history.schema.ts`) both target collection `recoveryHistory`. If both are registered, documents from one will be misread by the other's model.
3. **No session/token revocation.** Stateless JWTs with no refresh mechanism, no logout endpoint, and password reset does not invalidate prior tokens — a compromised token or a "reset my password because I was compromised" scenario leaves the attacker's session valid for up to 24h (default `JWT_EXPIRES_IN`).

## High
4. **No RBAC.** Any authenticated user can switch PAPER↔LIVE, disconnect the broker, or trigger/reset the kill switch and emergency stop.
5. **Unbounded list endpoints.** `/positions`, `/trades` (getAll), `/paper/orders`, `/reconciliation/history`, `/recovery/history` return entire collections with no pagination; will degrade as data grows.
6. **No DB indexes** on `passwordResetRequests` (email/requestedAt — the exact fields it rate-limits on), `passwordResetTokens`, `healthSnapshots`, `schedulerHistory`, `queueItems.state` — all unbounded, append-heavy collections.
7. **N+1 queries** on `/paper/trades/active` and `/paper/trades/history` — per-trade `TradeExtensionStore.get()` instead of the already-implemented batched `getMany()`.
8. **No unit tests for live/paper order routing** (`routing-order-executor.ts`, `select-order-executor.util.ts`) — the single most safety-critical branch in the system is only indirectly e2e-covered.
9. **Failed login attempts are not audited.** `AuthService.login()` only publishes an event on success; brute-force activity is invisible to the audit trail (though IP-throttled).
10. **No API versioning** — retrofitting later, once real clients exist, will be disruptive.

## Medium
11. **Frontend/backend type drift risk.** Types are hand-mirrored by comment convention with no codegen and no runtime response validation; a backend DTO change silently produces `undefined` in the UI rather than a build failure.
12. **`GlobalExceptionFilter` response inconsistency** — framework-thrown exceptions (`UnauthorizedException`, `ValidationPipe` errors) never carry `correlationId`/`code`, unlike `BaseException` subclasses.
13. **No horizontal-scaling story for the WebSocket gateway** — in-memory subscription map, default (non-Redis) Socket.IO adapter.
14. **`TradingEngineService` DIP exception** (concrete `PaperExecutor`/`DhanExecutor` injection) — narrow and deliberate, but undocumented outside two code comments; should be an ADR.
15. **`RecoveryCoordinator` 19-dependency fan-in** — coupling hotspot, no immediate bug but a growing maintenance risk.
16. **Duplicated TTL-pruning logic** in three modules (`trading-engine`, `trade-lifecycle`, `order-queue`) — candidate for a shared utility.
17. **`InstrumentMasterService.refresh()` double-triggered** by both `@Cron` and `SchedulerModule` — inconsistent with the "scheduler is the only periodic trigger" convention followed everywhere else.
18. **No migration/seeding tooling** — fine today, will bite on the first non-additive schema change.
19. **`paper-account` module is thin on tests** (1 spec / 15 files) despite being the money ledger.
20. **Untested frontend surface**: 4/9 authenticated pages, all hooks, and the entire `ui/` design-system layer have no dedicated tests (only transitive coverage).
21. **Audit log has no payload redaction** — the entire event object is persisted as `Mixed`; nothing structurally prevents a future event from leaking a secret into `auditLogs`.
22. **WebSocket sessions aren't re-validated after connect** — a socket authenticated with a since-expired/disabled-account JWT stays connected until natural disconnect.
23. **`RealtimeGateway` re-implements CORS origin resolution** reading `process.env` directly instead of through `ConfigService`, duplicating and risking drift from `main.ts`'s logic.

## Low
24. **`shared/dto/base.dto.ts`** is dead/unused code — no DTO extends it despite stated intent.
25. **Frontend `store/` naming** implies Redux/Zustand but contains only an auth context — cosmetic confusion.
26. **`NewTrade.tsx` at 481 lines** — largest frontend file, extraction candidate (`useNewTradeForm` hook) but not urgent.
27. **Module-naming overlap** ("recovery" means three different things across `recovery`, `broker-health`, `position-reconciliation`) — needs a glossary note, not a code change.
28. **Settings cache has no cross-instance invalidation** — irrelevant at single-instance scale, latent bug for horizontal scaling.
29. **Event bus is non-durable** (in-process `EventEmitter2`, no outbox) — acceptable today, worth an ADR for when durability starts to matter (e.g. before bots/alerts are built on top of it).

---

# Implementation Roadmap

The roadmap is ordered so that **hardening precedes expansion** — every new product surface (bots, scanner, alerts, analytics) will be built on top of the event bus, trade lifecycle, and risk engine, so their production-readiness gaps should close first.

## Phase 0 — Fix data-integrity and safety-critical bugs
- **Goal:** Eliminate the two Critical bugs and the RBAC/session gaps before any new feature work.
- **Modules:** `paper-trading`, `paper-account`, `recovery`, `broker-health`, `auth`.
- **Files:** `paper-trade-event-listener.service.ts`, `broker-health/repository/recovery-history.schema.ts` (remove or rename collection), `auth.service.ts`/`jwt-auth.guard.ts` (add token-version/revocation check), a minimal role field on `User`.
- **Dependencies:** None — this is foundational.
- **Complexity:** Medium. **Risk if skipped:** High (money-accounting corruption, data collision, unauthorized live-trading actions).
- **Expected outcome:** Settlement writes are transactional or have a compensating repair job; only one `recoveryHistory` model exists; tokens can be revoked on logout/reset; a minimal `ADMIN`/`USER` role gates trading-mode and kill-switch endpoints.

## Phase 1 — API hardening
- **Goal:** Close the API-surface gaps that will be expensive to retrofit later.
- **Modules:** all controllers.
- **Files:** `main.ts` (add `enableVersioning`), every list-returning controller (add DTO-validated pagination + `{data, meta}` envelope), `global-exception.filter.ts` (consistent correlationId on all error types).
- **Dependencies:** Phase 0 (touches similar files).
- **Complexity:** Low-Medium. **Risk:** Low technically, but delay increases blast radius once a frontend/mobile client depends on the current shape.
- **Expected outcome:** `/v1` prefix live; every list endpoint paginated and bounded; consistent success/error envelopes.

## Phase 2 — Database performance pass
- **Goal:** Add missing indexes, fix the N+1 queries, add TTL/retention to unbounded append-only collections.
- **Modules:** `password-reset`, `broker-health`, `scheduler`, `order-queue`, `paper-trading`.
- **Files:** all identified schema files (§5/§16), `paper-trading.service.ts` (batch `TradeExtensionStore` lookups).
- **Dependencies:** None.
- **Complexity:** Low. **Risk:** Low.
- **Expected outcome:** Rate-limit and health-check hot paths stop scanning; list endpoints stop issuing per-row queries.

## Phase 3 — Test-coverage closure on safety-critical paths
- **Goal:** Cover the live/paper routing decision and the paper-account ledger with direct unit tests; broaden frontend coverage to the untested pages/hooks.
- **Modules:** `broker/executors`, `paper-account`, frontend `pages/app`, `hooks/`.
- **Dependencies:** None — can run in parallel with Phases 1-2.
- **Complexity:** Low-Medium. **Risk:** Low (test-only changes).
- **Expected outcome:** `routing-order-executor`/`select-order-executor.util` have direct specs; `paper-account` reaches parity with other modules' spec density; `Dashboard`/`Positions`/`Orders`/`Watchlist` and core hooks have tests.

## Phase 4 — Observability closure
- **Goal:** Close the audit gaps (failed logins, payload redaction) and the WS re-auth gap.
- **Modules:** `auth`, `audit`, `realtime`.
- **Files:** `auth.service.ts` (publish failed-login event), `audit-log.subscriber.ts` (redaction pass before persist), `realtime.gateway.ts` (periodic re-validation or max-session-age disconnect, route CORS origin through `ConfigService`).
- **Dependencies:** Phase 0 (shares `auth` files).
- **Complexity:** Low-Medium. **Risk:** Low.
- **Expected outcome:** Brute-force attempts are auditable; no secret can reach the audit collection undetected; a disabled/expired-token socket is force-disconnected within a bounded window.

## Phase 5 — Scanner (new product surface)
- **Goal:** Build a rule-based instrument scanner reusing the existing `RuleRegistry`/strategy-registry idiom already proven in `trade-validation`, `broker-health`, and `scheduler`.
- **Modules:** new `modules/scanner` — depends on `instrument-master` (universe), `market-data` (live prices), `core/event-bus` (publish `ScanMatchFoundEvent`).
- **Dependencies:** Phase 2 (needs performant instrument-master queries), Phase 0/1 done first for stability.
- **Complexity:** Medium. **Risk:** Medium (new module, but built on proven interfaces — no broker coupling needed since it only reads market data/instrument-master via existing interfaces).
- **Expected outcome:** Users can define scan criteria (technical/price-action rules) evaluated periodically via `SchedulerModule`, publishing match events consumable by alerts.

## Phase 6 — Alerts (new product surface)
- **Goal:** Subscribe to existing domain events (trade lifecycle, risk violations, scanner matches) and deliver notifications (in-app via `RealtimeGateway`, plus email via the existing `shared/email` abstraction).
- **Modules:** new `modules/alerts` — depends on `core/event-bus` (subscriber, not publisher-side coupling), `realtime`, `email`.
- **Dependencies:** Phase 5 (scanner match events), Phase 4 (WS re-auth should be solid before adding another consumer of the socket).
- **Complexity:** Medium. **Risk:** Low (purely additive, subscribes to existing events — no changes to trading-engine/broker layers required, which is exactly what the event-driven architecture was designed to enable).
- **Expected outcome:** User-configurable alert rules (price cross, target hit, SL moved, risk breach, scan match) delivered via socket + email.

## Phase 7 — Trading bots (new product surface, highest-risk addition)
- **Goal:** Allow user-defined/automated strategies to submit trades through the **existing** `order-queue` entry point — bots must never bypass validation/risk-management, exactly like every other trade source.
- **Modules:** new `modules/trading-bots` — depends on `order-queue`, `trade-validation`, `risk-management`, `scanner` (as a signal source), `instrument-resolver`.
- **Dependencies:** Phase 5 (signal source), Phase 0 (money-safety must be solid before automating trade creation), Phase 3 (routing-executor tests must exist before adding a second high-volume trade producer).
- **Complexity:** High. **Risk:** High (this is the feature most capable of causing runaway financial loss if a bot's loop misbehaves — needs its own dedicated rate limiting/circuit breaker on top of the existing risk engine, e.g. a per-bot max-orders-per-minute governor).
- **Expected outcome:** Bots create `TradeValidationRequest`s exactly like the manual/API paths, gated by the same risk engine and kill switch, with an additional bot-specific throttle.

## Phase 8 — Dynamic trailing SL enhancements
- **Goal:** The `Trade` aggregate already has N-target trailing stop-loss support (`TrailingManager`, `moveStopLoss`) — this phase is about extending trail *strategies* (ATR-based, percentage-based, custom step tables) as pluggable strategies, not building trailing SL from scratch.
- **Modules:** `trading-engine` (extend, don't replace, existing trailing logic), new `TrailingStrategy` interface following the same Strategy-registry idiom as `RuleRegistry`.
- **Dependencies:** Phase 0 (Trade aggregate stability).
- **Complexity:** Medium. **Risk:** Medium (touches the core domain aggregate — must go through the existing extensive `trade.aggregate.spec.ts` test suite before merge, and extend it).
- **Expected outcome:** Users select a trailing strategy per trade; `Trade` aggregate stays framework-free and testable.

## Phase 9 — Portfolio & analytics
- **Goal:** Read-model layer over existing `tradeHistory`/`paperAccounts`/`riskEvents` data — aggregate P&L, win rate, drawdown, exposure-over-time views.
- **Modules:** new `modules/analytics` (read-only, depends on `trade-lifecycle`'s history repository and `risk-management`'s snapshot repository — no writes, no coupling into the trading path).
- **Dependencies:** Phase 2 (needs indexes on `tradeHistory` for date-range aggregation queries), Phase 1 (pagination conventions for analytics list views).
- **Complexity:** Medium. **Risk:** Low (purely additive read layer).
- **Expected outcome:** Portfolio dashboard, historical performance analytics, exportable reports.

## Phase 10 — Multi-broker expansion (validate the abstraction under real load)
- **Goal:** Add a second real broker implementation to prove the `IOrderExecutor`/`IMarketDataProvider`/`IInstrumentMasterProvider` abstraction genuinely holds under a second real-world integration, not just Mock+Dhan.
- **Modules:** new `modules/broker/<second-broker>/`, wired through existing DI tokens and the existing contract test suite.
- **Dependencies:** Phase 0 (executor routing must be bulletproof before doubling the number of live executors), Phase 7 if bots are live (bots must be broker-agnostic too, which they will be if built correctly in Phase 7).
- **Complexity:** Medium (the interfaces already exist — this is adapter work, not architecture work). **Risk:** Medium (real external API risk, not architectural risk).
- **Expected outcome:** A second broker passes the existing `order-executor.contract.ts` suite unmodified — the strongest possible proof the abstraction works as designed.

## Phase 11 — Horizontal scaling
- **Goal:** Remove the single-instance assumptions flagged in §13/§18 (WS subscription map, settings cache invalidation) so the platform can run more than one backend instance.
- **Modules:** `realtime` (Redis Socket.IO adapter), `settings` (pub/sub cache invalidation or move to a shared cache), `scheduler` (ensure `inFlightJobs` guard becomes cluster-aware, e.g. via a distributed lock, not just in-process `Set`).
- **Dependencies:** Everything above — this is the last phase because it's only needed once load actually requires more than one instance, and premature horizontal-scaling work would slow down Phases 5-10.
- **Complexity:** High. **Risk:** Medium (infrastructure change, not business-logic change — lower risk to trading correctness, higher risk to operational complexity).
- **Expected outcome:** Platform runs behind a load balancer across N instances with no split-brain state.

---

**Waiting for approval before starting Phase 0.**
