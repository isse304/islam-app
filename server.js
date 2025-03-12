const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Compress all responses
app.use(compression());

// Add headers for cache control
app.use(function(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve static files from the Angular app
app.use(express.static(path.join(__dirname, 'dist/islam-app/browser')));

// For all GET requests that aren't to static files, serve index.html
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.url);
  res.sendFile(path.join(__dirname, 'dist/islam-app/browser/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'dist/islam-app/browser')}`);
}); 