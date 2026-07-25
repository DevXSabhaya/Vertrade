/** The signed JWT payload — `sub` is the standard JWT subject claim, holding the userId. */
export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
}
