const fs = require('fs');
const https = require('https');
const path = require('path');

// Create the fonts directory if it doesn't exist
const fontDir = path.join(__dirname, 'src', 'assets', 'fonts');
if (!fs.existsSync(fontDir)) {
  fs.mkdirSync(fontDir, { recursive: true });
}

// Alternative font URLs
const fonts = [
  {
    url: 'https://fonts.qurancdn.com/KFGQPC%20Uthmanic%20Script%20HAFS%20Regular.ttf',
    filename: 'KFGQPC_HAFS_Uthmanic_Script.ttf'
  },
  {
    url: 'https://fonts.qurancdn.com/static/HafsSmart_08.ttf',
    filename: 'HafsSmart.ttf'
  }
];

// Download each font
fonts.forEach(font => {
  const filePath = path.join(fontDir, font.filename);
  
  console.log(`Downloading ${font.url} to ${filePath}`);
  
  const file = fs.createWriteStream(filePath);
  https.get(font.url, response => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded ${font.filename} successfully`);
    });
  }).on('error', err => {
    fs.unlink(filePath, () => {}); // Delete the file on error
    console.error(`Error downloading ${font.filename}:`, err.message);
  });
}); 