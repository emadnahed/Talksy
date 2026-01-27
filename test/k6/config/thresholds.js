/**
 * Performance thresholds for k6 load tests
 * Tests will fail if these thresholds are not met
 */

export const connectionThresholds = {
  ws_connecting: ['p(95)<500'],      // 95% of connections within 500ms
  ws_connect_success_rate: ['rate>0.99'],  // 99% connection success rate
  ws_session_received: ['p(95)<1000'], // 95% receive session within 1s
};

export const messageThresholds = {
  ws_message_sent: ['p(95)<100'],     // 95% of messages sent within 100ms
  ws_response_time: ['p(95)<2000'],   // 95% of responses within 2s
  ws_response_success_rate: ['rate>0.95'], // 95% response success rate
};

export const streamingThresholds = {
  ws_stream_start: ['p(95)<500'],     // 95% stream starts within 500ms
  ws_stream_complete: ['p(95)<5000'], // 95% streams complete within 5s
  ws_stream_success_rate: ['rate>0.95'], // 95% streaming success rate
};

export const toolThresholds = {
  ws_tool_execution: ['p(95)<3000'],  // 95% tool executions within 3s
  ws_tool_success_rate: ['rate>0.95'], // 95% tool execution success rate
};

export const rateLimitThresholds = {
  rate_limit_accuracy: ['rate>0.95'], // 95% rate limit accuracy
};

export const smokeThresholds = {
  ws_connecting: ['p(95)<1000'],
  ws_response_time: ['p(95)<3000'],
};

// Auth Cache thresholds
export const authCacheThresholds = {
  // Overall auth request performance
  auth_request_duration: ['p(95)<200', 'p(99)<500'],

  // Cache performance - warm requests should be very fast
  auth_cold_request_duration: ['p(95)<300'],   // Cold (cache miss) within 300ms
  auth_warm_request_duration: ['p(95)<50'],    // Warm (cache hit) within 50ms

  // Token validation should be fast due to caching
  token_validation_duration: ['p(95)<100'],

  // User lookup should benefit from cache
  user_lookup_duration: ['p(95)<100'],

  // Cache hit rate should be high after warmup
  auth_cache_hit_rate: ['rate>0.80'],  // 80%+ cache hit rate
};

// Combined auth thresholds for full auth tests
export const authFullThresholds = {
  ...authCacheThresholds,
  // Registration is slower (bcrypt hashing)
  http_req_duration: ['p(95)<1000'],
  http_req_failed: ['rate<0.01'],
};
