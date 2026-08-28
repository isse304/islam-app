const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. Add it to server/.env before running this script.');
  process.exit(1);
}

require('./generate-dua-insights.js');
