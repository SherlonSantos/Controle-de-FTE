const XLSX = require('xlsx');
const workbook = XLSX.readFile('C:\\Users\\sherlon.santos\\Downloads\\CC_X_Contrato_com_codigo.xlsx');
const sheetName = workbook.SheetNames[0];
const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
console.log(JSON.stringify(data.slice(0, 10), null, 2));
