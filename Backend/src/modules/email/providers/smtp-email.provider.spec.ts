import { SmtpEmailProvider } from './smtp-email.provider';
import type { ConfigService } from '@core/config/config.service';
import type { LoggerService } from '@core/logger/logger.service';

const sendMailMock = jest.fn();
const verifyMock = jest.fn();
const createTransportMock = jest.fn((options: unknown) => {
  void options;
  return { sendMail: sendMailMock, verify: verifyMock };
});

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (options: unknown) => createTransportMock(options),
  },
}));

function makeConfigService(
  overrides: Partial<Record<string, unknown>> = {},
): ConfigService {
  return {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'user@example.com',
    smtpPass: 'password',
    smtpFrom: 'noreply@example.com',
    smtpFromName: 'Trading App',
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

describe('SmtpEmailProvider', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    verifyMock.mockReset();
    createTransportMock.mockClear();
  });

  it('sends successfully via the configured transport, without ever calling verify()', async () => {
    sendMailMock.mockResolvedValue({
      messageId: '<abc@example.com>',
      accepted: ['user@example.com'],
      rejected: [],
    });
    const provider = new SmtpEmailProvider(makeConfigService(), makeLogger());

    await provider.send({
      to: 'user@example.com',
      subject: 'Reset your password',
      text: 'code: 123456',
      html: '<p>code: 123456</p>',
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Trading App', address: 'noreply@example.com' },
        to: 'user@example.com',
        subject: 'Reset your password',
        text: 'code: 123456',
        html: '<p>code: 123456</p>',
        envelope: { from: 'noreply@example.com', to: ['user@example.com'] },
      }),
    );
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('sets a From header equal to configured SMTP_FROM/SMTP_FROM_NAME and a matching envelope sender', async () => {
    sendMailMock.mockResolvedValue({
      messageId: '<abc@example.com>',
      accepted: ['recipient@example.com'],
      rejected: [],
    });
    const provider = new SmtpEmailProvider(
      makeConfigService({
        smtpFrom: 'password-reset@example.com',
        smtpFromName: 'Support Team',
      }),
      makeLogger(),
    );

    await provider.send({
      to: 'recipient@example.com',
      subject: 's',
      text: 't',
    });

    const [sentMessage] = sendMailMock.mock.calls[0] as [
      {
        from: { name: string; address: string };
        envelope: { from: string; to: string[] };
      },
    ];
    expect(sentMessage.from).toEqual({
      name: 'Support Team',
      address: 'password-reset@example.com',
    });
    expect(sentMessage.envelope.from).toBe('password-reset@example.com');
    expect(sentMessage.envelope.to).toContain('recipient@example.com');
  });

  it('constructs the transport with host/port/secure/auth from config', () => {
    new SmtpEmailProvider(
      makeConfigService({ smtpPort: 465, smtpSecure: true }),
      makeLogger(),
    );

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'user@example.com', pass: 'password' },
      }),
    );
  });

  it('constructs the transport with 30s connection/greeting/socket timeouts and pool enabled', () => {
    new SmtpEmailProvider(makeConfigService(), makeLogger());

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 30_000,
        pool: true,
      }),
    );
  });

  it('logs before sendMail() and after a successful sendMail(), including messageId/accepted/rejected', async () => {
    sendMailMock.mockResolvedValue({
      messageId: '<abc123@example.com>',
      accepted: ['user@example.com'],
      rejected: [],
    });
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    const events = logger.log.mock.calls.map(
      ([message]: [string, string?]) =>
        (JSON.parse(message) as { event: string }).event,
    );
    expect(events).toEqual([
      'smtp_email_provider_configured',
      'smtp_send_mail_started',
      'smtp_send_mail_succeeded',
    ]);

    const [, startedMessage, succeededMessage] = logger.log.mock.calls.map(
      ([message]: [string, string?]) => message,
    );
    const started = JSON.parse(startedMessage) as Record<string, unknown>;
    expect(started.maskedRecipient).toBe('u***@example.com');

    const succeeded = JSON.parse(succeededMessage) as Record<string, unknown>;
    expect(succeeded.messageId).toBe('<abc123@example.com>');
    expect(succeeded.accepted).toEqual(['user@example.com']);
    expect(succeeded.rejected).toEqual([]);
    expect(succeeded.durationMs).toEqual(expect.any(Number));
  });

  it('rejects and logs the complete error (code/responseCode/response/command/stack) without leaking the password on authentication failure', async () => {
    const authError = Object.assign(new Error('Invalid login: 535'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    sendMailMock.mockRejectedValue(authError);
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email/);

    const [loggedMessage, loggedStack] = logger.error.mock.calls[0] as [
      string,
      string | undefined,
    ];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.event).toBe('smtp_email_send_failed');
    expect(logged.errorCode).toBe('EAUTH');
    expect(logged.responseCode).toBe(535);
    expect(logged.provider).toBe('SMTP');
    expect(logged.smtpHost).toBe('smtp.example.com');
    expect(logged.smtpPort).toBe(587);
    expect(logged.secure).toBe(false);
    expect(logged.maskedRecipient).toBe('u***@example.com');
    expect(logged.errorStack).toBe(authError.stack);
    expect(loggedStack).toBe(authError.stack);
    expect(loggedMessage).not.toContain('password');
  });

  it('includes the raw SMTP response text and command for a rejected-at-DATA failure', async () => {
    const rejectedError = Object.assign(
      new Error(
        'Message failed: 554 5.0.0 Error: transaction failed: invalid sender',
      ),
      {
        code: 'EMESSAGE',
        responseCode: 554,
        command: 'DATA',
        response:
          '554 5.0.0 Error: transaction failed: invalid sender: no valid From address found in header or envelope',
      },
    );
    sendMailMock.mockRejectedValue(rejectedError);
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email/);

    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.errorCode).toBe('EMESSAGE');
    expect(logged.responseCode).toBe(554);
    expect(logged.smtpCommand).toBe('DATA');
    expect(logged.smtpResponse).toContain('invalid sender');
  });

  it('rejects and logs ETIMEDOUT on a connection timeout, without ever calling verify() first', async () => {
    const timeoutError = Object.assign(new Error('Connection timeout'), {
      code: 'ETIMEDOUT',
    });
    sendMailMock.mockRejectedValue(timeoutError);
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email/);

    expect(verifyMock).not.toHaveBeenCalled();
    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.errorCode).toBe('ETIMEDOUT');
  });
});
