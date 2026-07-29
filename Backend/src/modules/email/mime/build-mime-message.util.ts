import type {
  EmailAttachment,
  EmailMessage,
} from '../interfaces/email-provider.interface';

export interface MimeSender {
  readonly name: string;
  readonly email: string;
}

const CRLF = '\r\n';

/** Encodes a header value as an RFC 2047 base64 "encoded-word" — always applied (not just when non-ASCII is detected) so this never has to special-case ASCII-only subjects differently from ones that later gain an emoji/accented character. */
function encodeHeaderValue(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** MIME requires base64 body content wrapped at 76 characters per line. */
function wrapBase64(base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.slice(i, i + 76));
  }
  return lines.join(CRLF);
}

function randomBoundary(prefix: string): string {
  return `----=_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function buildAlternativePart(message: EmailMessage, boundary: string): string {
  const parts: string[] = [];

  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/plain; charset="UTF-8"');
  parts.push('Content-Transfer-Encoding: base64');
  parts.push('');
  parts.push(wrapBase64(Buffer.from(message.text, 'utf8').toString('base64')));

  if (message.html) {
    parts.push(`--${boundary}`);
    parts.push('Content-Type: text/html; charset="UTF-8"');
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    parts.push(
      wrapBase64(Buffer.from(message.html, 'utf8').toString('base64')),
    );
  }

  parts.push(`--${boundary}--`);
  return parts.join(CRLF);
}

function buildAttachmentPart(
  attachment: EmailAttachment,
  boundary: string,
): string {
  const encodedFilename = encodeHeaderValue(attachment.filename);
  return [
    `--${boundary}`,
    `Content-Type: ${attachment.contentType ?? 'application/octet-stream'}; name="${encodedFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encodedFilename}"`,
    '',
    wrapBase64(attachment.content.toString('base64')),
  ].join(CRLF);
}

/**
 * Builds an RFC 2822 message and returns it base64url-encoded, exactly the
 * shape the Gmail API's `users.messages.send` expects in `requestBody.raw`.
 * Always sends `multipart/alternative` (text + optional html); when
 * attachments are present, that alternative part is nested inside an outer
 * `multipart/mixed` alongside each attachment part — the standard MIME
 * structure for "a readable message body plus files".
 */
export function buildRawMimeMessage(
  message: EmailMessage,
  from: MimeSender,
): string {
  const alternativeBoundary = randomBoundary('alt');
  const headers = [
    `From: ${from.name} <${from.email}>`,
    `To: ${message.to}`,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    'MIME-Version: 1.0',
  ];

  let body: string;
  if (message.attachments && message.attachments.length > 0) {
    const mixedBoundary = randomBoundary('mixed');
    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    const alternativePart = [
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      '',
      buildAlternativePart(message, alternativeBoundary),
    ].join(CRLF);
    const attachmentParts = message.attachments
      .map((attachment) => buildAttachmentPart(attachment, mixedBoundary))
      .join(CRLF);
    body = [alternativePart, attachmentParts, `--${mixedBoundary}--`].join(
      CRLF,
    );
  } else {
    headers.push(
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    );
    body = buildAlternativePart(message, alternativeBoundary);
  }

  const raw = [headers.join(CRLF), '', body].join(CRLF);
  return Buffer.from(raw, 'utf8').toString('base64url');
}
