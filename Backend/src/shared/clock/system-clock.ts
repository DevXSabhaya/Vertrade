import { Injectable } from '@nestjs/common';
import type { IClock } from './clock.interface';

@Injectable()
export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
