import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { toolStages, smokeStages } from '../config/stages.js';
import { toolThresholds, smokeThresholds } from '../config/thresholds.js';
import {
  wsToolExecution,
  wsToolSuccess,
  wsToolCallCount,
  wsErrors,
} from '../utils/metrics.js';
import { getEnvConfig } from '../config/environments.js';

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : toolStages,
  thresholds: isSmoke ? smokeThresholds : toolThresholds,
};

const config = getEnvConfig(__ENV.ENV);

// Test tool calls - these should match tools registered in the application
const testToolCalls = [
  { toolName: 'get-time', parameters: {} },
  { toolName: 'echo', parameters: { message: 'load test message' } },
];

/**
 * Parse Socket.IO Engine.IO packet
 */
function parseSocketIOMessage(data) {
  if (!data || data.length === 0) return null;

  const packetType = data.charAt(0);
  const payload = data.substring(1);

  return {
    engineType: packetType,
    payload,
    socketType: packetType === '4' && payload.length > 0 ? payload.charAt(0) : null,
    socketPayload: packetType === '4' && payload.length > 1 ? payload.substring(1) : null,
  };
}

export default function () {
  let callId = 0;
  let callStartTime = 0;
  let toolsExecuted = 0;
  let toolsSuccessful = 0;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    function executeNextTool() {
      const toolCall = testToolCalls[callId % testToolCalls.length];
      const currentCallId = `k6-${__VU}-${callId}`;

      callStartTime = Date.now();

      const payload = JSON.stringify(['call_tool', {
        toolName: toolCall.toolName,
        parameters: toolCall.parameters,
        callId: currentCallId,
      }]);
      socket.send('42' + payload);

      callId++;
    }

    socket.on('message', function (data) {
      const packet = parseSocketIOMessage(data);
      if (!packet) return;

      switch (packet.engineType) {
        case '0': // Open - server sends session info
          socket.send('40'); // Connect to default namespace
          break;

        case '2': // Ping - respond with pong
          socket.send('3');
          break;

        case '4': // Message - contains Socket.IO packet
          switch (packet.socketType) {
            case '0': // Connected to namespace
              break;

            case '2': // Event
              try {
                const eventData = JSON.parse(packet.socketPayload);
                if (Array.isArray(eventData) && eventData.length >= 1) {
                  const [eventName, data] = eventData;

                  if (eventName === 'connected' || eventName === 'session_created') {
                    // Start executing tools
                    executeNextTool();
                  }

                  if (eventName === 'tool_result') {
                    toolsExecuted++;
                    wsToolCallCount.add(1);

                    const executionTime = Date.now() - callStartTime;
                    wsToolExecution.add(executionTime);

                    if (data && data.result && data.result.success) {
                      toolsSuccessful++;
                      wsToolSuccess.add(1);
                    } else {
                      wsToolSuccess.add(0);
                    }

                    // Execute next tool or close
                    if (toolsExecuted < 3) {
                      sleep(0.2);
                      executeNextTool();
                    }
                  }

                  if (eventName === 'error') {
                    wsErrors.add(1);
                    wsToolSuccess.add(0);
                  }
                }
              } catch (e) {
                // JSON parse error
              }
              break;
          }
          break;
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
    });

    // Timeout
    socket.setTimeout(function () {
      check(toolsExecuted, {
        'tools were executed': (r) => r > 0,
      });

      socket.close();
    }, 30000);
  });

  check(res, {
    'connection established': (r) => r && r.status === 101,
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'test/k6/results/tool-execution-summary.json': JSON.stringify(data),
  };
}
