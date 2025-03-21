import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';
import securityConfig from './middleware/security';
import aiRouter from './routes/ai';
import userRouter from './routes/user';
import usageRouter from './routes/usage';
import quranRouter from './routes/quran';
import subscriptionRouter from './routes/subscription';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as admin from 'firebase-admin';
import { connectDatabase } from './config/database';
import winston from 'winston';

// Set NODE_ENV if not already set (development by default)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Initialize Express app
const app = express();

// Apply security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4200'],
    credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
});
app.use(limiter);

// Connect to MongoDB
connectDatabase(logger).then(async () => {
    try {
        // Drop the problematic index if it exists
        const ReadingHistory = mongoose.model('ReadingHistory');
        await ReadingHistory.collection.dropIndex('userId_1_surah_1').catch(() => {
            // Ignore error if index doesn't exist
            console.log('No problematic index found or already dropped');
        });
        
        // Start server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
        });
    } catch (error) {
        logger.error('Error during server startup:', error);
    }
});

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
};
app.use(session(sessionConfig));

// Apply additional security middleware
app.use(securityConfig.helmet);
app.use(securityConfig.compression);
app.use(securityConfig.rateLimiter);
app.use(securityConfig.securityHeaders);

// API Routes
app.use('/api/ai', aiRouter);
app.use('/api/users', userRouter);
app.use('/api/usage', usageRouter);
app.use('/api/quran', quranRouter);
app.use('/api/subscription', subscriptionRouter);

// Basic session check endpoint
app.get('/api/user-session', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.auth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ userId: req.auth.userId });
    } catch (error) {
        console.error('Error fetching user session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
}); 