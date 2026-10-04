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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  contactResponseSchema,
  conversationsQuerySchema,
  messagesQuerySchema,
  requestContactSchema,
  sendMessageSchema,
  type ContactResponse,
  type ConversationPage,
  type ConversationSummary,
  type Message,
  type MessagePage,
  type MessagingUnread,
  type RequestContact,
  type SendMessage,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body, ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  MESSAGING,
  type ConversationWithTalentQuery,
  type BlockConversationHandler,
  type GetConversationQuery,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type MarkConversationReadHandler,
  type MessagingUnreadQuery,
  type RequestContactHandler,
  type RespondToContactHandler,
  type SendMessageHandler,
  type WithdrawContactHandler,
} from '../../application/messaging.use-cases.js';

@Controller('v1')
@UseGuards(AuthGuard)
export class MessagingController {
  constructor(
    @Inject(MESSAGING.RequestContact) private readonly requestContact: RequestContactHandler,
    @Inject(MESSAGING.WithTalent) private readonly withTalent: ConversationWithTalentQuery,
    @Inject(MESSAGING.List) private readonly list: ListConversationsQuery,
    @Inject(MESSAGING.Get) private readonly getOne: GetConversationQuery,
    @Inject(MESSAGING.Messages) private readonly listMessages: ListMessagesQuery,
    @Inject(MESSAGING.Send) private readonly sendMessage: SendMessageHandler,
    @Inject(MESSAGING.Respond) private readonly respondTo: RespondToContactHandler,
    @Inject(MESSAGING.Withdraw) private readonly withdrawRequest: WithdrawContactHandler,
    @Inject(MESSAGING.MarkRead) private readonly markRead: MarkConversationReadHandler,
    @Inject(MESSAGING.Unread) private readonly unreadCount: MessagingUnreadQuery,
    @Inject(MESSAGING.Block) private readonly blocking: BlockConversationHandler,
  ) {}

  @Post('me/conversations/:conversationId/block')
  @HttpCode(200)
  async block(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ): Promise<ConversationSummary> {
    return unwrap(await this.blocking.execute(principal.userId, id, true));
  }

  @Delete('me/conversations/:conversationId/block')
  @HttpCode(200)
  async unblock(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ): Promise<ConversationSummary> {
    return unwrap(await this.blocking.execute(principal.userId, id, false));
  }

  @Post('talents/:handle/contact')
  @HttpCode(201)
  async contact(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
    @Body(body(requestContactSchema)) input: RequestContact,
  ): Promise<ConversationSummary> {
    return unwrap(await this.requestContact.execute(principal.userId, handle, input));
  }

  @Get('me/conversations')
  async page(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(conversationsQuerySchema))
    query: z.infer<typeof conversationsQuerySchema>,
  ): Promise<ConversationPage> {
    return unwrap(await this.list.execute(principal.userId, query.cursor));
  }

  @Get('me/conversations/unread')
  async unread(@CurrentPrincipal() principal: Principal): Promise<MessagingUnread> {
    return this.unreadCount.execute(principal.userId);
  }

  @Get('me/conversations/with/:handle')
  async with(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<ConversationSummary> {
    return unwrap(await this.withTalent.execute(principal.userId, handle));
  }

  @Get('me/conversations/:conversationId')
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ): Promise<ConversationSummary> {
    return unwrap(await this.getOne.execute(principal.userId, id));
  }

  @Get('me/conversations/:conversationId/messages')
  async messages(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: z.infer<typeof messagesQuerySchema>,
  ): Promise<MessagePage> {
    return unwrap(await this.listMessages.execute(principal.userId, id, query.cursor));
  }

  @Post('me/conversations/:conversationId/messages')
  @HttpCode(201)
  async send(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(body(sendMessageSchema)) input: SendMessage,
  ): Promise<Message> {
    return unwrap(await this.sendMessage.execute(principal.userId, id, input));
  }

  @Post('me/conversations/:conversationId/response')
  @HttpCode(200)
  async respond(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
    @Body(body(contactResponseSchema)) input: ContactResponse,
  ): Promise<ConversationSummary> {
    return unwrap(await this.respondTo.execute(principal.userId, id, input.decision === 'accept'));
  }

  @Post('me/conversations/:conversationId/withdraw')
  @HttpCode(200)
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ): Promise<ConversationSummary> {
    return unwrap(await this.withdrawRequest.execute(principal.userId, id));
  }

  @Post('me/conversations/:conversationId/read')
  @HttpCode(204)
  async read(
    @CurrentPrincipal() principal: Principal,
    @Param('conversationId', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.markRead.execute(principal.userId, id));
  }
}
