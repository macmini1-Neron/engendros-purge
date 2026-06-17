#!/usr/bin/env node

const { startStandaloneRelay } = require('./lan-relay.js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

const port = Number(process.env.PORT || arg('--port') || 8787);
const host = process.env.HOST || arg('--host') || '0.0.0.0';

startStandaloneRelay({ host, port });
