import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';
import securityConfig from './middleware/security';
import * as aiRouter from './routes/ai';
import userRouter from './routes/user';
import usageRouter from './routes/usage';
import quranRouter from './routes/quran';
import subscriptionRouter from './routes/subscription';
import tafsirRoutes from './routes/tafsir';
import contactRouter from './routes/contact';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import path from 'path';
import dotenv from 'dotenv';
import { getApps } from 'firebase-admin/app';
import { auth } from './config/firebase';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
// import morgan from 'morgan'; // COMMENTED OUT
// import cookieParser from 'cookie-parser'; // COMMENTED OUT

// Load environment variables first
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize logger
const logger = winston.createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
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

// Configure CORS with proper settings
const allowedOrigins = [
  'http://localhost:4200',      // Local development
  'https://www.nura-ai.app',    // Production frontend
  'https://nura-y6uq.onrender.com', // Backend URL
  'https://nura-ai-frontend.onrender.com', // Frontend on render.com
  'https://nura-ai.app'         // Production frontend without www
];

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl requests, etc)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      logger.warn(`[CORS] Blocked request from non-allowed origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Configure timeouts
app.use((req, res, next) => {
  // Set server timeout to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Configure body parser with increased limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure compression
app.use(compression());

// Configure security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...allowedOrigins],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
    }
  }
}));

// Configure rate limiting with higher limits for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 100, // Higher limit for production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to specific routes instead of globally
app.use('/api/user', limiter);

// Session configuration
const sessionConfig = {
  secret: process.env['SESSION_SECRET'] || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env['MONGODB_URI'] || '',
    ttl: 24 * 60 * 60, // 1 day
    touchAfter: 24 * 3600 // Only update session once per day
  }),
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    sameSite: process.env['NODE_ENV'] === 'production' ? 'none' : 'lax'
  }
} as const;

app.use(session(sessionConfig));

// API Routes
app.use('/api/ai', aiRouter.default || aiRouter);
app.use('/api/user', userRouter);
app.use('/api/usage', usageRouter);
app.use('/api/quran', quranRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/contact', contactRouter);

// Basic session check endpoint
app.get('/api/user-session', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.auth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Ensure req.auth is defined and has uid before accessing
        const userId = req.auth?.uid;
        if (!userId) {
            // This case should ideally be caught by withAuth, but good to double-check
            return res.status(401).json({ error: 'Unauthorized', details: 'User ID not found in token' });
        }
        res.json({ userId: userId });
    } catch (error) {
        // console.error('Error fetching user session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Centralized Error Handling Middleware (MUST be last)
app.use(errorHandler);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const isOriginAllowed = origin && allowedOrigins.includes(origin);

  // Always set CORS headers for errors if origin is allowed
  if (isOriginAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  }

  // Log error
  logger.error('[Error Handler]', {
    error: err.message,
    stack: err.stack,
    origin,
    path: req.path,
    method: req.method
  });

  // Handle specific error types
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation'
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(504).json({
      error: 'Gateway Timeout',
      message: 'The request took too long to process'
    });
  }

  // Handle other errors
  const statusCode = err.status || 500;
  const errorMessage = err.message || 'Internal Server Error';

  if (!res.headersSent) {
    res.status(statusCode).json({
      error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).send('Not Found');
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
        await connectDatabase();
        logger.info('MongoDB connected');

        // Start server
        const PORT = process.env['PORT'] || 3000;
        app.listen(PORT, () => {
            // console.log(`✅ Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer(); 