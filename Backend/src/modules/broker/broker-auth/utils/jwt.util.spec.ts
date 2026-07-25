import { decodeJwtExpiry } from './jwt.util';

function encodeSegment(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('decodeJwtExpiry', () => {
  it('reads the exp claim from a well-formed JWT', () => {
    const exp = 1_700_000_000;
    const token = `${encodeSegment({ alg: 'HS256' })}.${encodeSegment({ exp })}.signature`;

    const result = decodeJwtExpiry(token);

    expect(result).toEqual(new Date(exp * 1000));
  });

  it('returns null when the token does not have 3 segments', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload is not valid JSON', () => {
    const token = `${encodeSegment({})}.not-json.signature`;
    expect(decodeJwtExpiry(token)).toBeNull();
  });

  it('returns null when the payload has no exp claim', () => {
    const token = `${encodeSegment({})}.${encodeSegment({ sub: 'user' })}.signature`;
    expect(decodeJwtExpiry(token)).toBeNull();
  });
});
