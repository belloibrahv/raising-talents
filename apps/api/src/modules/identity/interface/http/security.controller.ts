import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { changePasswordSchema, type ChangePassword, type SignedInDevices } from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import type {
  ChangePasswordHandler,
  ListDevicesQuery,
  SignOutDeviceHandler,
  SignOutOtherDevicesHandler,
} from '../../application/account-security.handlers.js';
import { IDENTITY } from '../../application/identity.tokens.js';

@Controller('v1/me')
@UseGuards(AuthGuard)
export class SecurityController {
  constructor(
    @Inject(IDENTITY.ChangePassword) private readonly changePassword: ChangePasswordHandler,
    @Inject(IDENTITY.ListDevices) private readonly listDevices: ListDevicesQuery,
    @Inject(IDENTITY.SignOutDevice) private readonly signOutDevice: SignOutDeviceHandler,
    @Inject(IDENTITY.SignOutOthers) private readonly signOutOthers: SignOutOtherDevicesHandler,
  ) {}

  @Post('password')
  @HttpCode(204)
  async password(
    @CurrentPrincipal() principal: Principal,
    @Body(body(changePasswordSchema)) input: ChangePassword,
  ): Promise<void> {
    unwrap(await this.changePassword.execute(principal, input));
  }

  @Get('sessions')
  devices(@CurrentPrincipal() principal: Principal): Promise<SignedInDevices> {
    return this.listDevices.execute(principal);
  }

  @Post('sessions/sign-out-others')
  @HttpCode(204)
  async others(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.signOutOthers.execute(principal);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.signOutDevice.execute(principal, sessionId);
  }
}
