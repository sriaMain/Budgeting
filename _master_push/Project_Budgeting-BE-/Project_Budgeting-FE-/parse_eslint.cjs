const fs = require('fs');
const content = fs.readFileSync('eslint_report.json', 'utf16le');
const data = JSON.parse(content);
const errors = data[0].messages.filter(m => m.severity === 2);
console.log(errors.map(m => `Line ${m.line}: ${m.message}`).join('\n'));
