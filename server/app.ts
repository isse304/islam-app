import express, { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from 'express';
import tafsirRoutes from './routes/tafsir';
import userRoutes from './routes/user';
import dotenv from 'dotenv';
import path from 'path';
import aiRoutes from './routes/ai';
import quranRoutes from './routes/quran';
import subscriptionRoutes from './routes/subscription';
import usageRoutes from './routes/usage';
import contactRouter from './routes/contact';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// --- Keep API Route Mounting --- 
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', userRoutes); 
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/contact', contactRouter);

// Keep session check endpoint
app.get('/api/user-session', withAuth(async (req: AuthenticatedRequest, res: Response) => {
   if (!req.auth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const userId = req.auth?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized', details: 'User ID not found in token' });
        }
        res.json({ userId: userId });
}));

// --- Keep Static File Serving and Catch-all for SPA --- 
const clientBuildPath = path.join(process.cwd(), 'dist/islam-app/browser');
app.use(express.static(clientBuildPath));
app.get('*', (req, res, next) => {
  // Ensure API calls aren't caught by this
  if (req.originalUrl.startsWith('/api/')) { 
    return next();
  }
  // Serve index.html for SPA routing
  if (path.extname(req.path)) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      res.status(500).send(err);
    }
  });
});

export default app;