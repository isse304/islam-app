import dotenv from 'dotenv';
import path from 'path';
import https from 'https';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, authenticateUser } from './middleware/auth';
import securityConfig from './middleware/security';
import aiRouter from './routes/ai';
import monitoringRouter from './routes/monitoring';
import usersRouter from './routes/users';
import winston from 'winston';
import { connectDatabase } from './config/database';
import subscriptionRouter from './routes/subscription';
import usageRouter from './routes/usage';

// Set NODE_ENV if not already set (development by default)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Starting server in ${process.env.NODE_ENV} mode`);

// Load environment variables - try multiple locations
function loadEnvVariables() {
    const possiblePaths = [
        path.resolve(process.cwd(), '.env'),              // Current working directory
        path.resolve(process.cwd(), '../.env'),           // Parent directory
        path.resolve(__dirname, '../.env'),               // Relative to current file's directory
        path.resolve(__dirname, '../../.env'),            // Two levels up from current file
    ];
    
    console.log('Looking for .env file in:');
    for (const envPath of possiblePaths) {
        console.log(`- ${envPath} (exists: ${fs.existsSync(envPath)})`);
        
        if (fs.existsSync(envPath)) {
            const result = dotenv.config({ path: envPath });
            if (result.error) {
                console.warn(`Warning: Error loading .env from ${envPath}:`, result.error);
            } else {
                console.log(`✅ Successfully loaded .env from ${envPath}`);
                // In development, validate required variables are present
                validateEnvironmentVariables();
                return true;
            }
        }
    }
    
    if (process.env.NODE_ENV === 'development') {
        console.error('❌ Could not find .env file in any of the checked locations');
        console.log('Available environment variables:', Object.keys(process.env).length);
        return false;
    }
    
    // In production, we might get env vars from the deployment platform
    console.log('No .env file found, but continuing (might use environment variables from deployment platform)');
    return true;
}

function validateEnvironmentVariables() {
    // Log the presence of important environment variables
    const importantVars = [
        'MONGODB_URI',
        'OPENAI_API_KEY',
        'FIREBASE_PROJECT_ID',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_PRICE_ID',
        'RATE_LIMIT_WINDOW_MS',
        'RATE_LIMIT_MAX_REQUESTS',
        'DAILY_USER_LIMIT'
    ];
    
    console.log('\nEnvironment Variables Status:');
    for (const varName of importantVars) {
        const exists = !!process.env[varName];
        console.log(`- ${varName}: ${exists ? '✅ Set' : '❌ Missing'}`);
    }
    console.log();
}

// Try to load environment variables
loadEnvVariables();

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
        
        // We're using Firebase auth, not Clerk, so we don't need this middleware
        logger.info('Using Firebase authentication');
        
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

        // Health check endpoint
        app.get('/api/health', (req: Request, res: Response) => {
            res.status(200).json({ 
                status: 'ok', 
                message: 'API is running', 
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
            });
        });

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