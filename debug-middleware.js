// Debug middleware for checking index.html and script loading
const fs = require('fs');
const path = require('path');

function createDebugMiddleware(distPath) {
  return function(req, res, next) {
    // Log every request
    console.log(`[DEBUG] ${new Date().toISOString()} - Request: ${req.method} ${req.url}`);
    console.log(`[DEBUG] Headers: ${JSON.stringify(req.headers)}`);
    
    // For the index page, analyze the HTML
    if (req.url === '/' || req.url === '/index.html') {
      const indexPath = path.join(distPath, 'index.html');
      
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        console.log('\n[DEBUG] index.html exists. Looking for script tags:');
        
        // Extract script tags
        const scriptRegex = /<script.*?src="(.*?)".*?><\/script>/g;
        let match;
        let scriptCount = 0;
        
        while ((match = scriptRegex.exec(indexContent)) !== null) {
          scriptCount++;
          const scriptSrc = match[1];
          console.log(`[DEBUG] Script #${scriptCount}: ${scriptSrc}`);
          
          // Check if the script file exists
          const scriptPath = path.join(distPath, scriptSrc.replace(/^\//, ''));
          if (fs.existsSync(scriptPath)) {
            console.log(`[DEBUG] - Script file exists at: ${scriptPath}`);
            const stats = fs.statSync(scriptPath);
            console.log(`[DEBUG] - Size: ${stats.size} bytes`);
          } else {
            console.log(`[DEBUG] - WARNING: Script file NOT found at: ${scriptPath}`);
          }
        }
        
        if (scriptCount === 0) {
          console.log('[DEBUG] No script tags found in index.html!');
        }
      } else {
        console.log(`[DEBUG] WARNING: index.html not found at ${indexPath}`);
      }
    }
    
    // For JavaScript files, check if they exist
    if (req.url.endsWith('.js')) {
      const jsPath = path.join(distPath, req.url.replace(/^\//, ''));
      if (fs.existsSync(jsPath)) {
        console.log(`[DEBUG] JavaScript file exists: ${jsPath}`);
        const stats = fs.statSync(jsPath);
        console.log(`[DEBUG] - Size: ${stats.size} bytes`);
      } else {
        console.log(`[DEBUG] WARNING: JavaScript file NOT found: ${jsPath}`);
        console.log(`[DEBUG] Current directory contents: ${fs.readdirSync(path.dirname(jsPath)).join(', ')}`);
      }
    }
    
    next();
  };
}

module.exports = createDebugMiddleware; 