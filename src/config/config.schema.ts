import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),
  // AI Provider configuration
  AI_PROVIDER: Joi.string().valid('mock', 'openai', 'groq').default('mock'),
  AI_MOCK_RESPONSE_DELAY_MS: Joi.number().default(500),
  // OpenAI configuration
  OPENAI_API_KEY: Joi.string().optional(),
  OPENAI_MODEL: Joi.string().default('gpt-3.5-turbo'),
  OPENAI_MAX_TOKENS: Joi.number().default(1000),
  OPENAI_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),
  // Groq configuration (free tier: 30 req/min)
  GROQ_API_KEY: Joi.string().optional(),
  GROQ_MODEL: Joi.string().default('llama-3.1-8b-instant'),
  GROQ_MAX_TOKENS: Joi.number().default(1000),
  GROQ_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),
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

  // JWT configuration
  JWT_SECRET: Joi.string().default('dev-secret-change-in-production'),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  BCRYPT_ROUNDS: Joi.number().default(12),

  // Auth cache configuration
  AUTH_CACHE_ENABLED: Joi.boolean().default(true),
  AUTH_CACHE_USER_TTL_MS: Joi.number().default(300000), // 5 minutes
  AUTH_CACHE_USER_MAX_SIZE: Joi.number().default(1000),
  AUTH_CACHE_TOKEN_TTL_MS: Joi.number().default(300000), // 5 minutes
  AUTH_CACHE_TOKEN_MAX_SIZE: Joi.number().default(5000),

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
  LOG_WS_SKIP_HIGH_FREQUENCY: Joi.boolean().default(true), // Skip stream_chunk etc.

  // AI Response Cache configuration
  AI_CACHE_ENABLED: Joi.boolean().default(true),
  AI_CACHE_TTL_MS: Joi.number().default(3600000), // 1 hour
  AI_CACHE_MAX_SIZE: Joi.number().default(500),
});
