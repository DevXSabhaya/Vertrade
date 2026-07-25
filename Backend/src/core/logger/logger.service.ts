import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  trace?: string;
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
      message,
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
