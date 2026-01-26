import { Counter, Rate, Trend } from 'k6/metrics';

// Connection metrics
export const wsConnecting = new Trend('ws_connecting', true);
export const wsConnectSuccess = new Rate('ws_connect_success_rate');
export const wsSessionReceived = new Trend('ws_session_received', true);
export const wsConnectionCount = new Counter('ws_connection_count');

// Message metrics
export const wsMessageSent = new Trend('ws_message_sent', true);
export const wsResponseTime = new Trend('ws_response_time', true);
export const wsResponseSuccess = new Rate('ws_response_success_rate');
export const wsMessageCount = new Counter('ws_message_count');

// Streaming metrics
export const wsStreamStart = new Trend('ws_stream_start', true);
export const wsStreamComplete = new Trend('ws_stream_complete', true);
export const wsStreamSuccess = new Rate('ws_stream_success_rate');
export const wsChunkCount = new Counter('ws_chunk_count');

// Tool metrics
export const wsToolExecution = new Trend('ws_tool_execution', true);
export const wsToolSuccess = new Rate('ws_tool_success_rate');
export const wsToolCallCount = new Counter('ws_tool_call_count');

// Rate limit metrics
export const rateLimitAccuracy = new Rate('rate_limit_accuracy');
export const rateLimitRejections = new Counter('rate_limit_rejections');

// Error metrics
export const wsErrors = new Counter('ws_errors');
export const wsTimeouts = new Counter('ws_timeouts');
