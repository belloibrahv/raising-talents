import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  signInRequestSchema,
  signOutRequestSchema,
  signUpRequestSchema,
  verifyEmailRequestSchema,
  type AuthResponse,
  type MeResponse,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type RefreshRequest,
  type SignInRequest,
  type SignOutRequest,
  type SignUpRequest,
  type VerifyEmailRequest,
} from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { ClientIp } from '../../../../platform/http/client-ip.decorator.js';
import { DeviceLabel } from '../../../../platform/http/device-label.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import type { AccountsFacade } from '../../../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../../../accounts/application/accounts.tokens.js';
import { IDENTITY } from '../../application/identity.tokens.js';
import type {
  RequestPasswordResetHandler,
  ResetPasswordHandler,
} from '../../application/password-reset.handlers.js';
import type { RefreshSessionHandler } from '../../application/refresh-session.handler.js';
import type { RequestEmailVerificationHandler } from '../../application/request-email-verification.handler.js';
import type { SignInHandler } from '../../application/sign-in.handler.js';
import type { SignOutHandler } from '../../application/sign-out.handler.js';
import type { SignedIn, SignUpHandler } from '../../application/sign-up.handler.js';
import type { VerifyEmailHandler } from '../../application/verify-email.handler.js';

@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(IDENTITY.SignUp) private readonly signUpHandler: SignUpHandler,
    @Inject(IDENTITY.SignIn) private readonly signInHandler: SignInHandler,
    @Inject(IDENTITY.RefreshSession) private readonly refreshHandler: RefreshSessionHandler,
    @Inject(IDENTITY.SignOut) private readonly signOutHandler: SignOutHandler,
    @Inject(IDENTITY.VerifyEmail) private readonly verifyEmailHandler: VerifyEmailHandler,
    @Inject(IDENTITY.RequestEmailVerification)
    private readonly resendHandler: RequestEmailVerificationHandler,
    @Inject(ACCOUNTS.Facade) private readonly accounts: AccountsFacade,
    @Inject(IDENTITY.RequestPasswordReset)
    private readonly requestReset: RequestPasswordResetHandler,
    @Inject(IDENTITY.ResetPassword) private readonly resetPassword: ResetPasswordHandler,
  ) {}

  @Post('password-reset')
  @HttpCode(202)
  async requestPasswordReset(
    @Body(body(passwordResetRequestSchema)) request: PasswordResetRequest,
    @ClientIp() ip: string,
  ): Promise<void> {
    unwrap(await this.requestReset.execute({ email: request.email, ip }));
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmPasswordReset(
    @Body(body(passwordResetConfirmSchema)) request: PasswordResetConfirm,
  ): Promise<void> {
    unwrap(await this.resetPassword.execute(request));
  }

  @Post('sign-up')
  @HttpCode(201)
  async signUp(
    @Body(body(signUpRequestSchema)) request: SignUpRequest,
    @ClientIp() ip: string,
    @DeviceLabel() deviceLabel: string | null,
  ): Promise<AuthResponse> {
    const signedIn = unwrap(
      await this.signUpHandler.execute({
        email: request.email,
        password: request.password,
        dateOfBirth: request.dateOfBirth,
        countryCode: request.countryCode,
        deviceId: request.deviceId,
        ip,
        deviceLabel,
      }),
    );
    return this.withMe(signedIn);
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(body(signInRequestSchema)) request: SignInRequest,
    @ClientIp() ip: string,
    @DeviceLabel() deviceLabel: string | null,
  ): Promise<AuthResponse> {
    return this.withMe(unwrap(await this.signInHandler.execute({ ...request, ip, deviceLabel })));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(body(refreshRequestSchema)) request: RefreshRequest): Promise<AuthResponse> {
    return this.withMe(unwrap(await this.refreshHandler.execute(request)));
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(@Body(body(signOutRequestSchema)) request: SignOutRequest): Promise<void> {
    await this.signOutHandler.execute(request.refreshToken);
  }

  @Post('verify-email')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async verifyEmail(
    @CurrentPrincipal() principal: Principal,
    @Body(body(verifyEmailRequestSchema)) request: VerifyEmailRequest,
  ): Promise<MeResponse> {
    unwrap(await this.verifyEmailHandler.execute({ userId: principal.userId, code: request.code }));
    return unwrap(await this.accounts.getMe(principal.userId));
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  async resendVerification(@CurrentPrincipal() principal: Principal): Promise<void> {
    unwrap(await this.resendHandler.execute(principal.userId));
  }

  private async withMe(signedIn: SignedIn): Promise<AuthResponse> {
    return { tokens: signedIn.tokens, me: unwrap(await this.accounts.getMe(signedIn.userId)) };
  }
}
