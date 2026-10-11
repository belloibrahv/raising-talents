import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  cursorQuerySchema,
  searchAgentsQuerySchema,
  type AgentPage,
  type PublicAgentProfile,
  type SavedAgentState,
  type SearchAgentsQuery,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  AGENT_DIRECTORY,
  type GetAgentQuery,
  type ListSavedAgentsQuery,
  type SaveAgentHandler,
  type SearchAgentsHandler,
  type UnsaveAgentHandler,
} from '../../application/agent-directory.use-cases.js';

/** Verified agents as other members find them, and the agents a talent saved (ADR-049). */
@Controller('v1')
@UseGuards(AuthGuard)
export class AgentDirectoryController {
  constructor(
    @Inject(AGENT_DIRECTORY.Search) private readonly searchAgents: SearchAgentsHandler,
    @Inject(AGENT_DIRECTORY.Get) private readonly getAgent: GetAgentQuery,
    @Inject(AGENT_DIRECTORY.Save) private readonly saveAgent: SaveAgentHandler,
    @Inject(AGENT_DIRECTORY.Unsave) private readonly unsaveAgent: UnsaveAgentHandler,
    @Inject(AGENT_DIRECTORY.ListSaved) private readonly listSaved: ListSavedAgentsQuery,
  ) {}

  @Get('agents')
  async search(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(searchAgentsQuerySchema)) query: SearchAgentsQuery,
  ): Promise<AgentPage> {
    return unwrap(await this.searchAgents.execute(principal.userId, query));
  }

  @Get('agents/:id')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicAgentProfile> {
    return unwrap(await this.getAgent.execute(principal.userId, id));
  }

  @Put('agents/:id/saved')
  async save(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SavedAgentState> {
    return unwrap(await this.saveAgent.execute(principal.userId, id));
  }

  @Delete('agents/:id/saved')
  async unsave(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SavedAgentState> {
    return unwrap(await this.unsaveAgent.execute(principal.userId, id));
  }

  @Get('me/saved-agents')
  async saved(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: z.infer<typeof cursorQuerySchema>,
  ): Promise<AgentPage> {
    return unwrap(await this.listSaved.execute(principal.userId, query.cursor));
  }
}
