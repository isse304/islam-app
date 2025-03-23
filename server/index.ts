import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth.js';
import securityConfig from './middleware/security.js';
import * as aiRouter from './routes/ai.js';
import userRouter from './routes/user.js';
import usageRouter from './routes/usage.js';
import quranRouter from './routes/quran.js';
import subscriptionRouter from './routes/subscription.js';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import path from 'path';
import dotenv from 'dotenv';
import { getApps } from 'firebase-admin/app';
import { auth } from './config/firebase.js';
import { connectDatabase } from './config/database.js';

// Load environment variables first
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/combined.log')
        })
    ]
});

// Initialize Express app
const app = express();

// Configure CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info(`${req.method} ${req.url}`, {
        body: req.body,
        query: req.query,
        params: req.params
    });
    next();
});

// Apply security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:4200'],
    credentials: true
}));

// Configure express to handle raw body for Stripe webhooks
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
// Use JSON parsing for all other routes
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
});
app.use(limiter);

// Session configuration
const sessionConfig: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || '',
        ttl: 24 * 60 * 60 // 1 day
    }) as session.Store,
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
app.use('/api/ai', aiRouter.default || aiRouter);
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

// Start server function
const startServer = async () => {
    try {
        // Verify Firebase Admin is initialized
        if (!getApps().length) {
            throw new Error('Firebase Admin SDK not initialized');
        }
        
        // Verify auth is available
        if (!auth) {
            throw new Error('Firebase Auth not initialized');
        }
        logger.info('Firebase Admin SDK initialized');

        // Connect to MongoDB
        await connectDatabase(logger);
        logger.info('MongoDB connected');

        // Start server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer(); 