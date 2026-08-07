import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerRegistry } from '../registry/broker-registry.service';
import type { BrokerId } from '../registry/models/broker-id.enum';
import { BrokerStatus } from '../registry/models/broker-status.enum';
import { BROKER_ACCOUNT_REPOSITORY } from './broker-account.constants';
import type { IBrokerAccountRepository } from './repository/broker-account-repository.interface';
import type {
  BrokerAccount,
  BrokerAccountCredentials,
} from './models/broker-account.model';
import { BrokerAccountNotFoundException } from './exceptions/broker-account-not-found.exception';
import { BrokerNotImplementedException } from '../registry/exceptions/broker-not-implemented.exception';
import { BrokerAccountAddedEvent } from './events/broker-account-added.event';
import { BrokerAccountActivatedEvent } from './events/broker-account-activated.event';
import { BrokerAccountDisconnectedEvent } from './events/broker-account-disconnected.event';
import { BrokerAccountRemovedEvent } from './events/broker-account-removed.event';

/**
 * Owns the per-user catalog of saved broker accounts and the rules around
 * activating one of them:
 *  - A user can save any number of broker accounts, for any registered
 *    broker (implemented or not — an unimplemented one just can never be
 *    activated).
 *  - At most one account is ever active at a time: `activate` deactivates
 *    every other account for that user first.
 *  - `disconnect` tears down only the runtime broker session
 *    (`BrokerSessionManager.logout()`) — the saved account record, and its
 *    `isActive` flag, are untouched, so reconnecting never requires
 *    re-onboarding.
 *  - `reconnect` is a no-op once already authenticated — it only actually
 *    re-authenticates when the session has expired.
 *  - `remove` is the only operation that deletes the saved record.
 *
 * Deliberately does not generalize `BrokerSessionManager` into a
 * multi-session manager: this platform runs one broker session per process
 * (see `BrokerSessionManager`'s own docstring), so "activating" an account
 * means routing that account's stored credentials through the existing
 * single-session login flow (`reconnectWithToken`, the same manual-reconnect
 * path an operator already uses) rather than introducing N concurrent
 * broker sessions.
 */
@Injectable()
export class BrokerAccountService {
  constructor(
    @Inject(BROKER_ACCOUNT_REPOSITORY)
    private readonly repository: IBrokerAccountRepository,
    private readonly brokerRegistry: BrokerRegistry,
    private readonly brokerSessionManager: BrokerSessionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async addAccount(
    userId: string,
    brokerId: BrokerId,
    displayName: string,
    credentials: BrokerAccountCredentials,
  ): Promise<BrokerAccount> {
    this.brokerRegistry.get(brokerId); // throws UnknownBrokerException if not registered

    const now = new Date();
    const account: BrokerAccount = {
      accountId: randomUUID(),
      userId,
      brokerId,
      displayName,
      isActive: false,
      createdAt: now,
      updatedAt: now,
      lastConnectedAt: null,
      lastError: null,
    };
    await this.repository.create(account, credentials);
    this.eventBus.publish(
      new BrokerAccountAddedEvent(userId, account.accountId, brokerId),
    );
    return account;
  }

  async listAccounts(userId: string): Promise<BrokerAccount[]> {
    return this.repository.findAllByUser(userId);
  }

  async getAccount(userId: string, accountId: string): Promise<BrokerAccount> {
    const account = await this.repository.findById(userId, accountId);
    if (!account) {
      throw new BrokerAccountNotFoundException(accountId);
    }
    return account;
  }

  /** Live status for a saved account — never trusted from the persisted `isActive` flag alone, since the runtime session may have since expired or been disconnected. */
  getRuntimeStatus(account: BrokerAccount): BrokerStatus {
    if (!this.brokerRegistry.isImplemented(account.brokerId)) {
      return BrokerStatus.NOT_IMPLEMENTED;
    }
    if (!account.isActive) {
      return BrokerStatus.NOT_CONNECTED;
    }
    const authState = this.brokerSessionManager.getAuthState();
    if (authState === 'AUTHENTICATED') {
      return BrokerStatus.CONNECTED;
    }
    if (authState === 'REAUTH_REQUIRED') {
      return BrokerStatus.REAUTH_REQUIRED;
    }
    return BrokerStatus.NOT_CONNECTED;
  }

  async activate(userId: string, accountId: string): Promise<BrokerAccount> {
    const account = await this.getAccount(userId, accountId);
    const metadata = this.brokerRegistry.get(account.brokerId).metadata;
    if (!metadata.isImplemented) {
      throw new BrokerNotImplementedException(metadata.displayName);
    }

    const credentials = await this.repository.getCredentials(userId, accountId);

    try {
      await this.brokerSessionManager.reconnectWithToken(
        credentials.accessToken,
        credentials.clientId,
      );
    } catch (error) {
      await this.repository.recordConnectionOutcome(
        userId,
        accountId,
        this.describeError(error),
      );
      throw error;
    }

    await this.repository.deactivateAllForUser(userId);
    const activated = await this.repository.markActive(userId, accountId);
    this.eventBus.publish(
      new BrokerAccountActivatedEvent(userId, accountId, account.brokerId),
    );
    return activated;
  }

  /** Only actually re-authenticates when the current session has expired — a healthy session is left untouched. */
  async reconnect(userId: string, accountId: string): Promise<BrokerAccount> {
    if (this.brokerSessionManager.getAuthState() === 'AUTHENTICATED') {
      return this.getAccount(userId, accountId);
    }
    return this.activate(userId, accountId);
  }

  /** Tears down only the runtime session — the saved account record (and its isActive flag) is untouched, so reconnecting never re-triggers onboarding. */
  async disconnect(userId: string, accountId: string): Promise<BrokerAccount> {
    const account = await this.getAccount(userId, accountId);
    await this.brokerSessionManager.logout();
    this.eventBus.publish(
      new BrokerAccountDisconnectedEvent(userId, accountId),
    );
    return account;
  }

  async remove(userId: string, accountId: string): Promise<void> {
    const account = await this.getAccount(userId, accountId);
    if (account.isActive) {
      await this.brokerSessionManager.logout().catch(() => undefined);
    }
    await this.repository.delete(userId, accountId);
    this.eventBus.publish(new BrokerAccountRemovedEvent(userId, accountId));
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown broker error';
  }
}
