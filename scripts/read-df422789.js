const fs = require('fs');
const path = require('path');
const file = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\df422789-d83b-4069-bbf7-6e8c761a08a2\\.system_generated\\logs\\transcript.jsonl';

if (fs.existsSync(file)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    try {
      const obj = JSON.parse(l);
      if (obj.type === 'USER_INPUT') {
        console.log(`\n--- [LINE ${i}] USER_INPUT ---`);
        console.log(obj.content);
      } else if (obj.type === 'PLANNER_RESPONSE' && obj.content) {
        console.log(`\n--- [LINE ${i}] PLANNER_RESPONSE ---`);
        console.log(obj.content.slice(0, 500));
      }
    } catch(e) {}
  }
}
