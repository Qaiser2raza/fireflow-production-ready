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
      
      // We want to replace the previously added complex template string with a simpler origin-based one
      // Previous: `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/api`
      
      let modified = false;
      
      const searchPattern = /`http:\/\/\${typeof window !== 'undefined' \? window\.location\.hostname : 'localhost'}:3001\/api`/g;
      if (searchPattern.test(content)) {
          content = content.replace(searchPattern, "(typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api')");
          modified = true;
      }

      // Also handle cases without /api at the end for socket
      const socketPattern = /`http:\/\/\${typeof window !== 'undefined' \? window\.location\.hostname : 'localhost'}:3001`/g;
      if (socketPattern.test(content)) {
          content = content.replace(socketPattern, "(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')");
          modified = true;
      }
      
      if (modified) {
        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory('./src').then(() => console.log('Done')).catch(console.error);
