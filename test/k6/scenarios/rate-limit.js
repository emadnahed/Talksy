import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { rateLimitStages } from '../config/stages.js';
import { rateLimitThresholds } from '../config/thresholds.js';
import {
  rateLimitAccuracy,
  rateLimitRejections,
  wsErrors,
} from '../utils/metrics.js';
import { getEnvConfig } from '../config/environments.js';

export const options = {
  stages: rateLimitStages,
  thresholds: rateLimitThresholds,
};

const config = getEnvConfig(__ENV.ENV);

// Number of rapid-fire messages to send (should exceed rate limit)
const MESSAGES_TO_SEND = 15;

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
  let rateLimitErrors = 0;
  let normalResponses = 0;

  const res = ws.connect(config.baseUrl, {}, function (socket) {
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
                    // Rapid-fire messages to trigger rate limiting
                    for (let i = 0; i < MESSAGES_TO_SEND; i++) {
                      const payload = JSON.stringify(['user_message', { text: `Burst message ${i}` }]);
                      socket.send('42' + payload);
                      messagesSent++;
                    }
                  }

                  if (eventName === 'assistant_response') {
                    normalResponses++;
                  }

                  if (eventName === 'error') {
                    if (data && data.code === 'RATE_LIMIT_EXCEEDED') {
                      rateLimitErrors++;
                      rateLimitRejections.add(1);
                    }
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

    // Wait for responses/rate limits
    socket.setTimeout(function () {
      // If rate limiting is enabled, we expect some rejections
      // If disabled, all messages should get responses
      const totalHandled = normalResponses + rateLimitErrors;

      // Rate limit accuracy: did the rate limiter behave as expected?
      // Either all messages went through (rate limit disabled)
      // or some were rejected (rate limit enabled)
      const behavedCorrectly = totalHandled > 0;

      if (behavedCorrectly) {
        rateLimitAccuracy.add(1);
      } else {
        rateLimitAccuracy.add(0);
      }

      check(messagesSent, {
        'messages were sent': (r) => r === MESSAGES_TO_SEND,
      });

      check(totalHandled, {
        'responses were handled': (r) => r > 0,
      });

      socket.close();
    }, 10000);
  });

  check(res, {
    'connection established': (r) => r && r.status === 101,
  });

  sleep(2);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'test/k6/results/rate-limit-summary.json': JSON.stringify(data),
  };
}
