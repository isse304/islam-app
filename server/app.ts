import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import tafsirRoutes from './routes/tafsir';

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(bodyParser.json());

// Add tafsir routes
app.use('/api/tafsir', tafsirRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app; 