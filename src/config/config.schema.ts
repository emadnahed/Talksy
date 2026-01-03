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
});
