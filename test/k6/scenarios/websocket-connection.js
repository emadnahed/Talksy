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
import { getEnvConfig } from '../config/environments.js';

// Use smoke stages for quick tests, connection stages for full tests
const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : connectionStages,
  thresholds: isSmoke ? smokeThresholds : connectionThresholds,
};

const config = getEnvConfig(__ENV.ENV);

/**
 * Parse Socket.IO Engine.IO packet
 * Packet format: <packet_type>[data]
 * - 0: open (server sends session info)
 * - 2: ping (server sends, client responds with 3)
 * - 3: pong
 * - 4: message (contains Socket.IO packet)
 *
 * Socket.IO packet format (after 4): <packet_type>[data]
 * - 0: connect
 * - 2: event (followed by JSON array)
 */
function parseSocketIOMessage(data) {
  if (!data || data.length === 0) return null;

  const packetType = data.charAt(0);
  const payload = data.substring(1);

  return {
    engineType: packetType,
    payload,
    // For message packets (4), extract Socket.IO packet type
    socketType: packetType === '4' && payload.length > 0 ? payload.charAt(0) : null,
    socketPayload: packetType === '4' && payload.length > 1 ? payload.substring(1) : null,
  };
}

export default function () {
  const startTime = Date.now();
  let sessionReceived = false;
  let connectionSuccessful = false;
  let namespaceConnected = false;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    const connectTime = Date.now() - startTime;
    wsConnecting.add(connectTime);
    wsConnectionCount.add(1);

    socket.on('open', function () {
      connectionSuccessful = true;
      wsConnectSuccess.add(1);
    });

    socket.on('message', function (data) {
      const packet = parseSocketIOMessage(data);
      if (!packet) return;

      // Handle Engine.IO packets
      switch (packet.engineType) {
        case '0': // Open - server sends session info
          // Send Socket.IO connect to default namespace
          socket.send('40');
          break;

        case '2': // Ping - respond with pong
          socket.send('3');
          break;

        case '4': // Message - contains Socket.IO packet
          // Handle Socket.IO packets
          switch (packet.socketType) {
            case '0': // Connected to namespace
              namespaceConnected = true;
              break;

            case '2': // Event
              try {
                const eventData = JSON.parse(packet.socketPayload);
                if (Array.isArray(eventData) && eventData.length >= 1) {
                  const [eventName] = eventData;
                  if (eventName === 'connected' || eventName === 'session_created') {
                    sessionReceived = true;
                    wsSessionReceived.add(Date.now() - startTime);
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
