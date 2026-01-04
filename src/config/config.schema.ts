import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),
  // AI Provider configuration
  AI_PROVIDER: Joi.string().valid('mock', 'openai').default('mock'),
  AI_MOCK_RESPONSE_DELAY_MS: Joi.number().default(500),
  OPENAI_API_KEY: Joi.string().optional(),
  OPENAI_MODEL: Joi.string().default('gpt-3.5-turbo'),
  OPENAI_MAX_TOKENS: Joi.number().default(1000),
  OPENAI_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),
  // Session configuration
  SESSION_TTL_MS: Joi.number().default(900000), // 15 minutes
  SESSION_MAX_HISTORY: Joi.number().default(100),
  SESSION_CLEANUP_INTERVAL_MS: Joi.number().default(60000), // 1 minute
  SESSION_DISCONNECT_GRACE_MS: Joi.number().default(300000), // 5 minutes

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_KEY_PREFIX: Joi.string().default('talksy:'),

  // Authentication configuration
  AUTH_ENABLED: Joi.boolean().default(true),
  API_KEYS: Joi.string().allow('').optional(), // Comma-separated list of valid API keys
  AUTH_BYPASS_IN_DEV: Joi.boolean().default(true),

  // Rate limiting configuration
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(10),

  // Logging configuration
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),
  LOG_FORMAT: Joi.string().valid('json', 'text').default('json'),
  LOG_WS_EVENTS: Joi.boolean().default(true),
  LOG_HTTP_REQUESTS: Joi.boolean().default(true),
});
