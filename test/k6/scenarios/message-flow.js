import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { messageStages, smokeStages } from '../config/stages.js';
import { messageThresholds, smokeThresholds } from '../config/thresholds.js';
import {
  wsMessageSent,
  wsResponseTime,
  wsResponseSuccess,
  wsMessageCount,
  wsErrors,
} from '../utils/metrics.js';
import { getEnvConfig } from '../config/environments.js';

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : messageStages,
  thresholds: isSmoke ? smokeThresholds : messageThresholds,
};

const config = getEnvConfig(__ENV.ENV);

const testMessages = [
  'Hello, how are you?',
  'What is the weather like today?',
  'Tell me a short joke',
  'What time is it?',
  'Help me with a task',
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
  let messagesSent = 0;
  let responsesReceived = 0;
  let currentMessageStart = 0;
  let namespaceConnected = false;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
    function sendNextMessage() {
      const message = testMessages[messagesSent % testMessages.length];
      currentMessageStart = Date.now();

      // Socket.IO message format: 42["event_name", data]
      const payload = JSON.stringify(['user_message', { text: message }]);
      socket.send('42' + payload);

      wsMessageSent.add(Date.now() - currentMessageStart);
      messagesSent++;
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
              namespaceConnected = true;
              break;

            case '2': // Event
              try {
                const eventData = JSON.parse(packet.socketPayload);
                if (Array.isArray(eventData) && eventData.length >= 1) {
                  const [eventName] = eventData;

                  if (eventName === 'connected' || eventName === 'session_created') {
                    // Connection established, start sending messages
                    sendNextMessage();
                  }

                  if (eventName === 'assistant_response') {
                    responsesReceived++;
                    const responseTime = Date.now() - currentMessageStart;
                    wsResponseTime.add(responseTime);
                    wsResponseSuccess.add(1);
                    wsMessageCount.add(1);

                    // Send next message or close
                    if (messagesSent < 3) {
                      sleep(0.5);
                      sendNextMessage();
                    }
                  }

                  if (eventName === 'error') {
                    wsErrors.add(1);
                    wsResponseSuccess.add(0);
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
      wsResponseSuccess.add(0);
    });

    // Close after timeout
    socket.setTimeout(function () {
      check(responsesReceived, {
        'received responses': (r) => r > 0,
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
    'test/k6/results/message-summary.json': JSON.stringify(data),
  };
}
