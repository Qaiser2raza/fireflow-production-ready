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
      
      // We only care about replacing occurrences on the frontend
      // Exclude files in src/api or src/config that might run backend
      if (fullPath.includes('\\api\\') || fullPath.includes('/api/') || file.name === 'env.ts') continue;
      
      let modified = false;
      
      // Case 1: Already a template string
      if (content.includes('`http://localhost:3001')) {
          content = content.replace(/`http:\/\/localhost:3001/g, '`http://${typeof window !== \'undefined\' ? window.location.hostname : \'localhost\'}:3001');
          modified = true;
      }
      
      // Case 2: Single quotes
      if (content.includes("'http://localhost:3001")) {
          content = content.replace(/'http:\/\/localhost:3001([^']*)'/g, '`http://${typeof window !== \'undefined\' ? window.location.hostname : \'localhost\'}:3001$1`');
          modified = true;
      }

      // Case 3: Double quotes
      if (content.includes('"http://localhost:3001')) {
          content = content.replace(/"http:\/\/localhost:3001([^"]*)"/g, '`http://${typeof window !== \'undefined\' ? window.location.hostname : \'localhost\'}:3001$1`');
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
