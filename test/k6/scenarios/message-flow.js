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

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : messageStages,
  thresholds: isSmoke ? smokeThresholds : messageThresholds,
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:3000';

const testMessages = [
  'Hello, how are you?',
  'What is the weather like today?',
  'Tell me a short joke',
  'What time is it?',
  'Help me with a task',
];

export default function () {
  let messagesSent = 0;
  let responsesReceived = 0;
  let currentMessageStart = 0;
  let isConnected = false;

  const res = ws.connect(BASE_URL, {}, function (socket) {
    socket.on('open', function () {
      isConnected = true;
    });

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);

        if (Array.isArray(message) && message.length >= 2) {
          const [eventName] = message;

          if (eventName === 'connected' || eventName === 'session_created') {
            // Connection established, start sending messages
            sendNextMessage(socket);
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
              sendNextMessage(socket);
            }
          }

          if (eventName === 'error') {
            wsErrors.add(1);
            wsResponseSuccess.add(0);
          }
        }
      } catch (e) {
        // Not JSON
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
      wsResponseSuccess.add(0);
    });

    function sendNextMessage(socket) {
      const message = testMessages[messagesSent % testMessages.length];
      currentMessageStart = Date.now();

      // Socket.IO message format: 42["event_name", data]
      const payload = JSON.stringify(['user_message', { text: message }]);
      socket.send('42' + payload);

      wsMessageSent.add(Date.now() - currentMessageStart);
      messagesSent++;
    }

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
