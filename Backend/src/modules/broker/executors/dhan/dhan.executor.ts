import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  BrokerHttpRequest,
  IBrokerHttpClient,
} from '@modules/broker/broker-auth/interfaces/broker-http-client.interface';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BROKER_ACCOUNT_REPOSITORY } from '@modules/broker/broker-account/broker-account.constants';
import type { IBrokerAccountRepository } from '@modules/broker/broker-account/repository/broker-account-repository.interface';
import { ConfigService } from '@core/config/config.service';
import type { IOrderExecutor } from '../order-executor.interface';
import { LiveOrderSafetyGateService } from '../live-order-safety-gate.service';
import { OrderRequest } from '../models/order-request.model';
import { OrderModification } from '../models/order-modification.model';
import { ExitRequest } from '../models/exit-request.model';
import { OrderResponse } from '../models/order-response.model';
import { OrderSide } from '../models/order-side.enum';
import { OrderPriceType } from '../models/order-price-type.enum';
import { OrderStatus } from '../models/order-status.enum';
import { OrderPlacementException } from '../exceptions/order-placement.exception';
import { OrderModificationException } from '../exceptions/order-modification.exception';
import { OrderCancellationException } from '../exceptions/order-cancellation.exception';
import { OrderNotFoundException } from '../exceptions/order-not-found.exception';
import { BrokerOrderApiException } from '../exceptions/broker-order-api.exception';
import { ORDER_HTTP_CLIENT } from './dhan-executor.constants';
import { DHAN_ORDERS_PATH } from './dhan-order.constants';
import {
  buildModifyOrderRequestBody,
  buildPlaceOrderRequestBody,
  mapOrderBookEntryToResponse,
} from './dhan-order.mapper';
import type { DhanOrderBookEntry } from './dhan-order-raw.dto';
import {
  isDhanOrderBookResponseBody,
  isDhanOrderMutationResponseBody,
} from './dhan-order-raw.dto';

/**
 * Production-shaped DhanHQ v2 order executor. Endpoint paths and
 * request/response field names follow DhanHQ's publicly documented order
 * contract (https://dhanhq.co/docs/v2/orders/) — not exercised against the
 * real API in this environment (no real broker calls in automated tests, no
 * live credentials). Verify against a real/sandbox account before enabling
 * Live trading, same caveat as the broker-auth and instrument-master Dhan
 * adapters.
 *
 * Every public method requires the caller's `accountId` — the specific
 * `BrokerAccount` whose own session (`BrokerSessionManager`) and own
 * credentials (client ID, for the Dhan order body) this order routes
 * through. There is deliberately no env-configured fallback identity here:
 * a `null` accountId is a programmer error (this executor is only ever
 * reached for a trade already pinned to a real, owned account) and throws
 * immediately rather than silently using some other identity.
 */
@Injectable()
export class DhanExecutor implements IOrderExecutor {
  /**
   * Dhan's order book has no concept of our domain-level EXITED status — an
   * exited entry order still just reports as "TRADED". This set is the
   * minimal local bookkeeping needed to layer that domain concept on top of
   * the broker's own order book, which remains the source of truth for
   * everything else (quantity, price, symbol details for modify/cancel).
   */
  private readonly exitedOrderIds = new Set<string>();

  constructor(
    @Inject(BROKER_ACCOUNT_REPOSITORY)
    private readonly brokerAccountRepository: IBrokerAccountRepository,
    private readonly sessionManager: BrokerSessionManager,
    private readonly liveOrderSafetyGate: LiveOrderSafetyGateService,
    private readonly configService: ConfigService,
    @Inject(ORDER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async placeEntryOrder(
    request: OrderRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    const resolvedAccountId = this.requireAccountId(accountId);

    // The last gate before a real broker call for a genuine new entry — see
    // LiveOrderSafetyGateService's docstring. `exitPosition` deliberately
    // calls `submitOrder` directly, bypassing this gate entirely: a
    // risk-reducing action (closing an already-open live position) must
    // never be blocked by a missing per-order confirmation flag or a stale
    // health snapshot — that would turn a safety mechanism into a hazard.
    const confirmed = request.metadata?.liveTradingConfirmed === true;
    const gateResult = await this.liveOrderSafetyGate.checkEntryAllowed(
      confirmed,
      resolvedAccountId,
    );
    if (!gateResult.allowed) {
      throw new OrderPlacementException(
        `Live order blocked by safety gate: ${gateResult.reason}`,
      );
    }

    return this.submitOrder(request, resolvedAccountId);
  }

  private async submitOrder(
    request: OrderRequest,
    accountId: string,
  ): Promise<OrderResponse> {
    const credentials =
      await this.brokerAccountRepository.getCredentialsByAccountId(accountId);
    const body = buildPlaceOrderRequestBody(
      request,
      credentials.clientId,
      randomUUID(),
    );
    const responseBody = await this.request(
      DHAN_ORDERS_PATH,
      body,
      isDhanOrderMutationResponseBody,
      'POST',
      accountId,
    );

    if (responseBody.orderStatus === 'REJECTED') {
      throw new OrderPlacementException(
        `Dhan rejected the order placement (orderId=${responseBody.orderId})`,
      );
    }

    return this.getOrderStatus(responseBody.orderId, accountId);
  }

  async modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
    accountId: string | null,
  ): Promise<OrderResponse> {
    const resolvedAccountId = this.requireAccountId(accountId);
    const entry = await this.findOrderBookEntry(
      brokerOrderId,
      resolvedAccountId,
    );
    const credentials =
      await this.brokerAccountRepository.getCredentialsByAccountId(
        resolvedAccountId,
      );
    const body = buildModifyOrderRequestBody(
      entry,
      changes,
      credentials.clientId,
    );

    await this.request(
      `${DHAN_ORDERS_PATH}/${brokerOrderId}`,
      body,
      isDhanOrderMutationResponseBody,
      'PUT',
      resolvedAccountId,
    ).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown transport error';
      throw new OrderModificationException(
        `Failed to modify order ${brokerOrderId}: ${message}`,
      );
    });

