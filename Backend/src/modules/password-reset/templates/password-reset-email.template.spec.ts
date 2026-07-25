import { buildPasswordResetEmail } from './password-reset-email.template';
import { RESET_TOKEN_TTL_MINUTES } from '../password-reset.constants';

describe('buildPasswordResetEmail', () => {
  it('uses the expected subject', () => {
    const { subject } = buildPasswordResetEmail('123456', 15);
    expect(subject).toBe('Your Vertrade verification code');
  });

  it('generates non-empty HTML and plain-text bodies', () => {
    const { html, text } = buildPasswordResetEmail('123456', 15);
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    expect(html).toContain('<html');
  });

  it('includes the OTP code in both HTML and text bodies', () => {
    const { html, text } = buildPasswordResetEmail('482913', 15);
    expect(html).toContain('482913');
    expect(text).toContain('482913');
  });

  it('includes the expiry text in both bodies', () => {
    const { html, text } = buildPasswordResetEmail('123456', 20);
    expect(html).toContain('20 minutes');
    expect(text).toContain('This code expires in 20 minutes');
  });

  it('includes the security warning in both bodies', () => {
    const { html, text } = buildPasswordResetEmail('123456', 15);
    expect(html).toContain('Never share this verification code with anyone');
    expect(text).toContain('Never share this verification code with anyone');
    expect(html).toContain('If you did not request a password reset');
    expect(text).toContain('If you did not request a password reset');
  });

  it('has a plain-text fallback distinct from the HTML body', () => {
    const { html, text } = buildPasswordResetEmail('123456', 15);
    expect(text).not.toContain('<');
    expect(text).not.toBe(html);
  });

  it('safely HTML-escapes dynamic values', () => {
    const { html } = buildPasswordResetEmail('<script>alert(1)</script>', 15);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('the expiry text always reflects RESET_TOKEN_TTL_MINUTES — the actual backend expiry, never a hardcoded literal', () => {
    const { html, text } = buildPasswordResetEmail(
      '123456',
      RESET_TOKEN_TTL_MINUTES,
    );
    expect(RESET_TOKEN_TTL_MINUTES).toBe(15);
    expect(html).toContain(`${RESET_TOKEN_TTL_MINUTES} minutes`);
    expect(text).toContain(
      `This code expires in ${RESET_TOKEN_TTL_MINUTES} minutes`,
    );
  });

  it('includes the current year and product name in the footer', () => {
    const { html, text } = buildPasswordResetEmail('123456', 15);
    const year = new Date().getFullYear().toString();
    expect(html).toContain(`© ${year} Vertrade`);
    expect(text).toContain(`© ${year} Vertrade`);
    expect(html).toContain(
      'This is an automated security email. Please do not reply.',
    );
  });
});
