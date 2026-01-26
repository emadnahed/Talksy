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
import { getEnvConfig } from '../config/environments.js';

const isSmoke = __ENV.SMOKE === 'true';

export const options = {
  stages: isSmoke ? smokeStages : streamingStages,
  thresholds: isSmoke ? smokeThresholds : streamingThresholds,
};

const config = getEnvConfig(__ENV.ENV);

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
  let streamStartTime = 0;
  let streamStarted = false;
  let streamCompleted = false;
  let chunksReceived = 0;

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
                  const [eventName] = eventData;

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
                // JSON parse error
              }
              break;
          }
          break;
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
