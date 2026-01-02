export interface SessionConfig {
  ttlMs: number;
  maxHistoryLength: number;
  cleanupIntervalMs: number;
  disconnectGraceMs: number;
}
