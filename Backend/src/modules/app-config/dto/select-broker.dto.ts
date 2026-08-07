import { IsString, IsNotEmpty } from 'class-validator';

export class SelectBrokerDto {
  @IsString()
  @IsNotEmpty()
  brokerAccountId!: string;
}
