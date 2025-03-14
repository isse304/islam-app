import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function build() {
  try {
    // Build server TypeScript files
    console.log('Building server TypeScript files...');
    await execAsync('cd server && npm run build');
    
    // Create dist directory if it doesn't exist
    await fs.mkdir('dist', { recursive: true });
    
    // Copy compiled files to the correct location
    console.log('Copying compiled files...');
    await fs.cp('server/dist', 'dist', { recursive: true });
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build(); 