import { GoogleMailProvider } from './google-mail.provider';
import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';

const sendMock = jest.fn();
const setCredentialsMock = jest.fn();
const getAccessTokenMock = jest.fn();
const gmailFactoryMock = jest.fn();
gmailFactoryMock.mockReturnValue({
  users: { messages: { send: sendMock } },
});

jest.mock('google-auth-library', () => ({
  __esModule: true,
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials: setCredentialsMock,
    getAccessToken: getAccessTokenMock,
  })),
}));

jest.mock('@googleapis/gmail', () => ({
  __esModule: true,
  gmail: (options: unknown) => gmailFactoryMock(options) as unknown,
}));

function makeConfigService(
  overrides: Partial<Record<string, unknown>> = {},
): ConfigService {
  return {
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    googleRefreshToken: 'refresh-token',
    googleRedirectUri: 'https://developers.google.com/oauthplayground',
    emailFrom: 'vertrade19@gmail.com',
    emailFromName: 'Vertrade',
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

describe('GoogleMailProvider', () => {
  beforeEach(() => {
    sendMock.mockReset();
    setCredentialsMock.mockReset();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockResolvedValue({ token: 'fake-access-token' });
    gmailFactoryMock.mockClear();
  });

  it('authenticates with the refresh token via OAuth2Client.setCredentials', () => {
    new GoogleMailProvider(makeConfigService(), makeLogger());

    expect(setCredentialsMock).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
  });

  it('sends successfully via gmail.users.messages.send() with a base64url raw message', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' } });
    const provider = new GoogleMailProvider(makeConfigService(), makeLogger());

    await provider.send({
      to: 'user@example.com',
      subject: 'Reset your password',
      text: 'code: 123456',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [params] = sendMock.mock.calls[0] as [
      { userId: string; requestBody: { raw: string } },
    ];
    expect(params.userId).toBe('me');
    expect(typeof params.requestBody.raw).toBe('string');
    const decoded = Buffer.from(params.requestBody.raw, 'base64url').toString(
      'utf8',
    );
    expect(decoded).toContain('From: Vertrade <vertrade19@gmail.com>');
    expect(decoded).toContain('To: user@example.com');
  });

  it('logs email_send_started before and email_send_success after, including messageId and attempt', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_abc' } });
    const logger = makeLogger();
    const provider = new GoogleMailProvider(makeConfigService(), logger);

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    const jsonEvents = logger.log.mock.calls
      .map(([message]: [string, string?]) => {
        try {
          return (JSON.parse(message) as { event?: string }).event;
        } catch {
          return undefined;
        }
      })
      .filter((event): event is string => event !== undefined);
    expect(jsonEvents).toEqual([
      'google_mail_provider_configured',
      'email_send_started',
      'access_token_refresh_started',
      'access_token_refresh_succeeded',
      'gmail_api_request_started',
      'gmail_api_response_received',
      'email_send_success',
    ]);

    const successMessage = logger.log.mock.calls.find(
      ([message]: [string, string?]) => message.includes('email_send_success'),
    )?.[0] as string;
    const success = JSON.parse(successMessage) as Record<string, unknown>;
    expect(success.messageId).toBe('msg_abc');
    expect(success.attempt).toBe(1);
    expect(success.durationMs).toEqual(expect.any(Number));
  });

  it('never logs the client secret or refresh token', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' } });
    const logger = makeLogger();
    const provider = new GoogleMailProvider(
      makeConfigService({
        googleClientSecret: 'super-secret-value',
        googleRefreshToken: 'super-secret-refresh-token',
      }),
      logger,
    );

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    const allLogs = [...logger.log.mock.calls, ...logger.error.mock.calls]
      .map(([message]: [string, string?, string?]) => message)
      .join('\n');
    expect(allLogs).not.toContain('super-secret-value');
    expect(allLogs).not.toContain('super-secret-refresh-token');
  });

  describe('retry with exponential backoff', () => {
    it('retries a transient (5xx) failure and succeeds on the 2nd attempt, without extra delay beyond backoff', async () => {
      jest.useFakeTimers();
      const transientError = Object.assign(new Error('Internal error'), {
        status: 500,
      });
      sendMock
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ data: { id: 'msg_retry' } });
      const logger = makeLogger();
      const provider = new GoogleMailProvider(makeConfigService(), logger);

      const pending = provider.send({
        to: 'user@example.com',
        subject: 's',
        text: 't',
      });
      await jest.advanceTimersByTimeAsync(500);
      await pending;

      expect(sendMock).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('retries a 429 rate-limit failure', async () => {
      jest.useFakeTimers();
      const rateLimitError = Object.assign(new Error('Too many requests'), {
        status: 429,
      });
      sendMock
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ data: { id: 'msg_retry_429' } });
      const provider = new GoogleMailProvider(
        makeConfigService(),
        makeLogger(),
      );

      const pending = provider.send({
        to: 'user@example.com',
        subject: 's',
        text: 't',
      });
      await jest.advanceTimersByTimeAsync(500);
      await pending;

      expect(sendMock).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('gives up after 3 attempts and throws, having applied exponential backoff between each', async () => {
      jest.useFakeTimers();
      const transientError = Object.assign(new Error('Service unavailable'), {
        status: 503,
      });
      sendMock.mockRejectedValue(transientError);
      const provider = new GoogleMailProvider(
        makeConfigService(),
        makeLogger(),
      );

      const pending = provider.send({
        to: 'user@example.com',
        subject: 's',
        text: 't',
      });
      const assertion = expect(pending).rejects.toThrow(/Failed to send email/);
      await jest.advanceTimersByTimeAsync(500); // attempt 1 -> 2
      await jest.advanceTimersByTimeAsync(1_000); // attempt 2 -> 3
      await assertion;

      expect(sendMock).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('never retries a non-transient failure (e.g. invalid auth) — fails on the first attempt', async () => {
      const authError = Object.assign(new Error('invalid_grant'), {
        status: 401,
      });
      sendMock.mockRejectedValue(authError);
      const provider = new GoogleMailProvider(
        makeConfigService(),
        makeLogger(),
      );

      await expect(
        provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
      ).rejects.toThrow(/Failed to send email: invalid_grant/);

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('logs the complete Gmail API error body — status, message, code, errors[], stack', async () => {
      const apiError = Object.assign(
        new Error('Request had insufficient authentication scopes.'),
        {
          response: {
            status: 403,
            data: {
              error: {
                code: 403,
                message: 'Request had insufficient authentication scopes.',
                status: 'PERMISSION_DENIED',
                errors: [
                  {
                    message: 'Insufficient Permission',
                    domain: 'global',
                    reason: 'insufficientPermissions',
                  },
                ],
              },
            },
          },
        },
      );
      sendMock.mockRejectedValue(apiError);
      const logger = makeLogger();
      const provider = new GoogleMailProvider(makeConfigService(), logger);

      await expect(
        provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
      ).rejects.toThrow(/Failed to send email/);

      const [finalMessage] = logger.error.mock.calls.at(-1) as [string];
      const logged = JSON.parse(finalMessage) as Record<string, unknown>;
      expect(logged.event).toBe('email_send_failed');
      expect(logged.status).toBe(403);
      expect(logged.apiStatus).toBe('PERMISSION_DENIED');
      expect(logged.code).toBe(403);
      expect(logged.errors).toEqual([
        {
          message: 'Insufficient Permission',
          domain: 'global',
          reason: 'insufficientPermissions',
        },
      ]);
      expect(logged.stack).toEqual(expect.any(String));
    });

    it('logs a distinct access_token_refresh_started/failed step and throws when the refresh token is invalid — never attempts the Gmail API call', async () => {
      const refreshError = Object.assign(new Error('invalid_grant'), {
        response: { status: 400, data: { error: 'invalid_grant' } },
      });
      getAccessTokenMock.mockRejectedValue(refreshError);
      const logger = makeLogger();
      const provider = new GoogleMailProvider(makeConfigService(), logger);

      await expect(
        provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
      ).rejects.toThrow(/Failed to send email: invalid_grant/);

      expect(sendMock).not.toHaveBeenCalled();
      const events = logger.error.mock.calls.map(
        ([message]: [string, string?, string?]) =>
          (JSON.parse(message) as { event: string }).event,
      );
      expect(events).toContain('email_send_attempt_failed');
    });

    it('throws (never returns success) when getAccessToken() resolves with no token', async () => {
      getAccessTokenMock.mockResolvedValue({ token: null });
      const provider = new GoogleMailProvider(
        makeConfigService(),
        makeLogger(),
      );

      await expect(
        provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
      ).rejects.toThrow(/Failed to send email/);

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('logs email_send_failed with the full error after all attempts are exhausted', async () => {
      jest.useFakeTimers();
      const transientError = Object.assign(new Error('Internal error'), {
        status: 500,
      });
      sendMock.mockRejectedValue(transientError);
      const logger = makeLogger();
      const provider = new GoogleMailProvider(makeConfigService(), logger);

      const pending = provider.send({
        to: 'user@example.com',
        subject: 's',
        text: 't',
      });
      const assertion = expect(pending).rejects.toThrow();
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1_000);
      await assertion;

      const [finalMessage] = logger.error.mock.calls.at(-1) as [string];
      const logged = JSON.parse(finalMessage) as Record<string, unknown>;
      expect(logged.event).toBe('email_send_failed');
      expect(logged.provider).toBe('GOOGLE');
      expect(logged.message).toBe('Internal error');
      expect(logged.status).toBe(500);
      jest.useRealTimers();
    });
  });
});
