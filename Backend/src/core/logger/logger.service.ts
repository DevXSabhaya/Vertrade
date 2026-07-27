import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  trace?: string;
}

// Defense-in-depth only — every call site is still expected to avoid logging
// secrets directly (e.g. via maskEmail()). This is a last-resort net that
// catches an accidental `key: value`/`key=value` for an obviously sensitive
// key name, or a bearer/JWT-shaped token, before it ever reaches stdout.
const SENSITIVE_KEY_VALUE_PATTERN =
  /\b(password|passwd|token|secret|otp|apikey|api[_-]?key|authorization|totp)\b\s*[:=]\s*"?[^\s",}]+/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+/gi;
// Anchored on "eyJ" — the base64url encoding of `{"`, which every standard
// JWT header starts with — so this can't accidentally match unrelated
// dotted strings like IP addresses ("127.0.0.1") or version numbers.
const JWT_SHAPED_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

function redact(message: string): string {
  return message
    .replace(SENSITIVE_KEY_VALUE_PATTERN, (match) => {
      const separatorIndex = Math.max(match.indexOf(':'), match.indexOf('='));
      return `${match.slice(0, separatorIndex + 1)} [REDACTED]`;
    })
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_SHAPED_PATTERN, '[REDACTED]');
}

/**
 * Minimal structured (JSON) logger satisfying Nest's LoggerService contract.
 * Phase 1 builds the Audit/Application log split on top of this.
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  log(message: string, context?: string): void {
    this.write('log', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: LogLevel,
    message: string,
    context?: string,
    trace?: string,
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: redact(message),
      ...(context ? { context } : {}),
      ...(trace ? { trace } : {}),
    };

    const line = `${JSON.stringify(entry)}\n`;
    if (level === 'error') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}
