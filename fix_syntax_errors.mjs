import fs from 'fs/promises';
import path from 'path';

async function processDirectory(dir) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      await processDirectory(fullPath);
    } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
      let content = await fs.readFile(fullPath, 'utf-8');
      
      let modified = false;
      
      // Fix the nested backtick issue: `${...}`` -> ${...}
      const p1 = /`\${typeof window !== 'undefined' \? window\.location\.origin \+ '\/api' : 'http:\/\/localhost:3001\/api'}`/g;
      if (p1.test(content)) {
          content = content.replace(p1, "${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}");
          modified = true;
      }

      const p2 = /`\${typeof window !== 'undefined' \? window\.location\.origin : 'http:\/\/localhost:3001'}`/g;
      if (p2.test(content)) {
          content = content.replace(p2, "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'}");
          modified = true;
      }
      
      if (modified) {
        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`Fixed ${fullPath}`);
      }
    }
  }
}

processDirectory('./src').then(() => console.log('Done')).catch(console.error);
