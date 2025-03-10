import dotenv from 'dotenv';
import path from 'path';
import https from 'https';
import fs from 'fs';

// Load environment variables first, before any other imports
const envPath = path.resolve(process.cwd(), '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

import express from 'express';
import session from 'express-session';
import cors from 'cors';
import mongoose from 'mongoose';
import { ClerkExpressWithAuth } from '@clerk/clerk-sdk-node';
import { AuthenticatedRequest } from './middleware/auth.middleware';
import securityConfig from './middleware/security';
import aiRouter from './routes/ai';
import monitoringRouter from './routes/monitoring';
import usersRouter from './routes/users';
import winston from 'winston';
import { connectDatabase } from './config/database';

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
    'SESSION_SECRET'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const app = express();
const port = process.env.PORT || 3000;

// Apply security middleware
app.use(securityConfig.helmet);
app.use(securityConfig.compression);
app.use(securityConfig.rateLimiter);
app.use(securityConfig.securityHeaders);

// Configure session middleware with secure settings
app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    }
}));

// Configure CORS with strict options
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Parse JSON bodies with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files with cache headers
app.use('/assets', express.static(path.join(__dirname, '../src/assets'), {
    maxAge: '1d',
    etag: true
}));

// Initialize Clerk middleware
app.use(ClerkExpressWithAuth({
    onError: (error: Error) => {
        logger.error('Clerk auth error:', error);
        return {
            status: 401,
            message: 'Unauthorized'
        };
    }
}));

// Connect to database
connectDatabase(logger).catch(err => {
    logger.error('Failed to connect to database:', err);
    process.exit(1);
});

// Test authentication endpoint
app.get('/api/auth-test', (req: AuthenticatedRequest, res: express.Response) => {
    res.json({
        message: 'Authentication successful!',
        user: {
            id: req.auth.userId,
            sessionId: req.auth.sessionId
        }
    });
});

// Routes
app.use('/api/ai', aiRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/users', usersRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Global error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
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

if (process.env.NODE_ENV === 'production') {
    // In production, use HTTPS
    const httpsOptions = {
        key: fs.readFileSync(path.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN!, 'privkey.pem')),
        cert: fs.readFileSync(path.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN!, 'cert.pem')),
        ca: fs.readFileSync(path.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN!, 'chain.pem'))
    };

    https.createServer(httpsOptions, app).listen(443, () => {
        logger.info('HTTPS Server running on port 443');
    });

    // Redirect HTTP to HTTPS
    const httpApp = express();
    httpApp.use((req, res) => {
        res.redirect(`https://${req.headers.host}${req.url}`);
    });
    httpApp.listen(80, () => {
        logger.info('HTTP Server running on port 80 (redirecting to HTTPS)');
    });
} else {
    // In development, use HTTP
    app.listen(port, () => {
        logger.info(`Server is running on port ${port} in ${process.env.NODE_ENV} mode`);
    });
} 