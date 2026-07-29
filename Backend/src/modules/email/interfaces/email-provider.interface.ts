export interface EmailAttachment {
  readonly filename: string;
  readonly content: Buffer;
  /** Defaults to `application/octet-stream` if omitted. */
  readonly contentType?: string;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  /** Optional — no current caller sets this; wired through end-to-end (MIME building, provider) so a future email can attach files without any provider-level changes. */
  readonly attachments?: readonly EmailAttachment[];
}

export interface IEmailProvider {
  send(message: EmailMessage): Promise<void>;
}
