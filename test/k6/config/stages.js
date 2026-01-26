/**
 * Load test stage configurations
 * Defines ramping patterns for different test scenarios
 */

export const connectionStages = [
  { duration: '1m', target: 50 },   // Ramp up to 50 users
  { duration: '2m', target: 100 },  // Ramp up to 100 users
  { duration: '2m', target: 200 },  // Ramp up to 200 users
  { duration: '1m', target: 0 },    // Ramp down
];

export const messageStages = [
  { duration: '1m', target: 25 },   // Ramp up to 25 users
  { duration: '3m', target: 50 },   // Hold at 50 users
  { duration: '2m', target: 50 },   // Sustained load
  { duration: '2m', target: 0 },    // Ramp down
];

export const streamingStages = [
  { duration: '1m', target: 10 },   // Ramp up to 10 users
  { duration: '2m', target: 20 },   // Ramp up to 20 users
  { duration: '1m', target: 0 },    // Ramp down
];

export const toolStages = [
  { duration: '1m', target: 15 },   // Ramp up to 15 users
  { duration: '2m', target: 30 },   // Ramp up to 30 users
  { duration: '2m', target: 0 },    // Ramp down
];

export const rateLimitStages = [
  { duration: '30s', target: 50 },  // Quick burst to 50 users
  { duration: '30s', target: 50 },  // Hold
];

export const smokeStages = [
  { duration: '30s', target: 5 },   // Light load
];
