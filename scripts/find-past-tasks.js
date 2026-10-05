const fs = require('fs');
const path = require('path');
const base = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain';

['df422789-d83b-4069-bbf7-6e8c761a08a2', '383a20a1-2b4c-48b6-b249-16a46cfa9410'].forEach(id => {
  const p = path.join(base, id, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(p)) {
    console.log(`\n================ ID: ${id} ================`);
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const obj = JSON.parse(l);
        if (obj.type === 'USER_INPUT') {
          console.log('[USER]:', (obj.content || '').slice(0, 300));
        } else if (obj.type === 'PLANNER_RESPONSE' && obj.content) {
          console.log('[ASSISTANT]:', obj.content.slice(0, 200).replace(/\n/g, ' '));
        }
      } catch(e) {}
    }
  }
});
