import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().default('*'),
  OPENAI_API_KEY: Joi.string().optional(),
  // Session configuration
  SESSION_TTL_MS: Joi.number().default(900000), // 15 minutes
  SESSION_MAX_HISTORY: Joi.number().default(100),
  SESSION_CLEANUP_INTERVAL_MS: Joi.number().default(60000), // 1 minute
  SESSION_DISCONNECT_GRACE_MS: Joi.number().default(300000), // 5 minutes
});
