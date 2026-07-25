import { Inject, Injectable } from '@nestjs/common';
import type {
  BrokerHttpRequest,
  IBrokerHttpClient,
} from '@modules/broker/broker-auth/interfaces/broker-http-client.interface';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import {
  getLocalIp,
  getMacAddress,
  getPublicIp,
} from '@modules/broker/broker-auth/utils/client-network-info.util';
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
import { ORDER_HTTP_CLIENT } from './angel-one-executor.constants';
import {
  ANGEL_ONE_BASE_URL,
  ANGEL_ONE_CANCEL_ORDER_PATH,
  ANGEL_ONE_MODIFY_ORDER_PATH,
  ANGEL_ONE_ORDER_BOOK_PATH,
  ANGEL_ONE_PLACE_ORDER_PATH,
} from './angel-one-order.constants';
import {
  buildCancelOrderRequestBody,
  buildModifyOrderRequestBody,
  buildPlaceOrderRequestBody,
  mapOrderBookEntryToResponse,
} from './angel-one-order.mapper';
import type {
  AngelOneOrderBookEntry,
  AngelOneOrderBookResponseBody,
  AngelOneOrderMutationResponseBody,
} from './angel-one-order-raw.dto';
import {
  isAngelOneOrderBookResponseBody,
  isAngelOneOrderMutationResponseBody,
} from './angel-one-order-raw.dto';

/**
 * Production-shaped Angel One SmartAPI order executor. Endpoint paths and
 * request/response field names follow SmartAPI's publicly documented order
 * contract — not exercised against the real API in this environment (no real
 * broker calls in automated tests, no live credentials). Verify against a
 * real/sandbox account before enabling Live trading, same caveat as the
 * broker-auth and instrument-master Angel One adapters.
 */
@Injectable()
export class AngelOneExecutor implements IOrderExecutor {
  /**
   * Angel One's order book has no concept of our domain-level EXITED status —
   * an exited entry order still just reports as "complete". This set is the
   * minimal local bookkeeping needed to layer that domain concept on top of
   * the broker's own order book, which remains the source of truth for
   * everything else (quantity, price, symbol details for modify/cancel).
   */
  private readonly exitedOrderIds = new Set<string>();

  constructor(
    private readonly credentialsProvider: BrokerCredentialsProvider,
    private readonly sessionManager: BrokerSessionManager,
    private readonly liveOrderSafetyGate: LiveOrderSafetyGateService,
    @Inject(ORDER_HTTP_CLIENT) private readonly httpClient: IBrokerHttpClient,
  ) {}

  async placeEntryOrder(request: OrderRequest): Promise<OrderResponse> {
    // The last gate before a real broker call for a genuine new entry — see
    // LiveOrderSafetyGateService's docstring. `exitPosition` deliberately
    // calls `submitOrder` directly, bypassing this gate entirely: a
    // risk-reducing action (closing an already-open live position) must
    // never be blocked by a missing per-order confirmation flag or a stale
    // health snapshot — that would turn a safety mechanism into a hazard.
    const confirmed = request.metadata?.liveTradingConfirmed === true;
    const gateResult =
      await this.liveOrderSafetyGate.checkEntryAllowed(confirmed);
    if (!gateResult.allowed) {
      throw new OrderPlacementException(
        `Live order blocked by safety gate: ${gateResult.reason}`,
      );
    }

    return this.submitOrder(request);
  }

  private async submitOrder(request: OrderRequest): Promise<OrderResponse> {
    const body = buildPlaceOrderRequestBody(request);
    const responseBody = await this.request<AngelOneOrderMutationResponseBody>(
      ANGEL_ONE_PLACE_ORDER_PATH,
      body,
      isAngelOneOrderMutationResponseBody,
    );

    if (!responseBody.status || !responseBody.data) {
      throw new OrderPlacementException(
        responseBody.message || 'Angel One rejected the order placement',
      );
    }

    return this.getOrderStatus(responseBody.data.orderid);
  }

  async modifyOrder(
    brokerOrderId: string,
    changes: OrderModification,
  ): Promise<OrderResponse> {
    const entry = await this.findOrderBookEntry(brokerOrderId);
    const body = buildModifyOrderRequestBody(entry, changes);

    const responseBody = await this.request<AngelOneOrderMutationResponseBody>(
      ANGEL_ONE_MODIFY_ORDER_PATH,
      body,
      isAngelOneOrderMutationResponseBody,
    );

    if (!responseBody.status) {
      throw new OrderModificationException(
        responseBody.message || `Failed to modify order ${brokerOrderId}`,
      );
    }

    return this.getOrderStatus(brokerOrderId);
  }

  async cancelOrder(brokerOrderId: string): Promise<OrderResponse> {
    // Check current status first: an unknown id fails with OrderNotFoundException,
    // and an already-terminal order (filled/cancelled/rejected/exited) is
    // rejected locally rather than relying on Angel One's cancel endpoint to
    // enforce that business rule consistently.
    const currentStatus = await this.getOrderStatus(brokerOrderId);
    if (
      currentStatus.status !== OrderStatus.OPEN &&
      currentStatus.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      throw new OrderCancellationException(
        `Order ${brokerOrderId} cannot be cancelled: it is already ${currentStatus.status}`,
      );
    }

    const body = buildCancelOrderRequestBody(brokerOrderId);
    const responseBody = await this.request<AngelOneOrderMutationResponseBody>(
      ANGEL_ONE_CANCEL_ORDER_PATH,
      body,
      isAngelOneOrderMutationResponseBody,
    );

    if (!responseBody.status) {
      throw new OrderCancellationException(
        responseBody.message || `Failed to cancel order ${brokerOrderId}`,
      );
    }

    return this.getOrderStatus(brokerOrderId);
  }

