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
      
      // Fix cases where the starting backtick is missing for fetchWithAuth or fetch
      // fetchWithAuth(${typeof window ...}/...)
      const p1 = /(fetch(?:WithAuth)?\()(\$\{typeof window !== ['"]undefined['"] \? window\.location\.origin(?: \+ ['"]\/api['"])? : ['"]http:\/\/localhost:3001(?:\/api)?['"]\}[^`)]+`?\))/g;
      
      if (p1.test(content)) {
          content = content.replace(p1, (match, p1, p2) => {
              let inner = p2;
              if (!inner.startsWith('`')) inner = '`' + inner;
              if (!inner.endsWith('`')) inner = inner + '`';
              return p1 + inner;
          });
          modified = true;
      }

      // Also fix simple cases that might have been broken
      // fetch(${typeof window ...}/...)
      
      if (modified) {
        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`Fixed syntax in ${fullPath}`);
      }
    }
  }
}

processDirectory('./src').then(() => console.log('Done')).catch(console.error);
