import { Injectable } from '@nestjs/common';
import type { ITimerScheduler } from './timer-scheduler.interface';

@Injectable()
export class NativeTimerScheduler implements ITimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown {
    return setTimeout(callback, delayMs);
  }

  clearTimeout(handle: unknown): void {
    clearTimeout(handle as NodeJS.Timeout);
  }

  setInterval(callback: () => void, intervalMs: number): unknown {
    return setInterval(callback, intervalMs);
  }

  clearInterval(handle: unknown): void {
    clearInterval(handle as NodeJS.Timeout);
  }
}
