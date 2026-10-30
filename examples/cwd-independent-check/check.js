'use strict';

/*
 * Validates that out.txt (next to this script) contains exactly "swarm ok"
 * after trimming.
 *
 * Notes:
 *  - out.txt is resolved relative to this file's own directory, never
 *    relative to process.cwd(), so the check passes from any working dir.
 *  - This file is written to run both as CommonJS and as an ES module:
 *    the repo root package.json declares "type": "module", while a copy of
 *    this file placed outside the repo defaults to CommonJS. Only dynamic
 *    import() is used, which works in both modes, and the script directory
 *    is taken from process.argv[1] (absolute, cwd-independent) instead of
 *    __dirname / import.meta.url (each of which is unavailable in one mode).
 *
 * Exit codes: 0 = out.txt trimmed content is "swarm ok"; 1 = anything else,
 * including read errors.
 */

async function main() {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    process.stderr.write(
      'check failed: cannot determine this script\'s directory (run it with `node <path>/check.js`)\n'
    );
    process.exitCode = 1;
    return;
  }
  const scriptDir = path.dirname(scriptPath);

  const target = path.join(scriptDir, 'out.txt');

  let content;
  try {
    content = fs.readFileSync(target, 'utf8');
  } catch (err) {
    process.stderr.write(
      'check failed: cannot read ' + target + ': ' + err.message + '\n'
    );
    process.exitCode = 1;
    return;
  }

  const trimmed = content.trim();

  if (trimmed === 'swarm ok') {
    process.stdout.write('ok: ' + target + ' contains "swarm ok"\n');
    process.exitCode = 0;
    return;
  }

  process.stderr.write(
    'check failed: ' +
      target +
      ' must contain "swarm ok" (after trim), got ' +
      JSON.stringify(trimmed) +
      '\n'
  );
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(
    'check failed: ' + (err && err.stack ? err.stack : String(err)) + '\n'
  );
  process.exitCode = 1;
});
