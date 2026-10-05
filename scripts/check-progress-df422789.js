const fs = require('fs');
const file = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\df422789-d83b-4069-bbf7-6e8c761a08a2\\.system_generated\\logs\\transcript.jsonl';

const lines = fs.readFileSync(file, 'utf8').split('\n');
console.log('Total lines:', lines.length);

// Find implementation plan or artifacts created
const artifactsDir = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\df422789-d83b-4069-bbf7-6e8c761a08a2';
if (fs.existsSync(artifactsDir)) {
  console.log('Artifacts:', fs.readdirSync(artifactsDir));
}

// Print lines around 90-end
for (let i = 80; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  try {
    const obj = JSON.parse(lines[i]);
    console.log(`[Line ${i}] ${obj.type} - ${obj.source}`);
    if (obj.tool_calls) {
      console.log('  Tool calls:', obj.tool_calls.map(tc => tc.name || tc.toolAction || tc.toolSummary));
    }
    if (obj.type === 'PLANNER_RESPONSE' && obj.content) {
      console.log('  Content:', obj.content.slice(0, 300).replace(/\n/g, ' '));
    }
  } catch(e) {}
}
