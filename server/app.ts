import express, { Request as ExpressRequest } from 'express';
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
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

// Parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Add routes
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);

// Serve static files
const clientBuildPath = path.join(process.cwd(), 'dist/islam-app/browser');
app.use(express.static(clientBuildPath));

// Serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }
  
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

export default app;