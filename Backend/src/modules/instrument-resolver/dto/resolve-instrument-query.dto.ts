import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class ResolveInstrumentQueryDto {
  @IsString()
  @MinLength(1)
  query!: string;

  /**
   * Disambiguates when the same underlying/strike/optionType has more than
   * one live expiry (e.g. a weekly and a monthly contract at the same
   * strike) — required in that case; resolve() never silently picks one.
   * Compared against each candidate's expiry by calendar date, not exact
   * timestamp, since the frontend only ever has a date to offer the user.
   */
  @IsOptional()
  @IsISO8601()
  expiry?: string;
}
