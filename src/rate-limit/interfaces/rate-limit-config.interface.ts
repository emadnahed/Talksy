export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  enabled: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}
