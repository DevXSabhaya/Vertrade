import {
  createCorsOriginValidator,
  isLocalDevOrigin,
  parseAllowedOrigins,
} from './cors-origin.util';

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(
      parseAllowedOrigins('https://a.com, https://b.com ,https://c.com'),
    ).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('returns a single-element array for a single origin', () => {
    expect(parseAllowedOrigins('http://localhost:5173')).toEqual([
      'http://localhost:5173',
    ]);
  });

  it('drops empty entries from trailing/duplicate commas', () => {
    expect(parseAllowedOrigins('https://a.com,,  ,https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseAllowedOrigins('')).toEqual([]);
  });
});

describe('isLocalDevOrigin', () => {
  it.each([
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://localhost:5173',
    'http://127.0.0.1:5173',
    'https://127.0.0.1:8080',
  ])('accepts %s', (origin) => {
    expect(isLocalDevOrigin(origin)).toBe(true);
  });

  it.each([
    'https://vertrade.app',
    'http://example.com:5173',
    'http://localhost',
    'ftp://localhost:5173',
    'http://evil.com?localhost:5173',
  ])('rejects %s', (origin) => {
    expect(isLocalDevOrigin(origin)).toBe(false);
  });
});

describe('createCorsOriginValidator', () => {
  it('allows a request with no Origin header (non-browser callers)', () => {
    const validator = createCorsOriginValidator(
      ['https://vertrade.app'],
      false,
    );
    const callback = jest.fn();

    validator(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows an explicitly configured origin in production', () => {
    const validator = createCorsOriginValidator(
      ['https://vertrade.app'],
      false,
    );
    const callback = jest.fn();

    validator('https://vertrade.app', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects an origin that is not configured, in production', () => {
    const validator = createCorsOriginValidator(
      ['https://vertrade.app'],
      false,
    );
    const callback = jest.fn();

    validator('https://not-allowed.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('rejects a localhost origin in production even though it looks like a dev origin', () => {
    const validator = createCorsOriginValidator(
      ['https://vertrade.app'],
      false,
    );
    const callback = jest.fn();

    validator('http://localhost:5173', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('allows any localhost port in development, beyond the configured origin', () => {
    const validator = createCorsOriginValidator(
      ['http://localhost:5173'],
      true,
    );
    const callback = jest.fn();

    validator('http://localhost:5175', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows the configured origin in development too', () => {
    const validator = createCorsOriginValidator(
      ['http://localhost:5173'],
      true,
    );
    const callback = jest.fn();

    validator('http://localhost:5173', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('still rejects a non-localhost, non-configured origin in development', () => {
    const validator = createCorsOriginValidator(
      ['http://localhost:5173'],
      true,
    );
    const callback = jest.fn();

    validator('https://random-site.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('never allows a wildcard-style bypass regardless of origin value', () => {
    const validator = createCorsOriginValidator([], false);
    const callback = jest.fn();

    validator('https://anything.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });
});
