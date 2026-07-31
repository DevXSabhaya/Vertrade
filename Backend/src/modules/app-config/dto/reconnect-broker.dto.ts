import { IsNotEmpty, IsString } from 'class-validator';

export class ReconnectBrokerDto {
  /** A freshly console-generated Dhan access token — the manual reconnect flow required once a token has genuinely expired (DhanHQ's individual-API account type has no automated renewal path for an already-expired token). */
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
