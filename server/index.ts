import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';
import securityConfig from './middleware/security';
import aiRouter from './routes/ai';
import monitoringRouter from './routes/monitoring';
import userRouter from './routes/user';
import winston from 'winston';
import { connectDatabase } from './config/database';
import subscriptionRouter from './routes/subscription';
import usageRouter from './routes/usage';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as admin from 'firebase-admin';
import quranRouter from './routes/quran';

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set NODE_ENV if not already set (development by default)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Starting server in ${process.env.NODE_ENV} mode`);

// Load environment variables - try multiple locations
function loadEnvVariables() {
    const possiblePaths = [
        path.resolve(process.cwd(), '.env'),              // Current working directory
        path.resolve(process.cwd(), '../.env'),           // Parent directory
        path.resolve(path.dirname(__filename), '../.env'), // Relative to current file's directory
        path.resolve(path.dirname(__filename), '../../.env'), // Two levels up from current file
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
        new winston.transports.File({ filename: 'combined.log' }),
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

// Configure CORS
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'];
app.use(cors({
    origin: corsOrigins,
    credentials: true
}));

// Apply other middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'development_session_secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 day
    })
}));

// Configure rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
});
app.use(limiter);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        message: 'API is running',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

// Apply routes
app.use('/api/ai', aiRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/users', userRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/usage', usageRouter);
app.use('/api/quran', quranRouter);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
    try {
        // Connect to database
        await connectDatabase(logger);
        logger.info('Connected to MongoDB successfully');

        // Start listening
        const port = process.env.PORT || 3000;
        app.listen(port, () => {
            logger.info(`Server is running on port ${port} in ${process.env.NODE_ENV} mode`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Initialize server
startServer();

app.get('/api/user-session', withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.authData) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({
      userId: req.authData.userId
    });
  } catch (error) {
    console.error('Error fetching user session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})); 