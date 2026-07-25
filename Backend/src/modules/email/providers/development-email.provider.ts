import { Injectable } from '@nestjs/common';
import { LoggerService } from '@core/logger/logger.service';
import type {
  EmailMessage,
  IEmailProvider,
} from '../interfaces/email-provider.interface';

/**
 * Never makes a real network call. Keeps sent messages in an in-memory list
 * so development and tests can read a message back programmatically (e.g. to
 * pull a password-reset code out of the email body) — this is what makes the
 * reset flow fully testable without real SMTP credentials. Only ever logs
 * *that* a message was sent (recipient + subject), never the body, so a raw
 * reset code/OTP never reaches application logs.
 */
@Injectable()
export class DevelopmentEmailProvider implements IEmailProvider {
  private readonly sent: EmailMessage[] = [];

  constructor(private readonly logger: LoggerService) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to satisfy IEmailProvider; this provider never actually awaits I/O
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(
      `[DevelopmentEmailProvider] email queued for ${message.to} (subject: "${message.subject}")`,
      'DevelopmentEmailProvider',
    );
  }

  /** Test/dev-only introspection — the most recent message sent to a given recipient, if any. */
  getLastMessageFor(to: string): EmailMessage | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]?.to === to) {
        return this.sent[i];
      }
    }
    return undefined;
  }

  /** Test-only helper to reset state between test cases. */
  clear(): void {
    this.sent.length = 0;
  }
}
