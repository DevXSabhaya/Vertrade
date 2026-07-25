import { Controller, Get, Post } from '@nestjs/common';
import { RecoveryService } from './recovery.service';
import type { RecoveryHistoryEntry } from './models/recovery-history-entry.model';
import type { RecoveryStatus } from './models/recovery-status.model';
import type { RecoverySnapshot } from './models/recovery-snapshot.model';
import { RecoverySnapshotNotFoundException } from './exceptions/recovery-snapshot-not-found.exception';

@Controller('recovery')
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Post('start')
  async start(): Promise<RecoveryHistoryEntry> {
    return this.recoveryService.start();
  }

  @Post('restart')
  async restart(): Promise<RecoveryHistoryEntry> {
    return this.recoveryService.restart();
  }

  @Get('status')
  getStatus(): RecoveryStatus {
    return this.recoveryService.getStatus();
  }

  @Get('history')
  async getHistory(): Promise<RecoveryHistoryEntry[]> {
    return this.recoveryService.getHistory();
  }

  @Get('snapshot')
  async getSnapshot(): Promise<RecoverySnapshot> {
    const snapshot = await this.recoveryService.getLatestSnapshot();
    if (!snapshot) {
      throw new RecoverySnapshotNotFoundException(
        'No recovery snapshot has been captured yet',
      );
    }
    return snapshot;
  }
}
