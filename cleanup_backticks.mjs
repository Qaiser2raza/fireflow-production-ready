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
      
      // Fix: )` -> )
      // Only when it follows a fetch call that we likely modified
      const p1 = /(fetch(?:WithAuth)?\(\s*`\$\{typeof window !== 'undefined' \? window\.location\.origin[^`)]+`\s*\))\s*`/g;
      
      if (p1.test(content)) {
          content = content.replace(p1, '$1');
          modified = true;
      }
      
      if (modified) {
        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`Removed trailing backtick in ${fullPath}`);
      }
    }
  }
}

processDirectory('./src').then(() => console.log('Done')).catch(console.error);
