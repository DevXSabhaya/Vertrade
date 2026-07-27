import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let writeSpy: jest.SpyInstance;
  let logger: LoggerService;

  beforeEach(() => {
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    logger = new LoggerService();
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function loggedMessage(): string {
    const line = writeSpy.mock.calls[0][0] as string;
    return (JSON.parse(line) as { message: string }).message;
  }

  it('passes through a message with no sensitive content unchanged', () => {
    logger.log('User user-123 logged in');
    expect(loggedMessage()).toBe('User user-123 logged in');
  });

  it('redacts a password field', () => {
    logger.log('Login failed for password: hunter2secret');
    expect(loggedMessage()).not.toContain('hunter2secret');
    expect(loggedMessage()).toContain('[REDACTED]');
  });

  it('redacts an OTP value', () => {
    logger.log('otp=123456 verification attempted');
    expect(loggedMessage()).not.toContain('123456');
  });

  it('redacts a broker token value', () => {
    logger.log('Refreshed session, token: abc.def-ghi_123');
    expect(loggedMessage()).not.toContain('abc.def-ghi_123');
  });

  it('redacts a Bearer authorization header value', () => {
    logger.log('Rejected request with header Bearer abcdefg12345.hijklmn');
    expect(loggedMessage()).toBe(
      'Rejected request with header Bearer [REDACTED]',
    );
  });

  it('redacts a JWT-shaped string', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    logger.log(`Issued ${jwt} to user`);
    expect(loggedMessage()).not.toContain(jwt);
    expect(loggedMessage()).toContain('[REDACTED]');
  });

  it('does not redact unrelated dotted strings like IP addresses', () => {
    logger.log('Request from 127.0.0.1 rejected');
    expect(loggedMessage()).toBe('Request from 127.0.0.1 rejected');
  });
});
