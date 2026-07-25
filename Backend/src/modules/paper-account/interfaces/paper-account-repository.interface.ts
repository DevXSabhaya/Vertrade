import type { PaperAccount } from '../models/paper-account.model';

export interface IPaperAccountRepository {
  /** Idempotent: creates the account with the given defaults only if none exists yet for this user, otherwise returns the existing one untouched. */
  createIfMissing(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount>;

  findByUserId(userId: string): Promise<PaperAccount | null>;

  /** Atomic; returns `null` if the account is missing, not ACTIVE, or `availableBalance` is below `amount` — never partially applies. */
  reserveMargin(
    userId: string,
    amount: number,
    now: string,
  ): Promise<PaperAccount | null>;

  /** Atomic; moves `amount` back from reservedMargin to availableBalance and adds `realizedPnlDelta` to both availableBalance and the running realizedPnl total. */
  releaseMargin(
    userId: string,
    amount: number,
    realizedPnlDelta: number,
    now: string,
  ): Promise<PaperAccount | null>;

  /** Atomic; resets availableBalance to `initialBalance`, and zeroes reservedMargin/realizedPnl. Balance-only — never touches trade/order history. */
  resetBalance(
    userId: string,
    initialBalance: number,
    now: string,
  ): Promise<PaperAccount | null>;
}
