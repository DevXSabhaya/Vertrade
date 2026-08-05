import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { BrokerId } from '../../registry/models/broker-id.enum';

export class AddBrokerAccountDto {
  @IsEnum(BrokerId)
  brokerId!: BrokerId;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  /** Broker-issued client/user id — for Dhan, the DhanHQ client id. */
  @IsString()
  @MinLength(1)
  clientId!: string;

  /** Broker-issued access token — for Dhan, the console-generated access token. Never logged or echoed back; stored encrypted. */
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
