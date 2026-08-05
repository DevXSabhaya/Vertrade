import { InfrastructureException } from '@common/exceptions/infrastructure.exception';

export class MarketDataCredentialsMissingException extends InfrastructureException {
  constructor(
    message = 'No market data credentials are configured for this deployment.',
  ) {
    super(message);
  }
}
