import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { connectionStages, smokeStages } from '../config/stages.js';
import { connectionThresholds, smokeThresholds } from '../config/thresholds.js';
import {
  wsConnecting,
  wsConnectSuccess,
  wsSessionReceived,
  wsConnectionCount,
  wsErrors,
} from '../utils/metrics.js';

// Use smoke stages for quick tests, connection stages for full tests
const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : connectionStages,
  thresholds: isSmoke ? smokeThresholds : connectionThresholds,
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:3000';

export default function () {
  const startTime = Date.now();
  let sessionReceived = false;
  let connectionSuccessful = false;

  const res = ws.connect(BASE_URL, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnecting.add(connectTime);
    wsConnectionCount.add(1);

    socket.on('open', function () {
      connectionSuccessful = true;
      wsConnectSuccess.add(1);
    });

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);

        // Handle Socket.IO protocol messages
        if (typeof message === 'number') {
          // Socket.IO handshake
          return;
        }

        // Handle Socket.IO event format: ["event_name", data]
        if (Array.isArray(message) && message.length >= 2) {
          const [eventName, eventData] = message;

          if (eventName === 'connected' || eventName === 'session_created') {
            sessionReceived = true;
            wsSessionReceived.add(Date.now() - startTime);
          }
        }
      } catch (e) {
        // Not JSON, might be Socket.IO protocol
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
      wsConnectSuccess.add(0);
    });

    // Wait for session events
    socket.setTimeout(function () {
      check(sessionReceived, {
        'received session event': (r) => r === true,
      });

      socket.close();
    }, 5000);
  });

  check(res, {
    'connection status is 101': (r) => r && r.status === 101,
  });

  if (!connectionSuccessful) {
    wsConnectSuccess.add(0);
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'test/k6/results/connection-summary.json': JSON.stringify(data),
  };
}
