import { Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BrokerCredentials } from './value-objects/broker-credentials.vo';

@Injectable()
export class BrokerCredentialsProvider {
  constructor(private readonly configService: ConfigService) {}

  getCredentials(): BrokerCredentials {
    return new BrokerCredentials(
      this.configService.dhanClientId,
      this.configService.dhanApiKey,
      this.configService.dhanAccessToken,
    );
  }
}
