import { ResendEmailProvider } from './resend-email.provider';
import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  __esModule: true,
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

function makeConfigService(
  overrides: Partial<Record<string, unknown>> = {},
): ConfigService {
  return {
    resendApiKey: 're_live_1234567890abcdef',
    emailFrom: 'noreply@example.com',
    emailFromName: 'Trading App',
    ...overrides,
  } as unknown as ConfigService;
}

function makeLogger(): jest.Mocked<LoggerService> {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as jest.Mocked<LoggerService>;
}

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends successfully via resend.emails.send() with a formatted From header', async () => {
    sendMock.mockResolvedValue({
      data: { id: 'msg_123' },
      error: null,
    });
    const provider = new ResendEmailProvider(makeConfigService(), makeLogger());

    await provider.send({
      to: 'user@example.com',
      subject: 'Reset your password',
      text: 'code: 123456',
      html: '<p>code: 123456</p>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Trading App <noreply@example.com>',
        to: ['user@example.com'],
        subject: 'Reset your password',
        text: 'code: 123456',
        html: '<p>code: 123456</p>',
      }),
    );
  });

  it('logs email_send_started before and email_send_success after, including messageId', async () => {
    sendMock.mockResolvedValue({
      data: { id: 'msg_abc' },
      error: null,
    });
    const logger = makeLogger();
    const provider = new ResendEmailProvider(makeConfigService(), logger);

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    const events = logger.log.mock.calls.map(
      ([message]: [string, string?]) =>
        (JSON.parse(message) as { event: string }).event,
    );
    expect(events).toEqual([
      'resend_email_provider_configured',
      'email_send_started',
      'email_send_success',
    ]);

    const [, startedMessage, succeededMessage] = logger.log.mock.calls.map(
      ([message]: [string, string?]) => message,
    );
    const started = JSON.parse(startedMessage) as Record<string, unknown>;
    expect(started.provider).toBe('RESEND');
    expect(started.recipient).toBe('u***@example.com');

    const succeeded = JSON.parse(succeededMessage) as Record<string, unknown>;
    expect(succeeded.messageId).toBe('msg_abc');
    expect(succeeded.durationMs).toEqual(expect.any(Number));
  });

  it('throws and logs email_send_failed when Resend resolves with a graceful API error (no network throw)', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Invalid `from` field',
        name: 'invalid_from_address',
        statusCode: 422,
      },
    });
    const logger = makeLogger();
    const provider = new ResendEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email: Invalid `from` field/);

    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.event).toBe('email_send_failed');
    expect(logged.provider).toBe('RESEND');
    expect(logged.errorName).toBe('invalid_from_address');
    expect(logged.statusCode).toBe(422);
    expect(loggedMessage).not.toContain('re_live_1234567890abcdef');
  });

  it('throws and logs email_send_failed on a genuine network-level rejection (e.g. timeout)', async () => {
    sendMock.mockRejectedValue(new Error('fetch failed'));
    const logger = makeLogger();
    const provider = new ResendEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email: fetch failed/);

    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.event).toBe('email_send_failed');
    expect(logged.errorMessage).toBe('fetch failed');
  });

  it('never logs the API key', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const logger = makeLogger();
    const provider = new ResendEmailProvider(
      makeConfigService({ resendApiKey: 're_super_secret_key' }),
      logger,
    );

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    const allLoggedText = logger.log.mock.calls
      .map(([message]: [string, string?]) => message)
      .join('\n');
    expect(allLoggedText).not.toContain('re_super_secret_key');
  });
});