  async exitPosition(
    brokerOrderId: string,
    exitRequest: ExitRequest,
  ): Promise<OrderResponse> {
    const entry = await this.findOrderBookEntry(brokerOrderId);
    const filledQuantity = Number(entry.filledshares);

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
      entry.exchange,
      entry.tradingsymbol,
      entry.symboltoken,
      // Every entry order this executor places is a BUY (long options), so
      // exiting it is always the opposite side, SELL.
      OrderSide.SELL,
      exitRequest.quantity,
      exitRequest.price !== undefined
        ? OrderPriceType.LIMIT
        : OrderPriceType.MARKET,
      exitRequest.price,
    );

    const exitResponse = await this.submitOrder(exitOrderRequest);
    this.exitedOrderIds.add(brokerOrderId);
    return exitResponse;
  }

  async getOrderStatus(brokerOrderId: string): Promise<OrderResponse> {
    const entry = await this.findOrderBookEntry(brokerOrderId);
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

  private async findOrderBookEntry(
    brokerOrderId: string,
  ): Promise<AngelOneOrderBookEntry> {
    const responseBody = await this.request<AngelOneOrderBookResponseBody>(
      ANGEL_ONE_ORDER_BOOK_PATH,
      undefined,
      isAngelOneOrderBookResponseBody,
      'GET',
    );

    if (!responseBody.status || !responseBody.data) {
      throw new BrokerOrderApiException(
        responseBody.message || 'Failed to fetch the Angel One order book',
      );
    }

    const entry = responseBody.data.find(
      (candidate) => candidate.orderid === brokerOrderId,
    );
    if (!entry) {
      throw new OrderNotFoundException(
        `No Angel One order found with id ${brokerOrderId}`,
      );
    }
    return entry;
  }

  private async request<T>(
    path: string,
    body: unknown,
    isValidResponse: (value: unknown) => value is T,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    const session = await this.sessionManager.ensureSession();
    return this.performRequest<T>(
      path,
      body,
      isValidResponse,
      method,
      session,
      false,
    );
  }

  private async performRequest<T>(
    path: string,
    body: unknown,
    isValidResponse: (value: unknown) => value is T,
    method: 'GET' | 'POST',
    session: BrokerSession,
    isRetry: boolean,
  ): Promise<T> {
    const credentials = this.credentialsProvider.getCredentials();
    const httpRequest: BrokerHttpRequest = {
      method,
      url: `${ANGEL_ONE_BASE_URL}${path}`,
      headers: this.buildHeaders(
        credentials.apiKey,
        session.token.getJwtToken(),
      ),
      body,
    };

    const response = await this.safeSend<T>(httpRequest);

    if (!isValidResponse(response.body)) {
      throw new BrokerOrderApiException(
        `Unexpected response shape from Angel One order API at ${path}`,
      );
    }

    if (!isRetry && this.isSessionExpired(response.status, response.body)) {
      const refreshedSession = await this.sessionManager.refresh();
      return this.performRequest<T>(
        path,
        body,
        isValidResponse,
        method,
        refreshedSession,
        true,
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
        attempt <= AngelOneExecutor.MAX_TRANSIENT_RETRIES
      ) {
        await this.delayBeforeRetry(attempt);
        return this.safeSend<T>(httpRequest, attempt + 1);
      }
      return response;
    } catch (error) {
      const name = this.getErrorName(error);
      if (attempt <= AngelOneExecutor.MAX_TRANSIENT_RETRIES) {
        await this.delayBeforeRetry(attempt);
        return this.safeSend<T>(httpRequest, attempt + 1);
      }
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new BrokerOrderApiException(
          `Angel One order API request to ${httpRequest.url} timed out after ${AngelOneExecutor.MAX_TRANSIENT_RETRIES} retries`,
        );
      }
      const message =
        error instanceof Error ? error.message : 'Unknown transport error';
      throw new BrokerOrderApiException(
        `Angel One order API request failed after ${AngelOneExecutor.MAX_TRANSIENT_RETRIES} retries: ${message}`,
      );
    }
  }

  /** attempt is 1-indexed; delay grows exponentially (300ms, 600ms, ...) with no jitter — a bounded, small number of retries against a single broker HTTP call, not the queue-level retry's longer backoff. */
  private delayBeforeRetry(attempt: number): Promise<void> {
    const delayMs = AngelOneExecutor.RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private isSessionExpired(status: number, body: unknown): boolean {
    if (status === 401) {
      return true;
    }
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = String(body.message).toLowerCase();
      return (
        message.includes('session') ||
        message.includes('token') ||
        message.includes('login')
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

  private buildHeaders(
    apiKey: string,
    jwtToken: string,
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-PrivateKey': apiKey,
      'X-ClientLocalIP': getLocalIp(),
      'X-ClientPublicIP': getPublicIp(),
      'X-MACAddress': getMacAddress(),
      Authorization: `Bearer ${jwtToken}`,
    };
  }
}
