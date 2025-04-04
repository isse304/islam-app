import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import tafsirRoutes from './routes/tafsir';
import userRoutes from './routes/user';
import dotenv from 'dotenv';
import path from 'path';
import aiRoutes from './routes/ai';
import quranRoutes from './routes/quran';
import subscriptionRoutes from './routes/subscription';
import usageRoutes from './routes/usage';

dotenv.config();

const app = express();

// Log ALL incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  console.log(`[Server] Received ${req.method} request for ${req.originalUrl} at ${new Date().toISOString()}`);
  next(); // Continue to next middleware
});

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Add tafsir routes
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/users', userRoutes);

// API Routes
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);

// Serve static files from the Angular app build directory
const clientBuildPath = path.join(__dirname, '../../dist/islam-app/browser');
app.use(express.static(clientBuildPath));

// Serve the Angular index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
      if (err) {
        res.status(500).send(err);
      }
    });
  } else {
    res.status(404).send('Not Found');
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error Handler]:", err.stack);
  res.status(500).send('Something broke!');
});

export default app; 