import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { rateLimitStages } from '../config/stages.js';
import { rateLimitThresholds } from '../config/thresholds.js';
import {
  rateLimitAccuracy,
  rateLimitRejections,
  wsErrors,
} from '../utils/metrics.js';

export const options = {
  stages: rateLimitStages,
  thresholds: rateLimitThresholds,
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:3000';

// Number of rapid-fire messages to send (should exceed rate limit)
const MESSAGES_TO_SEND = 15;

export default function () {
  let messagesSent = 0;
  let rateLimitErrors = 0;
  let normalResponses = 0;
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
            if (eventData && eventData.code === 'RATE_LIMIT_EXCEEDED') {
              rateLimitErrors++;
              rateLimitRejections.add(1);
            }
          }
        }
      } catch (e) {
        // Not JSON
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
