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
