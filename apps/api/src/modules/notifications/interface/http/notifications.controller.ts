import { Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { notificationsQuerySchema, type NotificationPage } from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type {
  ListNotificationsQuery,
  MarkNotificationsReadHandler,
  UnreadCountQuery,
} from '../../application/inbox.js';
import { NOTIFICATIONS } from '../../application/notifications.js';

@Controller('v1/me/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATIONS.List) private readonly list: ListNotificationsQuery,
    @Inject(NOTIFICATIONS.Unread) private readonly unreadCount: UnreadCountQuery,
    @Inject(NOTIFICATIONS.MarkRead) private readonly markRead: MarkNotificationsReadHandler,
  ) {}

  @Get()
  page(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(notificationsQuerySchema))
    query: z.infer<typeof notificationsQuerySchema>,
  ): Promise<NotificationPage> {
    return this.list.execute(principal.userId, query.cursor);
  }

  @Get('unread')
  unread(@CurrentPrincipal() principal: Principal): Promise<{ unread: number }> {
    return this.unreadCount.execute(principal.userId);
  }

  @Post('read')
  @HttpCode(204)
  async read(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.markRead.execute(principal.userId);
  }
}
