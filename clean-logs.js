const fs = require('fs');

const files = [
  'src/app/services/quran.service.ts',
  'src/app/components/quran/quran-reader/quran-reader.component.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove commented console.log lines
  content = content.replace(/^\s*\/\/+\s*console\.(log|warn|error).*$/gm, '');
  
  // Remove lines with ////console.log.log
  content = content.replace(/^\s*\/\/+console\.log\.log.*$/gm, '');
  
  // Keep essential error logging but remove debug logs
  // Remove lines that start with //console.log.
  content = content.replace(/^\s*\/\/console\.(log|warn).*$/gm, '');
  
  // Remove empty comment lines left behind
  content = content.replace(/^\s*\/\/\s*$/gm, '');
  
  // Remove multiple consecutive blank lines
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  fs.writeFileSync(file, content);
  console.log(`✅ Cleaned ${file}`);
});

console.log('✨ All console logs cleaned!');

