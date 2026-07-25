const APP_NAME = 'Vertrade';

export interface PasswordResetEmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Minimal HTML-entity escape for the few dynamic values (`code`,
 * `expiryMinutes`) interpolated into the template — both are always
 * server-generated (numeric OTP, numeric TTL), never user input, but this
 * keeps the template safe even if that ever changes.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The only place the password-reset email's copy lives — used by
 * `PasswordResetService` for both the initial send and every resend, so the
 * two can never drift apart. Table-based HTML with inline styles only (no
 * external images/scripts/fonts, no `<style>` blocks Outlook strips) so it
 * renders consistently across Gmail, Outlook, and Apple Mail, and degrades
 * gracefully if a client strips CSS. `@media (prefers-color-scheme: dark)`
 * is supported by Apple Mail / iOS Mail / newer Gmail clients; clients that
 * ignore it just keep the light theme, which still has safe contrast.
 */
export function buildPasswordResetEmail(
  code: string,
  expiryMinutes: number,
): PasswordResetEmailContent {
  const safeCode = escapeHtml(code);
  const safeExpiry = escapeHtml(String(expiryMinutes));
  const year = new Date().getFullYear();

  const subject = `Your ${APP_NAME} verification code`;

  const text = [
    `Verify your identity`,
    '',
    `We received a request to reset the password for your ${APP_NAME} account.`,
    '',
    `Use the verification code below to continue:`,
    '',
    code,
    '',
    `This code expires in ${expiryMinutes} minutes and can only be used once.`,
    '',
    'SECURITY NOTICE',
    'If you did not request a password reset, you can safely ignore this email. Your password will not be changed.',
    '',
    `Never share this verification code with anyone. ${APP_NAME} support will never ask you for your verification code or password.`,
    '',
    `© ${year} ${APP_NAME}`,
    'This is an automated security email. Please do not reply.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${APP_NAME} verification code</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f5f7; -webkit-text-size-adjust:100%; text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
  Your ${APP_NAME} verification code is ${safeCode}. It expires in ${safeExpiry} minutes.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px; max-width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
        <tr>
          <td style="background-color:#0f172a; padding:28px 32px;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; font-weight:700; color:#ffffff; letter-spacing:0.2px;">
              ${APP_NAME}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 8px;">
            <h1 style="margin:0 0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; line-height:1.3; font-weight:700; color:#0f172a;">
              Verify your identity
            </h1>
            <p style="margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#475569;">
              We received a request to reset the password for your ${APP_NAME} account.
            </p>
            <p style="margin:0 0 24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.6; color:#475569;">
              Use the verification code below to continue:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:20px;">
                  <span style="font-family:'Courier New',Courier,monospace; font-size:32px; font-weight:700; letter-spacing:10px; color:#0f172a;">
                    ${safeCode}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748b;">
              This code expires in <strong style="color:#0f172a;">${safeExpiry} minutes</strong> and can only be used once.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;">
              <tr>
                <td style="padding:20px 0 0;">
                  <p style="margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; letter-spacing:0.4px; text-transform:uppercase; color:#94a3b8;">
                    Security notice
                  </p>
                  <p style="margin:0 0 8px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748b;">
                    If you did not request a password reset, you can safely ignore this email. Your password will not be changed.
                  </p>
                  <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#64748b;">
                    Never share this verification code with anyone. ${APP_NAME} support will never ask you for your verification code or password.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px; max-width:100%;">
        <tr>
          <td align="center" style="padding:20px 32px;">
            <p style="margin:0 0 4px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#94a3b8;">
              © ${year} ${APP_NAME}
            </p>
            <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.5; color:#94a3b8;">
              This is an automated security email. Please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
