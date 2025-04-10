import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';
import * as aiRouter from './routes/ai';
import userRouter from './routes/user';
import usageRouter from './routes/usage';
import quranRouter from './routes/quran';
import subscriptionRouter from './routes/subscription';
import tafsirRoutes from './routes/tafsir';
import contactRouter from './routes/contact';
import { EmailService } from './services/email.service';
import { StripeService } from './services/stripe.service';
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
import fs from 'fs';

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

// --- Trust Proxy --- 
// Required for express-rate-limit behind reverse proxies (like Render)
app.set('trust proxy', 1);

// --- Instantiate Services ---
const emailService = new EmailService();
const stripeService = new StripeService(emailService);
// --- End Instantiate Services ---

// Configure raw body parsing for Stripe webhook BEFORE other middleware
app.post('/api/subscription/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // --- Direct call to handleWebhookEvent ---
    stripeService.handleWebhookEvent(req, res);
    // --- End Direct call ---
  }
);

// Configure CORS with proper settings
const allowedOrigins = [
  'http://localhost:4200',      // Local development
  'http://localhost:3000',      // Local development API
  'https://www.nura-ai.app',    // Production frontend with www
  'https://nura-ai.app',        // Production frontend without www
  'https://nura-y6uq.onrender.com', // Backend URL
  'https://nura-ai-frontend.onrender.com', // Frontend on render.com
  'https://nura-ai.onrender.com' // Additional render.com domain
];

// CORS configuration (after webhook route)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Log the actual request details
  logger.info('[CORS Check]', {
    origin: origin || 'No Origin',
    method: req.method,
    path: req.path,
    allowedOrigins,
    isDevelopment,
    host: req.headers.host,
    referer: req.headers.referer
  });
  
  // In development, allow all origins
  if (isDevelopment) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }
    logger.info('[CORS] Development mode: allowing all origins');
  }
  // In production, check against allowed origins
  else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    logger.info('[CORS] Production mode: allowed origin:', origin);
  } else {
    logger.warn('[CORS] Origin not allowed:', {
      origin: origin || 'No Origin',
      allowedOrigins,
      isDevelopment,
      host: req.headers.host,
      referer: req.headers.referer
    });
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    logger.info('[CORS] Handling OPTIONS preflight request');
    res.sendStatus(200);
    return;
  }

  next();
});

// Configure body parsing AFTER webhook route
app.use((req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') {
    // Skip body parsing for webhook route
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use((req, res, next) => {
  if (req.originalUrl === '/api/subscription/webhook') {
    // Skip body parsing for webhook route
    next();
  } else {
    express.urlencoded({ extended: true })(req, res, next);
  }
});

// Configure timeouts with longer duration for production
const TIMEOUT = process.env.NODE_ENV === 'production' ? 60000 : 30000; // 60 seconds in production
app.use((req, res, next) => {
  req.setTimeout(TIMEOUT);
  res.setTimeout(TIMEOUT);
  next();
});

// Configure compression
app.use(compression());

// Configure security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'", 
        ...allowedOrigins, 
        "https://securetoken.googleapis.com", 
        "https://firestore.googleapis.com",
        "https://*.googleapis.com",
        "https://api.qurancdn.com", // Allow QuranCDN API
        "https://fonts.gstatic.com" // Allow Google Fonts connection
      ],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'",
        "https://js.stripe.com", 
        "https://apis.google.com"
      ],
      // Explicitly define script-src-elem
      scriptSrcElem: [
        "'self'", 
        "'unsafe-inline'", // Often needed for framework/library scripts loaded dynamically
        "https://js.stripe.com", 
        "https://apis.google.com"        
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Keep allowing inline event handlers
      styleSrc: [
        "'self'", 
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com" 
      ],
      // Explicitly define style-src-elem
      styleSrcElem: [
        "'self'",
        "'unsafe-inline'", // Allow inline styles
        "https://cdnjs.cloudflare.com" // Allow FontAwesome styles
      ],
      imgSrc: ["'self'", "data:", "https:"], 
      fontSrc: ["'self'", "https:", "data:", "https://cdnjs.cloudflare.com"],
      frameSrc: [
        "'self'", 
        "https://js.stripe.com", 
        "https://hooks.stripe.com",
        "https://*.firebaseapp.com" // Allow Firebase Auth helper frames
      ], 
      workerSrc: ["'self'"] 
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

// Add request logging before routes
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('[Request Start]', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('[Request Complete]', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  });

  next();
});

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

// --- START: Moved Static Files & SPA Handling ---
// Calculate path relative to the server's execution directory
const serverRootDir = process.cwd(); // Should be /opt/render/project/src/server
const projectRoot = path.resolve(serverRootDir, '..'); // Should be /opt/render/project/src
const staticFilesPath = path.join(projectRoot, 'dist', 'islam-app');

logger.info(`[Static Files Debug] Server Root Dir (cwd): ${serverRootDir}`);
logger.info(`[Static Files Debug] Calculated Project Root: ${projectRoot}`);
logger.info(`[Static Files Debug] Final Static Files Path: ${staticFilesPath}`);

// Check if the directory exists and serve files
try {
  if (fs.existsSync(staticFilesPath)) {
    logger.info(`[Static Files] Directory exists. Serving static files from: ${staticFilesPath}`);
    logger.info('[Middleware Setup] Applying express.static middleware...');
    app.use(express.static(staticFilesPath, {
      setHeaders: (res, filePath) => {
        logger.debug(`[Static Files] Serving: ${path.basename(filePath)}`);
      }
    }));

    // SPA catch-all route ONLY if static path exists
    logger.info('[Middleware Setup] Applying SPA catch-all route...');
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }

      // Skip requests for files with extensions (like .css, .js)
      if (path.extname(req.path)) {
         logger.debug(`[SPA Catch-all] Skipping file request: ${req.path}`);
         return next(); // Let express.static handle or 404
      }

      const indexPath = path.join(staticFilesPath, 'index.html');
      logger.info(`[SPA Catch-all] Attempting to serve index.html from: ${indexPath} for request path: ${req.path}`);
      res.sendFile(indexPath, (err) => {
        if (err) {
          logger.error(`[SPA Catch-all] Error sending file ${indexPath}:`, {
            message: (err as NodeJS.ErrnoException).message,
            code: (err as NodeJS.ErrnoException).code,
            path: (err as NodeJS.ErrnoException).path
          });
          if (!res.headersSent) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              res.status(404).send(`SPA index.html not found at ${indexPath}`);
            } else {
              res.status(500).send('Error serving application.');
            }
          }
        } else {
          logger.info(`[SPA Catch-all] Successfully sent index.html for request path: ${req.path}`);
        }
      });
    });
  } else {
    logger.warn(`[Static Files] Directory NOT FOUND: ${staticFilesPath}. Static file serving and SPA routing skipped.`);
    // Fallback for non-API routes if static dir not found
    app.get('*', (req, res, next) => {
       if (req.originalUrl.startsWith('/api/')) {
         return next();
       }
       logger.warn(`[Static Files Fallback] Sending 404 for ${req.path} as static directory was not found.`);
       res.status(404).send('Application files not found. Build process may have failed.');
    });
  }
} catch (error) {
   logger.error(`[Static Files] Error checking or setting up static file serving for ${staticFilesPath}:`, error);
   // Generic fallback if setup fails
   app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      res.status(500).send('Server error during static file setup.');
   });
}
// --- END: Moved Static Files & SPA Handling ---

// Centralized Error Handling Middleware (MUST be last)
app.use(errorHandler);

// Error handling middleware - Update to always include CORS headers
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
        const PORT = Number(process.env['PORT']) || 3000;
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