    return this.getOrderStatus(brokerOrderId, resolvedAccountId);
  }

  async cancelOrder(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    const resolvedAccountId = this.requireAccountId(accountId);

    // Check current status first: an unknown id fails with OrderNotFoundException,
    // and an already-terminal order (filled/cancelled/rejected/exited) is
    // rejected locally rather than relying on Dhan's cancel endpoint to
    // enforce that business rule consistently.
    const currentStatus = await this.getOrderStatus(
      brokerOrderId,
      resolvedAccountId,
    );
    if (
      currentStatus.status !== OrderStatus.OPEN &&
      currentStatus.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new OrderCancellationException(
        `Order ${brokerOrderId} cannot be cancelled: it is already ${currentStatus.status}`,
      );
    }

    await this.request(
      `${DHAN_ORDERS_PATH}/${brokerOrderId}`,
      undefined,
      isDhanOrderMutationResponseBody,
      'DELETE',
      resolvedAccountId,
    ).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown transport error';
      throw new OrderCancellationException(
        `Failed to cancel order ${brokerOrderId}: ${message}`,
      );
    });

    return this.getOrderStatus(brokerOrderId, resolvedAccountId);
  }

  async exitPosition(
    brokerOrderId: string,
    exitRequest: ExitRequest,
    accountId: string | null,
  ): Promise<OrderResponse> {
    const resolvedAccountId = this.requireAccountId(accountId);
    const entry = await this.findOrderBookEntry(
      brokerOrderId,
      resolvedAccountId,
    );
    const filledQuantity = entry.filledQty;

    if (!Number.isFinite(filledQuantity) || filledQuantity <= 0) {
      throw new OrderPlacementException(
        `Cannot exit order ${brokerOrderId}: it has no filled quantity`,
      );
    }
    if (exitRequest.quantity <= 0 || exitRequest.quantity > filledQuantity) {
      throw new OrderPlacementException(
        `Exit quantity ${exitRequest.quantity} is invalid for order ${brokerOrderId} (filled: ${filledQuantity})`,
      );
    }

    const exitOrderRequest = new OrderRequest(
      entry.exchangeSegment,
      entry.tradingSymbol,
      entry.securityId,
      // Every entry order this executor places is a BUY (long options), so
      // exiting it is always the opposite side, SELL.
      OrderSide.SELL,
      exitRequest.quantity,
      exitRequest.price !== undefined
        ? OrderPriceType.LIMIT
        : OrderPriceType.MARKET,
      exitRequest.price,
    );

    const exitResponse = await this.submitOrder(
      exitOrderRequest,
      resolvedAccountId,
    );
    this.exitedOrderIds.add(brokerOrderId);
    return exitResponse;
  }

  async getOrderStatus(
    brokerOrderId: string,
    accountId: string | null,
  ): Promise<OrderResponse> {
    const resolvedAccountId = this.requireAccountId(accountId);
    const entry = await this.findOrderBookEntry(
      brokerOrderId,
      resolvedAccountId,
    );
    const response = mapOrderBookEntryToResponse(entry);

    if (this.exitedOrderIds.has(brokerOrderId)) {
      return new OrderResponse(
        response.brokerOrderId,
        OrderStatus.EXITED,
        response.filledQuantity,
        response.averagePrice,
        response.updatedAt,
        response.message,
      );
    }

    return response;
  }

  private requireAccountId(accountId: string | null): string {
    if (!accountId) {
      throw new OrderPlacementException(
        'DhanExecutor requires a broker account id — this is a Live-only executor and must never be called without one',
      );
    }
    return accountId;
  }

  private async findOrderBookEntry(
    brokerOrderId: string,
    accountId: string,
  ): Promise<DhanOrderBookEntry> {
    const entries = await this.request(
      DHAN_ORDERS_PATH,
      undefined,
      isDhanOrderBookResponseBody,
      'GET',
      accountId,
    );

    const entry = entries.find(
      (candidate) => candidate.orderId === brokerOrderId,
    );
    if (!entry) {
      throw new OrderNotFoundException(
        `No Dhan order found with id ${brokerOrderId}`,
      );
    }
    return entry;
  }

  private async request<T>(
    path: string,
    body: unknown,
    isValidResponse: (value: unknown) => value is T,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    accountId: string,
  ): Promise<T> {
    const session = await this.sessionManager.ensureSession(accountId);
    return this.performRequest<T>(
      path,
      body,
      isValidResponse,
      method,
      session,
      accountId,
      false,
    );
  }

  private async performRequest<T>(
    path: string,
    body: unknown,
    isValidResponse: (value: unknown) => value is T,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    session: BrokerSession,
    accountId: string,
    isRetry: boolean,
  ): Promise<T> {
    const httpRequest: BrokerHttpRequest = {
      method,
      url: `${this.configService.dhanRestUrl}${path}`,
      headers: this.buildHeaders(session.token.getAccessToken()),
      body,
    };

    const response = await this.safeSend<T>(httpRequest);

    // Checked before shape validation: an expired-session error body (e.g.
    // `{errorCode, errorMessage}`) never satisfies isValidResponse (which
    // expects a real order-mutation/order-book shape), so validating first
    // would throw a misleading "unexpected shape" error instead of
    // transparently refreshing the session and retrying.
    if (!isRetry && this.isSessionExpired(response.status, response.body)) {
      const refreshedSession = await this.sessionManager.refresh(accountId);
      return this.performRequest<T>(
        path,
        body,
        isValidResponse,
        method,
        refreshedSession,
        accountId,
        true,
      );
    }

    if (!isValidResponse(response.body)) {
      throw new BrokerOrderApiException(
        `Unexpected response shape from Dhan order API at ${path}`,
      );
    }

    return response.body;
  }

  /**
   * Transient-failure retry with exponential backoff — distinct from (and
   * layered underneath) `OrderQueueService`/`QueueWorker`'s own retry of a
   * whole trade *submission* (`RetryStrategy`, order-queue module): that
   * higher-level retry only ever covers the entry-order path reached via
   * the queue, so a transient network blip during `exitPosition` (called
   * directly by `TradingEngineService`'s tick-evaluation loop, never
   * through the queue) previously had no retry at all — a real risk for a
   * live position that fails to close on a momentary connectivity blip.
   * Retries a 5xx response or a network/timeout-level throw; never retries
   * a 4xx response (a client/validation problem retrying won't fix) or the
   * response-shape validation failure below (a contract bug, not
   * transient).
   */
  private static readonly MAX_TRANSIENT_RETRIES = 2;
  private static readonly RETRY_BASE_DELAY_MS = 300;

  private async safeSend<T>(
    httpRequest: BrokerHttpRequest,
    attempt = 1,
  ): Promise<{ status: number; body: T }> {
    try {
      const response = await this.httpClient.request<T>(httpRequest);
      if (
        response.status >= 500 &&
        attempt <= DhanExecutor.MAX_TRANSIENT_RETRIES
      ) {
        await this.delayBeforeRetry(attempt);
        return this.safeSend<T>(httpRequest, attempt + 1);
      }
      return response;
    } catch (error) {
      const name = this.getErrorName(error);
      if (attempt <= DhanExecutor.MAX_TRANSIENT_RETRIES) {
        await this.delayBeforeRetry(attempt);
        return this.safeSend<T>(httpRequest, attempt + 1);
      }
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new BrokerOrderApiException(
          `Dhan order API request to ${httpRequest.url} timed out after ${DhanExecutor.MAX_TRANSIENT_RETRIES} retries`,
        );
      }
      const message =
        error instanceof Error ? error.message : 'Unknown transport error';
      throw new BrokerOrderApiException(
        `Dhan order API request failed after ${DhanExecutor.MAX_TRANSIENT_RETRIES} retries: ${message}`,
      );
    }
  }

  /** attempt is 1-indexed; delay grows exponentially (300ms, 600ms, ...) with no jitter — a bounded, small number of retries against a single broker HTTP call, not the queue-level retry's longer backoff. */
  private delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = DhanExecutor.RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private isSessionExpired(status: number, body: unknown): boolean {
    if (status === 401) {
      return true;
    }
    if (typeof body === 'object' && body !== null && 'errorMessage' in body) {
      const message = String(body.errorMessage).toLowerCase();
      return (
        message.includes('session') ||
        message.includes('token') ||
        message.includes('invalid access')
      );
    }
    return false;
  }

  private getErrorName(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'name' in error) {
      return String(error.name);
    }
    return undefined;
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'access-token': accessToken,
    };
  }
}
