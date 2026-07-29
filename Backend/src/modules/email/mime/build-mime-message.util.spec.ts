import { buildRawMimeMessage } from './build-mime-message.util';

function decode(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

describe('buildRawMimeMessage', () => {
  const from = { name: 'Vertrade', email: 'vertrade19@gmail.com' };

  it('produces valid base64url that decodes back to an RFC 2822 message', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 'Hello', text: 'Hi there' },
      from,
    );
    expect(() => decode(raw)).not.toThrow();
    const decoded = decode(raw);
    expect(decoded).toContain('MIME-Version: 1.0');
    expect(decoded).toContain('To: user@example.com');
  });

  it('sets the From header to the configured name/address', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 'Hello', text: 'Hi there' },
      from,
    );
    expect(decode(raw)).toContain('From: Vertrade <vertrade19@gmail.com>');
  });

  it('base64-encodes the subject as an RFC 2047 encoded-word', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 'Your verification code', text: 't' },
      from,
    );
    const decoded = decode(raw);
    const expectedEncodedSubject = `=?UTF-8?B?${Buffer.from('Your verification code', 'utf8').toString('base64')}?=`;
    expect(decoded).toContain(`Subject: ${expectedEncodedSubject}`);
  });

  it('embeds the base64-encoded text body', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 's', text: 'plain body content' },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toContain(
      Buffer.from('plain body content', 'utf8').toString('base64'),
    );
  });

  it('includes a text/html part when html is provided', () => {
    const raw = buildRawMimeMessage(
      {
        to: 'user@example.com',
        subject: 's',
        text: 'plain',
        html: '<p>rich</p>',
      },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(decoded).toContain(
      Buffer.from('<p>rich</p>', 'utf8').toString('base64'),
    );
  });

  it('omits the text/html part entirely when html is not provided', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 's', text: 'plain only' },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).not.toContain('text/html');
  });

  it('uses multipart/alternative when there are no attachments', () => {
    const raw = buildRawMimeMessage(
      { to: 'user@example.com', subject: 's', text: 't', html: '<p>h</p>' },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).toContain('Content-Type: multipart/alternative');
    expect(decoded).not.toContain('multipart/mixed');
  });

  it('wraps the alternative part in multipart/mixed and attaches files when attachments are present', () => {
    const raw = buildRawMimeMessage(
      {
        to: 'user@example.com',
        subject: 's',
        text: 't',
        attachments: [
          {
            filename: 'receipt.pdf',
            content: Buffer.from('pdf-bytes'),
            contentType: 'application/pdf',
          },
        ],
      },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).toContain('Content-Type: multipart/mixed');
    expect(decoded).toContain('Content-Type: multipart/alternative');
    expect(decoded).toContain('Content-Disposition: attachment');
    expect(decoded).toContain('application/pdf');
    expect(decoded).toContain(Buffer.from('pdf-bytes').toString('base64'));
  });

  it('supports multiple attachments, each with its own part', () => {
    const raw = buildRawMimeMessage(
      {
        to: 'user@example.com',
        subject: 's',
        text: 't',
        attachments: [
          { filename: 'a.txt', content: Buffer.from('AAAA') },
          { filename: 'b.txt', content: Buffer.from('BBBB') },
        ],
      },
      from,
    );
    const decoded = decode(raw);
    expect(decoded).toContain(Buffer.from('AAAA').toString('base64'));
    expect(decoded).toContain(Buffer.from('BBBB').toString('base64'));
  });

  it('defaults an attachment with no contentType to application/octet-stream', () => {
    const raw = buildRawMimeMessage(
      {
        to: 'user@example.com',
        subject: 's',
        text: 't',
        attachments: [{ filename: 'a.bin', content: Buffer.from('x') }],
      },
      from,
    );
    expect(decode(raw)).toContain('application/octet-stream');
  });
});
