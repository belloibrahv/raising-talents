import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { SharedTalentProfile } from '@rt/contracts';
import { ClientIp } from '../../../../platform/http/client-ip.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { PORTFOLIO, type SharedTalentProfileQuery } from '../../application/portfolio.use-cases.js';

/** No sign-in: the shareable talent page (ADR-042). */
@Controller('v1/shared')
export class SharedProfileController {
  constructor(@Inject(PORTFOLIO.Shared) private readonly shared: SharedTalentProfileQuery) {}

  @Get(':code')
  async byCode(
    @Param('code') code: string,
    @ClientIp() clientIp: string,
  ): Promise<SharedTalentProfile> {
    return unwrap(await this.shared.execute(code, clientIp));
  }
}
