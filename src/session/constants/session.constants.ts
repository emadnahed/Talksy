export const SESSION_DEFAULTS = {
  TTL_MS: 900000, // 15 minutes
  MAX_HISTORY_LENGTH: 100,
  CLEANUP_INTERVAL_MS: 60000, // 1 minute
  DISCONNECT_GRACE_MS: 300000, // 5 minutes
} as const;

export const SESSION_EVENTS = {
  SESSION_CREATED: 'session_created',
  SESSION_RESTORED: 'session_restored',
  SESSION_EXPIRED: 'session_expired',
  SESSION_DESTROYED: 'session_destroyed',
} as const;
