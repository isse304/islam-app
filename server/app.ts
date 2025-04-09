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
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import winston from 'winston';
import mongoose from 'mongoose';
import { AuthenticatedRequest, withAuth } from './middleware/auth';
import { getApps } from 'firebase-admin/app';
import { auth } from './config/firebase';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

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

const app = express();

// Log ALL incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

// --- IMPORTANT: Define the Stripe webhook route FIRST with RAW body parser ---
app.post('/api/subscription/webhook', 
  // Apply raw body parser ONLY to this route
  express.raw({ type: 'application/json' }), 
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log('[Webhook Handler Start] Processing raw webhook request...'); // Add log
    try {
      // Temporarily import or get the service instance. Refactor needed for cleaner approach.
      const { StripeService } = await import('./services/stripe.service');
      const { EmailService } = await import('./services/email.service');
      const emailServiceInstance = new EmailService();
      const stripeServiceInstance = new StripeService(emailServiceInstance);
      await stripeServiceInstance.handleWebhookEvent(req, res);
    } catch (error) {
      console.error('[Webhook Route Handler] Error during webhook processing:', error);
      // Ensure error is passed to the global error handler if headers not sent
      if (!res.headersSent) {
          next(error); 
      }
    }
});
// ------------------------------------------------------------------------

// --- Apply JSON and URL-encoded body parsers AFTER the webhook route ---
// --- These will apply to all subsequent routes                   ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- Configure CORS, Security, Compression, Rate Limiting, Session AFTER body parsers ---
// Re-add allowedOrigins definition
const allowedOrigins = [
  'http://localhost:4200',      // Local development
  'http://localhost:3000',      // Local development API
  'https://www.nura-ai.app',    // Production frontend with www
  'https://nura-ai.app',        // Production frontend without www
  'https://nura-y6uq.onrender.com', // Backend URL
  'https://nura-ai-frontend.onrender.com', // Frontend on render.com
  'https://nura-ai.onrender.com' // Additional render.com domain
];

// CORS configuration
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  logger.info('[CORS Check]', {
    origin: origin || 'No Origin',
    method: req.method,
    path: req.path,
    allowedOrigins, // Use the defined constant
    isDevelopment,
    host: req.headers.host,
    referer: req.headers.referer
  });
  
  if (isDevelopment) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }
    logger.info('[CORS] Development mode: allowing all origins');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    logger.info('[CORS] Production mode: allowed origin:', origin);
  } else {
    logger.warn('[CORS] Origin not allowed:', { origin: origin || 'No Origin', allowedOrigins, isDevelopment, host: req.headers.host, referer: req.headers.referer });
  }

  if (req.method === 'OPTIONS') {
    logger.info('[CORS] Handling OPTIONS preflight request');
    res.sendStatus(200);
    return;
  }
  next();
});

// Configure timeouts
const TIMEOUT = process.env.NODE_ENV === 'production' ? 60000 : 30000;
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
      connectSrc: ["'self'", ...allowedOrigins],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"]
    }
  }
}));

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 2000, // Increased dev limit to 2000
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Session configuration
const sessionConfig = {
  secret: process.env['SESSION_SECRET'] || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env['MONGODB_URI'] || '',
    ttl: 24 * 60 * 60,
    touchAfter: 24 * 3600
  }),
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 24 * 60 * 60 * 1000,
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

// --- Define OTHER API Routes AFTER middleware setup ---
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', limiter, userRoutes); // Apply limiter specifically if needed
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
// Mount the subscription router for OTHER subscription routes (create-checkout, status etc.)
// The webhook route defined above will catch '/api/subscription/webhook' first.
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/contact', contactRouter);

// Basic session check endpoint
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

// Serve static files
const clientBuildPath = path.join(process.cwd(), 'dist/islam-app/browser');
app.use(express.static(clientBuildPath));

// Serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }
  
  if (req.accepts('html')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
      if (err) {
        res.status(500).send(err);
      }
    });
  } else {
    res.status(404).send('Not Found');
  }
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Error handling middleware - Using Explicit Type
const customErrorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers['origin'] as string | undefined; // Use bracket notation with type assertion
  const isOriginAllowed = origin && allowedOrigins.includes(origin);

  if (isOriginAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  }

  logger.error('[Error Handler]', {
    error: err.message,
    stack: err.stack,
    origin: origin || 'N/A',
    path: req.originalUrl, // Use originalUrl instead of path
    method: req.method
  });

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation'
    });
  }
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(504).json({
      error: 'Gateway Timeout',
      message: 'The request took too long to process'
    });
  }

  const statusCode = err.status || 500;
  const errorMessage = err.message || 'Internal Server Error';

  if (!res.headersSent) {
    res.status(statusCode).json({
      error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
  }
};
app.use(customErrorHandler); // Apply the handler

// 404 handler - Using Explicit Type
const notFoundHandler: RequestHandler = (req: Request, res: Response) => {
  logger.warn('[404 Handler]', { path: req.originalUrl, method: req.method }); // Use originalUrl
  res.status(404).send('Not Found');
};
app.use(notFoundHandler); // Apply the handler

// Start server function
const startServer = async () => {
    try {
        if (!getApps().length) {
            throw new Error('Firebase Admin SDK not initialized');
        }
        if (!auth) {
            throw new Error('Firebase Auth not initialized');
        }
        logger.info('Firebase Admin SDK initialized');
        await connectDatabase();
        logger.info('MongoDB connected');

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

export default app;