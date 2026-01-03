/**
 * Tool system default configuration values
 */
export const TOOL_DEFAULTS = {
  /** Default execution timeout in milliseconds */
  EXECUTION_TIMEOUT_MS: 30000,
  /** Maximum number of concurrent tool executions per session */
  MAX_CONCURRENT_EXECUTIONS: 5,
  /** Maximum parameter size in bytes */
  MAX_PARAMETER_SIZE: 1024 * 1024, // 1MB
  /** Default tool version */
  DEFAULT_VERSION: '1.0.0',
} as const;

/**
 * Tool registry event names
 */
export const TOOL_EVENTS = {
  TOOL_REGISTERED: 'tool.registered',
  TOOL_UNREGISTERED: 'tool.unregistered',
  TOOL_EXECUTION_STARTED: 'tool.execution.started',
  TOOL_EXECUTION_COMPLETED: 'tool.execution.completed',
  TOOL_EXECUTION_FAILED: 'tool.execution.failed',
} as const;
