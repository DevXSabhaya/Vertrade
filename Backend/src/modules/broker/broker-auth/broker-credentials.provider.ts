import { Injectable } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { BrokerCredentials } from './value-objects/broker-credentials.vo';

@Injectable()
export class BrokerCredentialsProvider {
  constructor(private readonly configService: ConfigService) {}

  getCredentials(): BrokerCredentials {
    return new BrokerCredentials(
      this.configService.angelOneApiKey,
      this.configService.angelOneClientCode,
      this.configService.angelOnePassword,
      this.configService.angelOneTotpSecret,
    );
  }
}
