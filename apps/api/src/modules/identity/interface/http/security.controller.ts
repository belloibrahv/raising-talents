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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  changePasswordSchema,
  confirmEmailChangeSchema,
  requestEmailChangeSchema,
  type ChangePassword,
  type ConfirmEmailChange,
  type MeResponse,
  type PendingEmailChange,
  type RequestEmailChange,
  type SignedInDevices,
} from '@rt/contracts';
import type { FastifyReply } from 'fastify';
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
import type {
  CancelEmailChangeHandler,
  ConfirmEmailChangeHandler,
  GetPendingEmailChangeQuery,
  RequestEmailChangeHandler,
} from '../../application/email-change.handlers.js';
import { IDENTITY } from '../../application/identity.tokens.js';

@Controller('v1/me')
@UseGuards(AuthGuard)
export class SecurityController {
  constructor(
    @Inject(IDENTITY.ChangePassword) private readonly changePassword: ChangePasswordHandler,
    @Inject(IDENTITY.ListDevices) private readonly listDevices: ListDevicesQuery,
    @Inject(IDENTITY.SignOutDevice) private readonly signOutDevice: SignOutDeviceHandler,
    @Inject(IDENTITY.SignOutOthers) private readonly signOutOthers: SignOutOtherDevicesHandler,
    @Inject(IDENTITY.RequestEmailChange) private readonly requestEmail: RequestEmailChangeHandler,
    @Inject(IDENTITY.PendingEmailChange) private readonly pendingEmail: GetPendingEmailChangeQuery,
    @Inject(IDENTITY.CancelEmailChange) private readonly cancelEmail: CancelEmailChangeHandler,
    @Inject(IDENTITY.ConfirmEmailChange) private readonly confirmEmail: ConfirmEmailChangeHandler,
  ) {}

  @Post('email')
  @HttpCode(202)
  async changeEmail(
    @CurrentPrincipal() principal: Principal,
    @Body(body(requestEmailChangeSchema)) input: RequestEmailChange,
  ): Promise<PendingEmailChange> {
    return unwrap(await this.requestEmail.execute(principal.userId, input));
  }

  @Get('email/change')
  async pending(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PendingEmailChange | undefined> {
    const pending = await this.pendingEmail.execute(principal.userId);
    if (!pending) void reply.status(204);
    return pending ?? undefined;
  }

  @Delete('email/change')
  @HttpCode(204)
  async cancel(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.cancelEmail.execute(principal.userId);
  }

  @Post('email/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentPrincipal() principal: Principal,
    @Body(body(confirmEmailChangeSchema)) input: ConfirmEmailChange,
  ): Promise<MeResponse> {
    return unwrap(await this.confirmEmail.execute(principal.userId, input.code));
  }

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
