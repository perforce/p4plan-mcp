#!/usr/bin/env node
// Sets executable permission on dist/main.js after build.
// Uses Node fs so it works cross-platform (no-op on Windows).

const { chmodSync } = require('fs');
const { join } = require('path');

const entry = join(__dirname, '..', 'dist', 'main.js');
chmodSync(entry, 0o755);
