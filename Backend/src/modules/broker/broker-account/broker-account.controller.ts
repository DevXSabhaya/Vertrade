import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@modules/auth/models/authenticated-user.model';
import { BrokerFactory } from '../registry/broker-factory.service';
import type { BrokerMetadata } from '../registry/models/broker-metadata.model';
import { BrokerAccountService } from './broker-account.service';
import { AddBrokerAccountDto } from './dto/add-broker-account.dto';
import type { BrokerAccount } from './models/broker-account.model';
import type { BrokerStatus } from '../registry/models/broker-status.enum';

interface BrokerAccountResponse extends BrokerAccount {
  readonly runtimeStatus: BrokerStatus;
}

/**
 * The Broker Manager's backend surface. Deliberately mounted at
 * `/broker-accounts` (and `/brokers` for the read-only catalog), separate
 * from the existing `/config/broker/*` endpoints (`AppConfigController`) —
 * those remain the single-session, env-credential-driven LIVE/PAPER broker
 * connection toggle and are untouched; this is the per-user, multi-account
 * catalog that Phase 3's Broker Manager UI drives.
 */
@Controller()
export class BrokerAccountController {
  constructor(
    private readonly accountService: BrokerAccountService,
    private readonly brokerFactory: BrokerFactory,
  ) {}

  /** Public catalog of every broker this platform knows about — the onboarding wizard's broker-selection step. No secrets, no auth required (mirrors GET /config/trading-mode). */
  @Get('brokers')
  listBrokers(): readonly BrokerMetadata[] {
    return this.brokerFactory.listMetadata();
  }

  @UseGuards(JwtAuthGuard)
  @Post('broker-accounts')
  async addAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddBrokerAccountDto,
  ): Promise<BrokerAccountResponse> {
    const account = await this.accountService.addAccount(
      user.userId,
      dto.brokerId,
      dto.displayName,
      { clientId: dto.clientId, accessToken: dto.accessToken },
    );
    return this.toResponse(account);
  }

  @UseGuards(JwtAuthGuard)
  @Get('broker-accounts')
  async listAccounts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BrokerAccountResponse[]> {
    const accounts = await this.accountService.listAccounts(user.userId);
    return accounts.map((account) => this.toResponse(account));
  }

  @UseGuards(JwtAuthGuard)
  @Get('broker-accounts/:id')
  async getAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<BrokerAccountResponse> {
    const account = await this.accountService.getAccount(
      user.userId,
      accountId,
    );
    return this.toResponse(account);
  }

  @UseGuards(JwtAuthGuard)
  @Post('broker-accounts/:id/activate')
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<BrokerAccountResponse> {
    const account = await this.accountService.activate(user.userId, accountId);
    return this.toResponse(account);
  }

  @UseGuards(JwtAuthGuard)
  @Post('broker-accounts/:id/reconnect')
  async reconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<BrokerAccountResponse> {
    const account = await this.accountService.reconnect(user.userId, accountId);
    return this.toResponse(account);
  }

  @UseGuards(JwtAuthGuard)
  @Post('broker-accounts/:id/disconnect')
  async disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<BrokerAccountResponse> {
    const account = await this.accountService.disconnect(
      user.userId,
      accountId,
    );
    return this.toResponse(account);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('broker-accounts/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') accountId: string,
  ): Promise<{ removed: true }> {
    await this.accountService.remove(user.userId, accountId);
    return { removed: true };
  }

  private toResponse(account: BrokerAccount): BrokerAccountResponse {
    return {
      ...account,
      runtimeStatus: this.accountService.getRuntimeStatus(account),
    };
  }
}
