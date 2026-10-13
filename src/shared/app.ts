// Project name and environment variable names in one place, shared by the server, the CLI and
// the dashboard. Must stay free of Node.js imports so the browser bundle can use it.

export const APP_NAME = 'pixel-radar';

/** Prefix for server and CLI log lines. */
export const LOG_PREFIX = `[${APP_NAME}]`;

export const ENV = {
  password: 'PIXEL_RADAR_PASSWORD',
  sessionSecret: 'PIXEL_RADAR_SESSION_SECRET',
  config: 'PIXEL_RADAR_CONFIG',
  host: 'HOST',
  port: 'PORT',
  trustProxy: 'TRUST_PROXY',
} as const;
