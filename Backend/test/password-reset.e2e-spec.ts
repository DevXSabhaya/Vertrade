import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerService } from '../src/core/logger/logger.service';
import { EMAIL_PROVIDER } from '../src/modules/email/email.constants';
import { DevelopmentEmailProvider } from '../src/modules/email/providers/development-email.provider';

/**
 * Requires a reachable MongoDB instance, same as every other e2e suite.
 * Exercises the real 4-step password-reset flow end to end through the live
 * HTTP surface: forgot-password -> verify -> reset (+ resend + cooldown),
 * against the real DevelopmentEmailProvider (introspected, never a mock of
 * the reset service itself). Each scenario uses its own email address so
 * the real resend cooldown (enforced against the real system clock) never
 * blocks one legitimate test case on another's timing.
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let emailProvider: DevelopmentEmailProvider;
  const runId = Date.now();
  const originalPassword = 'original-password-1';

  async function registerUser(email: string): Promise<void> {
    await request(app.getHttpServer()).post('/auth/register').send({
      email,
      password: originalPassword,
      displayName: 'Reset E2E',
    });
  }

  function extractCode(email: string): string {
    const message = emailProvider.getLastMessageFor(email);
    const match = message?.text.match(/\d{6}/);
    if (!match) throw new Error('No reset code found in the sent email');
    return match[0];
  }

  beforeAll(async () => {
    // Forces this suite onto the introspectable in-memory
    // DevelopmentEmailProvider regardless of the real EMAIL_PROVIDER
    // configured in `.env` (which is legitimately SMTP for real Gmail
    // delivery in this environment) — these tests need to read back the
    // exact code/subject that was "sent", not make live SMTP calls.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_PROVIDER)
      .useFactory({
        factory: (development: DevelopmentEmailProvider) => development,
        inject: [DevelopmentEmailProvider],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(LoggerService)));
    await app.init();
    emailProvider = app.get(DevelopmentEmailProvider);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await app.close();
  });

  it('always returns 202 for forgot-password, whether or not the email exists, and returns a cooldown', async () => {
    const email = `reset-e2e-exists-${runId}@example.com`;
    await registerUser(email);

    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    expect(res.body.cooldownSeconds).toBeGreaterThan(0);

    const unknownRes = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: `never-registered-${runId}@example.com` })
      .expect(202);
    expect(unknownRes.body.cooldownSeconds).toBeGreaterThan(0);
  });

  it('forgot-password only starts the reset challenge — it never authorizes a password reset, and a raw follow-up reset-password call is rejected', async () => {
    const email = `reset-e2e-no-auto-auth-${runId}@example.com`;
    await registerUser(email);

    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);

    // The response carries only the OTP-challenge metadata (cooldown +
    // expiry) — never anything resembling a session/reset token. This is
    // the exact contract violation that would let a frontend skip OTP
    // verification and jump straight to the new-password screen.
    expect(Object.keys(res.body).sort()).toEqual(
      ['cooldownSeconds', 'codeExpiresAt', 'message'].sort(),
    );
    expect(res.body.resetToken).toBeUndefined();

    // Attempting to reset the password immediately, with no OTP ever
    // verified, must be rejected — even though a code was just requested.
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email,
        resetToken: 'f'.repeat(64),
        newPassword: 'attempted-bypass-password-1',
      })
      .expect(400);
  });

  it('delivers a real, usable code through the DevelopmentEmailProvider, with a professional subject line', async () => {
    const email = `reset-e2e-delivery-${runId}@example.com`;
    await registerUser(email);
    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);

    const message = emailProvider.getLastMessageFor(email);
    expect(message?.subject).toMatch(/verification code/i);
    expect(message?.html).toContain('expires in');
    expect(message?.html).toContain('15 minutes');
    const code = extractCode(email);
    expect(code).toMatch(/^\d{6}$/);

    // EMAIL EXPIRATION = BACKEND EXPIRATION: the same 15-minute window the
    // email copy states is exactly what the API response's codeExpiresAt
    // reflects — the frontend has no separate/hardcoded expiry to derive.
    const expiresInMs =
      new Date(res.body.codeExpiresAt as string).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(14 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('enforces the resend cooldown: an immediate second request for the same email is rejected', async () => {
    const email = `reset-e2e-cooldown-${runId}@example.com`;
    await registerUser(email);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(429);
  });

  it('the dedicated resend endpoint shares the same cooldown as forgot-password', async () => {
    const email = `reset-e2e-resend-cooldown-${runId}@example.com`;
    await registerUser(email);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    await request(app.getHttpServer())
      .post('/auth/forgot-password/resend')
      .send({ email })
      .expect(429);
  });

  it('the resend endpoint sends a working code on its own (no prior forgot-password call required)', async () => {
    const email = `reset-e2e-resend-fresh-${runId}@example.com`;
    await registerUser(email);

    const res = await request(app.getHttpServer())
      .post('/auth/forgot-password/resend')
      .send({ email })
      .expect(202);
    expect(res.body.message).toMatch(/new verification code/i);

    const code = extractCode(email);
    await request(app.getHttpServer())
      .post('/auth/forgot-password/verify')
      .send({ email, code })
      .expect(200);
  });

  it('rejects verify with the wrong code', async () => {
    const email = `reset-e2e-wrong-code-${runId}@example.com`;
    await registerUser(email);
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);

    await request(app.getHttpServer())
      .post('/auth/forgot-password/verify')
      .send({ email, code: '000000' })
      .expect(400);
  });

  it('verify issues a reset session token, and reset-password rejects the raw code as a session token', async () => {
    const email = `reset-e2e-verify-${runId}@example.com`;
    await registerUser(email);
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    const code = extractCode(email);

    // The raw 6-digit code is never a valid reset-session token.
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email,
        resetToken: code.padEnd(32, '0'),
        newPassword: 'irrelevant-password',
      })
      .expect(400);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/forgot-password/verify')
      .send({ email, code })
      .expect(200);
    expect(verifyRes.body.resetToken).toEqual(expect.any(String));
    expect(verifyRes.body.resetToken.length).toBeGreaterThanOrEqual(32);
    expect(verifyRes.body.expiresInSeconds).toBeGreaterThan(0);
  });

  it('completes the full flow: forgot-password -> verify -> reset -> old password rejected -> new password accepted', async () => {
    const email = `reset-e2e-full-flow-${runId}@example.com`;
    await registerUser(email);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    const code = extractCode(email);

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/forgot-password/verify')
      .send({ email, code })
      .expect(200);
    const resetToken = verifyRes.body.resetToken as string;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email, resetToken, newPassword: 'brand-new-password-1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: originalPassword })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'brand-new-password-1' })
      .expect(201);
  });

  it('rejects reusing the same reset session token a second time', async () => {
    const email = `reset-e2e-reuse-${runId}@example.com`;
    await registerUser(email);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(202);
    const code = extractCode(email);
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/forgot-password/verify')
      .send({ email, code })
      .expect(200);
    const resetToken = verifyRes.body.resetToken as string;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email, resetToken, newPassword: 'another-password-2' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ email, resetToken, newPassword: 'yet-another-password-3' })
      .expect(400);
  });

  it('rejects reset-password without ever having verified a code', async () => {
    const email = `reset-e2e-no-verify-${runId}@example.com`;
    await registerUser(email);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        email,
        resetToken: 'a'.repeat(64),
        newPassword: 'brand-new-password-1',
      })
      .expect(400);
  });
});
