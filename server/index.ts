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
const allowedOrigins: (string | undefined)[] = [
  'http://localhost:4200',      // Local development
  'https://www.nura-ai.app',    // Production frontend
  'https://nura-y6uq.onrender.com', // Backend URL
  'https://nura-ai-frontend.onrender.com', // Frontend on render.com
  'https://nura-ai.app',         // Production frontend without www
  undefined, // Allow undefined origin for local testing
  'null'     // Allow null origin for local file testing
];

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl requests, etc)
    if (!origin || origin === 'null') {
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

// Apply CORS middleware before other middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Configure timeouts
app.use((req, res, next) => {
  // Increase timeout for long-running requests
  const timeout = 120000; // 120 seconds
  const timeoutHandler = () => {
    const err: any = new Error('Request timeout');
    err.status = 504;
    err.code = 'ETIMEDOUT';
    next(err);
  };

  // Set both request and response timeouts
  req.setTimeout(timeout, timeoutHandler);
  res.setTimeout(timeout, timeoutHandler);

  // Set a timer to ensure the entire request-response cycle doesn't exceed timeout
  const timer = setTimeout(() => {
    timeoutHandler();
  }, timeout);

  // Clear the timer when the response is sent
  res.on('finish', () => {
    clearTimeout(timer);
  });

  // Add error handling for aborted requests
  req.on('error', (error) => {
    clearTimeout(timer);
    next(error);
  });

  // Handle client disconnects
  req.on('close', () => {
    clearTimeout(timer);
  });

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
      connectSrc: ["'self'", ...(allowedOrigins.filter((origin): origin is string => !!origin))],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
    }
  }
}));

// Configure rate limiting with higher limits
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 2000 : 200, // Increased limits
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: RateLimitRequest, res: Response) => {
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime.getTime() - Date.now()) / 1000
    });
  }
});

// Apply rate limiting to all routes
app.use(limiter);

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

// Add CORS headers to error responses
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

  // Handle specific error types
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation'
    });
  }

  next(err);
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
        const PORT = parseInt(process.env.PORT || '3000', 10);
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer(); 