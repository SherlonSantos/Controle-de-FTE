const fs = require('fs');

const apis = [
  'src/app/api/ativos/summary/route.ts',
  'src/app/api/pa/summary/route.ts',
  'src/app/api/forecast/summary/route.ts',
  'src/app/api/financial/summary/route.ts',
  'src/app/api/variacao/summary/route.ts',
  'src/app/api/costcenter/categorize/route.ts'
];

apis.forEach(path => {
    try {
        const content = fs.readFileSync(path, 'utf8');
        const match = content.match(/include:\s*\{([^}]*)\}/);
        console.log("File:", path);
        console.log("Include block:", match ? match[0] : "None found");
    } catch(e) { console.log(e.message); }
});
