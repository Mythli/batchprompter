import fs from 'fs';
import path from 'path';

function findTsFilesRecursive(dir) {
  const results = [];
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results.push(...findTsFilesRecursive(fullPath));
    } else if (dirent.isFile() && (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- Main Logic ---

// Get directory paths from command-line arguments.
// process.argv contains: [ 'node', 'scripts/add-nocheck.js', 'dir1', 'dir2', ... ]
// So we take everything from the 3rd element onwards.
const args = process.argv.slice(2);
const removeFlag = args.includes('--remove');
const directories = args.filter(arg => arg !== '--remove');

// If no directories are provided, show usage instructions and exit.
if (directories.length === 0) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No directories specified.'); // Red text
  console.log('\nUsage: node scripts/add-nocheck.js [--remove] <dir1> <dir2> ...');
  console.log('Example: node scripts/add-nocheck.js src/legacy src/modules');
  console.log('Example (remove): node scripts/add-nocheck.js --remove src/legacy');
  process.exit(1);
}

let filesModified = 0;
let filesScanned = 0;

console.log(`Searching for TypeScript files in: ${directories.join(', ')}`);

// Loop through each directory provided as an argument.
directories.forEach(dir => {
  // Find all .ts and .tsx files recursively.
  const files = findTsFilesRecursive(dir);

  files.forEach(file => {
    filesScanned++;
    try {
      const content = fs.readFileSync(file, 'utf8');

      if (removeFlag) {
        // Remove the comment if it exists at the beginning of the file.
        if (content.trim().startsWith(TS_NOCHECK_COMMENT)) {
          const newContent = content.replace(new RegExp(`^\\s*${TS_NOCHECK_COMMENT}\\r?\\n?`), '');
          fs.writeFileSync(file, newContent, 'utf8');
          console.log(`  -> Removed comment from: ${file}`);
          filesModified++;
        }
      } else {
        // Add the comment if it's not already there.
        if (!content.trim().startsWith(TS_NOCHECK_COMMENT)) {
          const newContent = `${TS_NOCHECK_COMMENT}\n${content}`;
          fs.writeFileSync(file, newContent, 'utf8');
          console.log(`  -> Added comment to: ${file}`);
          filesModified++;
        }
      }
    } catch (err) {
      console.error(`\x1b[31mFailed to process ${file}:\x1b[0m`, err);
    }
  });
});

console.log(`\n\x1b[32m✔ Done.\x1b[0m Scanned ${filesScanned} files. Modified ${filesModified} file(s).`);
