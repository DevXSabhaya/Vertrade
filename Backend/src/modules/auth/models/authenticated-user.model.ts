/** What `JwtAuthGuard` attaches to `request.user` — the verified identity, never trusted from request body/params. */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
}
