// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const createDebugMiddleware = require('./debug-middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Detect actual build directory path
let DIST_PATH;
const possiblePaths = [
  path.join(__dirname, 'dist/islam-app'),
  path.join(__dirname, 'dist/islam-app/browser'),
  path.join(__dirname, 'dist/islam-app/browser/browser')
];

for (const pathToCheck of possiblePaths) {
  if (fs.existsSync(path.join(pathToCheck, 'index.html'))) {
    DIST_PATH = pathToCheck;
    console.log(`Found Angular build at: ${DIST_PATH}`);
    break;
  }
}

if (!DIST_PATH) {
  DIST_PATH = possiblePaths[0]; // Default to first path if none found
  console.log(`No index.html found in possible paths, defaulting to: ${DIST_PATH}`);
}

// Log environment info
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', PORT);
console.log('API URL:', process.env.API_URL || 'Not set');

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

// Set permissive CORS headers and security policy
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  
  // Fix Content Security Policy to allow fonts, styles, scripts, etc.
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://cdn.clerk.dev https://js.stripe.com https://cdnjs.cloudflare.com https://*.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.accounts.dev https://*.clerk.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data: font: local:; " +
    "img-src 'self' data: https: blob:; " +
    "worker-src 'self' blob:; " +
    "child-src 'self' blob:; " +
    "media-src 'self' https://*.everyayah.com https://everyayah.com https://*.quranicaudio.com https://download.quranicaudio.com; " +
    "frame-src https://js.stripe.com https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://*.cloudflare.com https://checkout.stripe.com https://billing.stripe.com https://*.stripe.com; " +
    "connect-src 'self' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://api.clerk.com https://*.clerk.com https://cdn.clerk.dev https://*.cloudflare.com https://nura-ai-backend.onrender.com https://nura-y6uq.onrender.com https://*.alquran.cloud https://api.alquran.cloud https://api.alquran.cloud/v1/ https://*.quran.com https://api.quran.com https://api.quran.com/api/v4 https://*.qurancdn.com https://api.qurancdn.com https://everyayah.com https://*.everyayah.com https://download.quranicaudio.com https://*.quranicaudio.com https://api.stripe.com https://*.stripe.com;"
  );
  
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
  
  // Check if index.html exists
  const indexPath = path.join(DIST_PATH, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log(`Serving index.html from: ${indexPath}`);
    res.sendFile(indexPath);
  } else {
    console.log(`index.html not found at: ${indexPath}`);
    res.status(404).send('index.html not found. Build output directory structure issue.');
  }
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