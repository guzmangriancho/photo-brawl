const fs = require('node:fs');
fs.mkdirSync('server/runtime',{recursive:true});
fs.writeFileSync('server/runtime/package.json', '{"type":"commonjs"}\n');
