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

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : toolStages,
  thresholds: isSmoke ? smokeThresholds : toolThresholds,
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:3000';

// Test tool calls - these should match tools registered in the application
const testToolCalls = [
  { toolName: 'get-time', parameters: {} },
  { toolName: 'echo', parameters: { message: 'load test message' } },
];

export default function () {
  let callId = 0;
  let callStartTime = 0;
  let toolsExecuted = 0;
  let toolsSuccessful = 0;
  let isConnected = false;

  const res = ws.connect(BASE_URL, {}, function (socket) {
    socket.on('open', function () {
      isConnected = true;
    });

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);

        if (Array.isArray(message) && message.length >= 2) {
          const [eventName, eventData] = message;

          if (eventName === 'connected' || eventName === 'session_created') {
            // Start executing tools
            executeNextTool(socket);
          }

          if (eventName === 'tool_result') {
            toolsExecuted++;
            wsToolCallCount.add(1);

            const executionTime = Date.now() - callStartTime;
            wsToolExecution.add(executionTime);

            if (eventData && eventData.result && eventData.result.success) {
              toolsSuccessful++;
              wsToolSuccess.add(1);
            } else {
              wsToolSuccess.add(0);
            }

            // Execute next tool or close
            if (toolsExecuted < 3) {
              sleep(0.2);
              executeNextTool(socket);
            }
          }

          if (eventName === 'error') {
            wsErrors.add(1);
            wsToolSuccess.add(0);
          }
        }
      } catch (e) {
        // Not JSON
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
    });

    function executeNextTool(socket) {
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
