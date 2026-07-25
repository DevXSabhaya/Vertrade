import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { RiskPolicyService } from './risk-policy.service';
import { RiskSnapshotService } from './risk-snapshot.service';
import { CooldownService } from './cooldown.service';
import { KillSwitchService } from './kill-switch.service';
import { EmergencyStopService } from './emergency-stop.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import {
  RISK_EVENT_REPOSITORY,
  RISK_VIOLATION_REPOSITORY,
} from './risk-management.constants';
import type { IRiskEventRepository } from './interfaces/risk-event-repository.interface';
import type { IRiskViolationRepository } from './interfaces/risk-violation-repository.interface';
import { UpdateRiskPolicyDto } from './dto/update-risk-policy.dto';
import { KillSwitchActivateDto } from './dto/kill-switch-activate.dto';
import { KillSwitchDeactivateDto } from './dto/kill-switch-deactivate.dto';
import { EmergencyStopDto } from './dto/emergency-stop.dto';
import { EmergencyStopResetDto } from './dto/emergency-stop-reset.dto';
import type { RiskPolicy } from './models/risk-policy.model';
import type { RiskSnapshot } from './models/risk-snapshot.model';
import type { RiskStatus } from './models/risk-status.model';
import type { CooldownState } from './models/cooldown.model';
import type { KillSwitchState } from './models/kill-switch-state.model';
import type { EmergencyStopState } from './models/emergency-stop-state.model';
import type { RiskEventRecord } from './models/risk-event-record.model';
import type { RiskViolation } from './models/risk-violation.model';
import { KillSwitchStatus } from './models/kill-switch-status.enum';

const DEFAULT_LIST_LIMIT = 50;

/**
 * Every endpoint the Phase 11 spec lists (Part 18). Requires authentication
 * (Phase 20 hardening) like every other endpoint now does — but there is no
 * role/permission system in this codebase, so this is "any authenticated
 * user" rather than "admin only." Kill-switch/emergency-stop/policy
 * mutation being reachable by any logged-in user (not just an operator) is
 * a known limitation until a role system exists; it is no longer, however,
 * reachable by an unauthenticated caller on the open internet.
 */
@Controller('risk')
@UseGuards(JwtAuthGuard)
export class RiskManagementController {
  constructor(
    private readonly riskPolicyService: RiskPolicyService,
    private readonly riskSnapshotService: RiskSnapshotService,
    private readonly cooldownService: CooldownService,
    private readonly killSwitchService: KillSwitchService,
    private readonly emergencyStopService: EmergencyStopService,
    private readonly circuitBreakerService: CircuitBreakerService,
    @Inject(RISK_EVENT_REPOSITORY)
    private readonly riskEventRepository: IRiskEventRepository,
    @Inject(RISK_VIOLATION_REPOSITORY)
    private readonly riskViolationRepository: IRiskViolationRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  @Get('status')
  async getStatus(): Promise<RiskStatus> {
    const [killSwitch, cooldown] = await Promise.all([
      Promise.resolve(this.killSwitchService.getState()),
      this.cooldownService.getActiveCooldown(),
    ]);
    const emergencyStopActive = this.emergencyStopService.isActive();
    return {
      killSwitchStatus: killSwitch.status,
      emergencyStopActive,
      cooldownActive: cooldown !== null,
      circuitBreakers: this.circuitBreakerService.getAllSnapshots(),
      tradingBlocked:
        emergencyStopActive ||
        killSwitch.status !== KillSwitchStatus.ACTIVE ||
        cooldown !== null,
      asOf: this.clock.now().toISOString(),
    };
  }

  @Get('snapshot')
  async getSnapshot(): Promise<RiskSnapshot> {
    return this.riskSnapshotService.compose();
  }

  @Get('policy')
  getPolicy(): RiskPolicy {
    return this.riskPolicyService.getPolicy();
  }

  @Put('policy')
  async updatePolicy(@Body() dto: UpdateRiskPolicyDto): Promise<RiskPolicy> {
    return this.riskPolicyService.updatePolicy(dto);
  }

  @Get('limits')
  getLimits(): RiskPolicy {
    return this.riskPolicyService.getPolicy();
  }

  @Get('cooldown')
  async getCooldown(): Promise<CooldownState | null> {
    return this.cooldownService.getActiveCooldown();
  }

  @Post('kill-switch/activate')
  async activateKillSwitch(
    @Body() dto: KillSwitchActivateDto,
  ): Promise<KillSwitchState> {
    return this.killSwitchService.activate(
      dto.status,
      dto.reason,
      dto.activatedBy ?? 'api',
      dto.forceExitPositions ?? false,
    );
  }

  @Post('kill-switch/deactivate')
  async deactivateKillSwitch(
    @Body() dto: KillSwitchDeactivateDto,
  ): Promise<KillSwitchState> {
    return this.killSwitchService.deactivate(dto.deactivatedBy ?? 'api');
  }

  @Post('emergency-stop')
  async triggerEmergencyStop(
    @Body() dto: EmergencyStopDto,
  ): Promise<EmergencyStopState> {
    return this.emergencyStopService.trigger(
      dto.reason,
      dto.triggeredBy ?? 'api',
    );
  }

  @Post('emergency-stop/reset')
  async resetEmergencyStop(
    @Body() dto: EmergencyStopResetDto,
  ): Promise<EmergencyStopState> {
    return this.emergencyStopService.reset(dto.resetBy ?? 'api');
  }

  @Get('events')
  async getEvents(@Query('limit') limit?: string): Promise<RiskEventRecord[]> {
    return this.riskEventRepository.findRecent(
      limit ? Number(limit) : DEFAULT_LIST_LIMIT,
    );
  }

  @Get('violations')
  async getViolations(
    @Query('limit') limit?: string,
  ): Promise<RiskViolation[]> {
    return this.riskViolationRepository.findRecent(
      limit ? Number(limit) : DEFAULT_LIST_LIMIT,
    );
  }
}
