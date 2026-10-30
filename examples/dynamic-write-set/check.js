const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, 'out.txt');

try {
  const content = fs.readFileSync(outputPath, 'utf8');
  if (content.trim() === 'swarm ok') {
    process.exitCode = 0;
  } else {
    console.error(`Unexpected out.txt content: ${JSON.stringify(content)}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Unable to read out.txt: ${error.message}`);
  process.exitCode = 1;
}
