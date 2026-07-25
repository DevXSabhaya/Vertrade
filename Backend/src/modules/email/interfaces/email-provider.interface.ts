export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface IEmailProvider {
  send(message: EmailMessage): Promise<void>;
}
