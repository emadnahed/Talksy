#!/usr/bin/env node
/**
 * Quick AI Test Script
 * Tests the AI functionality via WebSocket connection
 *
 * Usage: node scripts/test-ai.js [message]
 */

const { io } = require('socket.io-client');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_MESSAGE = process.argv[2] || 'Hello, what can you do?';

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║           Talksy AI Test                                      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
console.log(`Target: ${API_URL}`);
console.log(`Message: "${TEST_MESSAGE}"\n`);

const socket = io(API_URL, {
  transports: ['websocket'],
  timeout: 10000,
});

let responseReceived = false;

socket.on('connect', () => {
  console.log('✓ Connected to server');
  console.log(`  Socket ID: ${socket.id}\n`);

  // Send a message to the AI
  console.log('► Sending message to AI...\n');
  socket.emit('user_message', {
    text: TEST_MESSAGE,
  });
});

socket.on('assistant_response', (response) => {
  responseReceived = true;
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AI Response:');
  console.log('═══════════════════════════════════════════════════════════════');

  // Handle new standard response format
  const data = response.data || response;
  const text = data.text || data.content || JSON.stringify(data);
  console.log(`\n${text}\n`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Show response metadata
  if (response.code) {
    console.log(`\nCode: ${response.code}`);
  }
  if (response.description) {
    console.log(`Description: ${response.description}`);
  }
  if (response.timestamp || data.timestamp) {
    console.log(`Timestamp: ${new Date(response.timestamp || data.timestamp).toISOString()}`);
  }

  console.log('\n✓ AI test completed successfully!\n');
  socket.disconnect();
  process.exit(0);
});

socket.on('assistant_stream_start', () => {
  console.log('► Streaming response started...\n');
});

socket.on('assistant_stream_chunk', (data) => {
  process.stdout.write(data.content || '');
});

socket.on('assistant_stream_end', (data) => {
  responseReceived = true;
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  Stream completed');
  if (data.metadata) {
    console.log(`  Provider: ${data.metadata.provider || 'unknown'}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('✓ AI streaming test completed!\n');
  socket.disconnect();
  process.exit(0);
});

socket.on('error', (error) => {
  console.error('✗ Error:', error.message || error);
  socket.disconnect();
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('✗ Connection failed:', error.message);
  console.log('\nMake sure the server is running: npm run dev\n');
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  if (!responseReceived) {
    console.log(`Disconnected: ${reason}`);
  }
});

// Timeout after 30 seconds
setTimeout(() => {
  if (!responseReceived) {
    console.error('✗ Timeout: No response received within 30 seconds');
    socket.disconnect();
    process.exit(1);
  }
}, 30000);
