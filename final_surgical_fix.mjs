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
      
      // Look for the conditional origin string that is NOT inside backticks but is followed by a path
      const p1 = /(fetch(?:WithAuth)?\()(\$\{typeof window !== ['"]undefined['"] \? window\.location\.origin(?: \+ ['"]\/api['"])? : ['"]http:\/\/localhost:3001(?:\/api)?['"]\})(\/)/g;
      
      if (p1.test(content)) {
          content = content.replace(p1, '$1`$2$3');
          modified = true;
      }
      
      // Also catch cases where it was already wrapped but maybe weirdly (double backticks)
      const p2 = /`+`+\$\{typeof window !== ['"]undefined['"] \? window\.location\.origin/g;
      if (p2.test(content)) {
          content = content.replace(p2, '`${typeof window !== \'undefined\' ? window.location.origin');
          modified = true;
      }

      if (modified) {
        await fs.writeFile(fullPath, content, 'utf-8');
        console.log(`Final Fix applied to ${fullPath}`);
      }
    }
  }
}

processDirectory('./src').then(() => console.log('Done')).catch(console.error);
