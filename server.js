const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const createDebugMiddleware = require('./debug-middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const DIST_PATH = path.join(__dirname, 'dist/islam-app/browser');

// Compress all responses
app.use(compression());

// Use our debug middleware
app.use(createDebugMiddleware(DIST_PATH));

// Add headers for cache control
app.use(function(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Set permissive CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  next();
});

// Explicitly serve JavaScript files with correct MIME type
app.get('*.js', (req, res, next) => {
  const filePath = path.join(DIST_PATH, req.url);
  console.log(`Serving JavaScript file: ${filePath}`);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'application/javascript');
    res.sendFile(filePath);
  } else {
    console.log(`JavaScript file not found: ${filePath}`);
    // Try looking for the file with different path prefixes
    const alternateFilePath = path.join(DIST_PATH, req.url.replace(/^\//, ''));
    if (fs.existsSync(alternateFilePath)) {
      console.log(`Found JavaScript file at alternate path: ${alternateFilePath}`);
      res.set('Content-Type', 'application/javascript');
      res.sendFile(alternateFilePath);
    } else {
      next();
    }
  }
});

// Serve static files from the Angular app with explicit MIME types
app.use(express.static(DIST_PATH, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.set('Content-Type', 'text/css');
    } else if (path.endsWith('.html')) {
      res.set('Content-Type', 'text/html');
    }
  }
}));

// For all GET requests that aren't to static files, serve index.html
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.url);
  // List the directory contents to debug
  console.log('Directory contents:');
  if (fs.existsSync(DIST_PATH)) {
    fs.readdirSync(DIST_PATH).forEach(file => {
      console.log(`- ${file}`);
    });
  } else {
    console.log(`Directory not found: ${DIST_PATH}`);
  }
  
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Serving static files from: ${DIST_PATH}`);
  
  // Debug: List the build directory contents
  if (fs.existsSync(DIST_PATH)) {
    console.log('Build directory contents:');
    fs.readdirSync(DIST_PATH).forEach(file => {
      console.log(`- ${file}`);
      
      // If this is a directory, list its contents too
      const filePath = path.join(DIST_PATH, file);
      if (fs.statSync(filePath).isDirectory()) {
        console.log(`  Directory ${file} contents:`);
        fs.readdirSync(filePath).forEach(subfile => {
          console.log(`  - ${subfile}`);
        });
      }
    });
  } else {
    console.log(`Build directory not found: ${DIST_PATH}`);
  }
}); 