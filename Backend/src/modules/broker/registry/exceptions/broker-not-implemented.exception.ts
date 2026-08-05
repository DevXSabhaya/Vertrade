import { BusinessException } from '@common/exceptions/business.exception';

/** Thrown by every method of the shared placeholder auth/executor for a broker that has a registry entry but no real adapter yet. */
export class BrokerNotImplementedException extends BusinessException {
  constructor(brokerDisplayName: string) {
    super(
      `${brokerDisplayName} is not yet supported — its integration is on the roadmap but no live adapter exists yet.`,
    );
  }
}
