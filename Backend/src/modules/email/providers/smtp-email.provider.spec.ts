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
    verifyMock.mockResolvedValue(true);
    createTransportMock.mockClear();
  });

  it('sends successfully via the configured transport', async () => {
    sendMailMock.mockResolvedValue(undefined);
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
  });

  it('sets a From header equal to configured SMTP_FROM/SMTP_FROM_NAME and a matching envelope sender', async () => {
    sendMailMock.mockResolvedValue(undefined);
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

  it('rejects and logs without leaking the password on authentication failure', async () => {
    const authError = Object.assign(new Error('Invalid login: 535'), {
      code: 'EAUTH',
    });
    sendMailMock.mockRejectedValue(authError);
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email/);

    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.errorCode).toBe('EAUTH');
    expect(logged.provider).toBe('SMTP');
    expect(logged.smtpHost).toBe('smtp.example.com');
    expect(logged.smtpPort).toBe(587);
    expect(logged.secure).toBe(false);
    expect(logged.maskedRecipient).toBe('u***@example.com');
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

  it('rejects on connection failure', async () => {
    const connError = Object.assign(new Error('Connection timeout'), {
      code: 'ECONNECTION',
    });
    sendMailMock.mockRejectedValue(connError);
    const provider = new SmtpEmailProvider(makeConfigService(), makeLogger());

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/Failed to send email/);
  });

  it('verifies the SMTP connection before sending', async () => {
    sendMailMock.mockResolvedValue(undefined);
    const provider = new SmtpEmailProvider(makeConfigService(), makeLogger());

    await provider.send({ to: 'user@example.com', subject: 's', text: 't' });

    expect(verifyMock).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalled();
  });

  it('rejects and logs without leaking the password when connection verification fails', async () => {
    const verifyError = Object.assign(new Error('Invalid login: 535'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    verifyMock.mockRejectedValue(verifyError);
    const logger = makeLogger();
    const provider = new SmtpEmailProvider(makeConfigService(), logger);

    await expect(
      provider.send({ to: 'user@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/SMTP connection\/authentication failed/);

    expect(sendMailMock).not.toHaveBeenCalled();
    const [loggedMessage] = logger.error.mock.calls[0] as [string];
    const logged = JSON.parse(loggedMessage) as Record<string, unknown>;
    expect(logged.event).toBe('smtp_connection_verify_failed');
    expect(logged.errorCode).toBe('EAUTH');
    expect(logged.responseCode).toBe(535);
    expect(loggedMessage).not.toContain('password');
  });
});
