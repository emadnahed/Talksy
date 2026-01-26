import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { streamingStages, smokeStages } from '../config/stages.js';
import { streamingThresholds, smokeThresholds } from '../config/thresholds.js';
import {
  wsStreamStart,
  wsStreamComplete,
  wsStreamSuccess,
  wsChunkCount,
  wsErrors,
} from '../utils/metrics.js';

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : streamingStages,
  thresholds: isSmoke ? smokeThresholds : streamingThresholds,
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:3000';

export default function () {
  let streamStartTime = 0;
  let streamStarted = false;
  let streamCompleted = false;
  let chunksReceived = 0;

  const res = ws.connect(BASE_URL, {}, function (socket) {
    socket.on('open', function () {
      // Connected
    });

    socket.on('message', function (data) {
      try {
        const message = JSON.parse(data);

        if (Array.isArray(message) && message.length >= 2) {
          const [eventName] = message;

          if (eventName === 'connected' || eventName === 'session_created') {
            // Send streaming message
            streamStartTime = Date.now();
            const payload = JSON.stringify(['user_message_stream', { text: 'Tell me a story' }]);
            socket.send('42' + payload);
          }

          if (eventName === 'stream_start') {
            streamStarted = true;
            wsStreamStart.add(Date.now() - streamStartTime);
          }

          if (eventName === 'stream_chunk') {
            chunksReceived++;
            wsChunkCount.add(1);
          }

          if (eventName === 'stream_end') {
            streamCompleted = true;
            wsStreamComplete.add(Date.now() - streamStartTime);
            wsStreamSuccess.add(1);
            socket.close();
          }

          if (eventName === 'error') {
            wsErrors.add(1);
            wsStreamSuccess.add(0);
          }
        }
      } catch (e) {
        // Not JSON
      }
    });

    socket.on('error', function (e) {
      wsErrors.add(1);
      wsStreamSuccess.add(0);
    });

    // Timeout for streaming
    socket.setTimeout(function () {
      if (!streamCompleted) {
        wsStreamSuccess.add(0);
      }

      check(streamStarted, {
        'stream started': (r) => r === true,
      });

      check(chunksReceived, {
        'received stream chunks': (r) => r > 0,
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
    'test/k6/results/streaming-summary.json': JSON.stringify(data),
  };
}
