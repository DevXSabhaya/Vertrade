import type { UserTradingPreference } from '../models/user-trading-preference.model';

export interface IUserTradingPreferenceRepository {
  find(userId: string): Promise<UserTradingPreference | null>;
  /** Every user currently persisted in LIVE mode with a broker selected — used to iterate independent sessions at startup/renewal, never assuming a single global one. */
  findAllLiveWithBroker(): Promise<UserTradingPreference[]>;
  upsert(
    userId: string,
    patch: {
      tradingMode: 'PAPER' | 'LIVE';
      selectedBrokerAccountId: string | null;
    },
  ): Promise<UserTradingPreference>;
}
