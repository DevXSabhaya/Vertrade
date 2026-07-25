import { IsString, MinLength } from 'class-validator';

export class ResolveInstrumentQueryDto {
  @IsString()
  @MinLength(1)
  query!: string;
}
