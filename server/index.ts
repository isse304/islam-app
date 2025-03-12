import dotenv from 'dotenv';
import path from 'path';
import https from 'https';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';
import { AuthenticatedRequest, authenticateUser } from './middleware/auth';
import securityConfig from './middleware/security';
import aiRouter from './routes/ai';
import monitoringRouter from './routes/monitoring';
import usersRouter from './routes/users';
import winston from 'winston';
import { connectDatabase } from './config/database';
import subscriptionRouter from './routes/subscription';
import usageRouter from './routes/usage';

// Load environment variables first, before any other imports
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

// Configure logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Validate required environment variables
const requiredEnvVars = [
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'MONGODB_URI',
    'CORS_ORIGIN',
    'OPENAI_API_KEY',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID',
    'STRIPE_WEBHOOK_SECRET',
    'CLIENT_URL'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Connect to database and start server
const startServer = async () => {
    try {
        await connectDatabase(logger);
        logger.info('Database connection established');

        // Apply middleware
        app.use(cors({
            origin: process.env.NODE_ENV === 'development' ? true : process.env.CORS_ORIGIN?.split(','),
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
        }));
        
        // Initialize Clerk
        app.use(ClerkExpressWithAuth());
        
        // Configure session middleware with secure settings and MongoDB store
        app.use(session({
            secret: process.env.SESSION_SECRET!,
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                ttl: 24 * 60 * 60,
                autoRemove: 'native'
            }),
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'strict'
            }
        }));

        // Apply routes
        app.use('/api/subscription', subscriptionRouter);
        app.use('/api/usage', usageRouter);
        app.use('/api/ai', aiRouter);
        app.use('/api/monitoring', monitoringRouter);
        app.use('/api/users', usersRouter);

        // Start server
        app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });

        // Graceful shutdown handling
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Shutting down gracefully...');
            mongoose.connection.close()
                .then(() => {
                    logger.info('MongoDB connection closed.');
                    process.exit(0);
                })
                .catch(err => {
                    logger.error('Error during shutdown:', err);
                    process.exit(1);
                });
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

app.get('/api/user-session', authenticateUser, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    return res.json({
      userId: authReq.auth.userId
    });
  } catch (error) {
    console.error('Error fetching user session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}); 