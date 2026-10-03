import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ErrorCode,
  signInRequestSchema,
  signUpRequestSchema,
  webRefreshRequestSchema,
  type SignInRequest,
  type SignUpRequest,
  type WebAuthResponse,
  type WebRefreshRequest,
} from '@rt/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../../../config/env.js';
import type { Clock } from '../../../../platform/clock.js';
import { ClientIp } from '../../../../platform/http/client-ip.decorator.js';
import { DeviceLabel } from '../../../../platform/http/device-label.js';
import { ProblemException, unwrap } from '../../../../platform/http/problem.js';
import {
  clearedRefreshCookie,
  readCookie,
  REFRESH_COOKIE,
  refreshCookie,
} from '../../../../platform/http/web-session-cookie.js';
import { WebOriginGuard } from '../../../../platform/http/web-origin.guard.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import { PLATFORM } from '../../../../platform/platform.tokens.js';
import type { AccountsFacade } from '../../../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../../../accounts/application/accounts.tokens.js';
import { IDENTITY } from '../../application/identity.tokens.js';
import type { RefreshSessionHandler } from '../../application/refresh-session.handler.js';
import type { SignInHandler } from '../../application/sign-in.handler.js';
import type { SignOutHandler } from '../../application/sign-out.handler.js';
import type { SignedIn, SignUpHandler } from '../../application/sign-up.handler.js';

/**
 * The browser versions of sign-up, sign-in, refresh and sign-out (ADR-024). Same
 * handlers and rules as the app's endpoints; only how the refresh token travels differs.
 */
@Controller('v1/auth/web')
@UseGuards(WebOriginGuard)
export class WebAuthController {
  constructor(
    @Inject(IDENTITY.SignUp) private readonly signUpHandler: SignUpHandler,
    @Inject(IDENTITY.SignIn) private readonly signInHandler: SignInHandler,
    @Inject(IDENTITY.RefreshSession) private readonly refreshHandler: RefreshSessionHandler,
    @Inject(IDENTITY.SignOut) private readonly signOutHandler: SignOutHandler,
    @Inject(ACCOUNTS.Facade) private readonly accounts: AccountsFacade,
    @Inject(PLATFORM.Config) private readonly config: AppConfig,
    @Inject(PLATFORM.Clock) private readonly clock: Clock,
  ) {}

  @Post('sign-up')
  @HttpCode(201)
  async signUp(
    @Body(body(signUpRequestSchema)) request: SignUpRequest,
    @ClientIp() ip: string,
    @DeviceLabel() deviceLabel: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<WebAuthResponse> {
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
    return this.respond(signedIn, reply);
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(body(signInRequestSchema)) request: SignInRequest,
    @ClientIp() ip: string,
    @DeviceLabel() deviceLabel: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<WebAuthResponse> {
    return this.respond(
      unwrap(await this.signInHandler.execute({ ...request, ip, deviceLabel })),
      reply,
    );
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(body(webRefreshRequestSchema)) request: WebRefreshRequest,
    @Req() http: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<WebAuthResponse> {
    const refreshToken = readCookie(http.headers.cookie, REFRESH_COOKIE);
    if (!refreshToken) {
      throw ProblemException.fromCode(ErrorCode.Unauthenticated, 'Sign in to continue.');
    }
    const refreshed = await this.refreshHandler.execute({
      refreshToken,
      deviceId: request.deviceId,
    });
    if (!refreshed.ok) {
      // A refused cookie will never work again; drop it so the browser stops sending it.
      void reply.header('set-cookie', clearedRefreshCookie(this.cookieOptions()));
    }
    return this.respond(unwrap(refreshed), reply);
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() http: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    const refreshToken = readCookie(http.headers.cookie, REFRESH_COOKIE);
    if (refreshToken) await this.signOutHandler.execute(refreshToken);
    void reply.header('set-cookie', clearedRefreshCookie(this.cookieOptions()));
  }

  private async respond(signedIn: SignedIn, reply: FastifyReply): Promise<WebAuthResponse> {
    const { tokens } = signedIn;
    void reply.header(
      'set-cookie',
      refreshCookie(
        tokens.refreshToken,
        new Date(tokens.refreshTokenExpiresAt),
        this.clock.now(),
        this.cookieOptions(),
      ),
    );
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      me: unwrap(await this.accounts.getMe(signedIn.userId)),
    };
  }

  private cookieOptions() {
    return { secure: this.config.WEB_COOKIE_SECURE };
  }
}
