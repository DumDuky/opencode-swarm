const { join, dirname } = process.getBuiltinModule('path');
const { spawnSync } = process.getBuiltinModule('child_process');
const __dirname = dirname(process.argv[1]);

const helloPath = join(__dirname, 'hello.js');
const result = spawnSync(process.execPath, [helloPath], { encoding: 'utf8' });

if (result.error) {
  console.error(`FAIL: could not run hello.js: ${result.error.message}`);
  process.exit(1);
}

const output = (result.stdout || '').trim();
if (result.status === 0 && output === 'hello from swarm') {
  console.log('PASS: hello.js output matches');
  process.exit(0);
}

console.error(`FAIL: expected "hello from swarm", got "${output}"`);
process.exit(1);
