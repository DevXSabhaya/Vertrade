import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';

interface TradingModeResponseBody {
  readonly tradingMode: 'PAPER' | 'LIVE';
}

/**
 * Public, unauthenticated (mirrors `/health`) — never exposes credentials or
 * secrets, only the operational mode selector that determines which
 * `IOrderExecutor` every trade in this deployment currently runs through.
 * Exists specifically so the frontend can show the user which mode is active
 * *before* they submit a trade, never inferring it client-side.
 */
@Controller('config')
export class AppConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('trading-mode')
  getTradingMode(): TradingModeResponseBody {
    return { tradingMode: this.configService.tradingMode };
  }
}
