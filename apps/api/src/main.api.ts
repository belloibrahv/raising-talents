import 'reflect-metadata';
import { createApiApp } from './bootstrap/create-api-app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './platform/logging/logger.js';

const config = loadConfig();
const logger = createLogger(config, 'api');

const app = await createApiApp(config, logger);
await app.listen({ port: config.PORT, host: config.HOST });
logger.info({ port: config.PORT }, 'api process listening');
