import express, { Request as ExpressRequest } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import tafsirRoutes from './routes/tafsir';
import userRoutes from './routes/user';
import dotenv from 'dotenv';
import path from 'path';
import aiRoutes from './routes/ai';
import quranRoutes from './routes/quran';
import subscriptionRoutes from './routes/subscription';
import usageRoutes from './routes/usage';

dotenv.config();

const app = express();

// >>> TEMPORARY PING ROUTE FOR TESTING <<<
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Log ALL incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  // console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from Origin: ${req.headers.origin || 'N/A'}`);
  next(); // Continue to next middleware
});

// ** Apply specific CORS configuration early **
// console.log('[Server] Applying specific CORS configuration...');

const allowedOrigins = [
    'http://localhost:4200',      // Local development
    'https://www.nura-ai.app',    // Production frontend
    'https://nura-y6uq.onrender.com', // Backend URL
    'https://nura-ai-frontend.onrender.com' // Frontend on render.com
];

// Define CORS options directly, letting TypeScript infer the type
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
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

// Apply CORS configuration using the options object
app.use(cors(corsOptions));

// Handle preflight requests explicitly using the same options
app.options('*', cors(corsOptions));

// Add a middleware to log CORS issues
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin) && process.env.NODE_ENV !== 'development') {
    console.warn(`[CORS Warning] Request from non-allowed origin: ${origin}`);
  }
  next();
});

// Parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Add tafsir routes
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', userRoutes);

// API Routes
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);

// Serve static files from the Angular app build directory
// const clientBuildPath = path.join(__dirname, '../../dist/islam-app/browser');
const clientBuildPath = path.join(process.cwd(), 'dist/islam-app/browser'); // More robust path from project root
app.use(express.static(clientBuildPath));

// Serve the Angular index.html for all non-API, non-file-like routes
app.get('*', (req, res, next) => {
  // If the request looks like a file path (e.g., contains a dot in the last segment), let static serve handle it or 404
  if (path.extname(req.path)) {
    // console.log(`[Catch-All] Request path ${req.path} looks like a file, skipping index.html serve.`);
    return next(); // Pass to the next middleware (likely results in 404 if express.static didn't find it)
  }

  // console.log(`[Catch-All] Serving index.html for path: ${req.path}`);
  if (req.accepts('html')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
      if (err) {
        // console.error(`[Catch-All] Error sending index.html:`, err);
        res.status(500).send(err);
      }
    });
  } else {
    // console.log(`[Catch-All] Request does not accept HTML, sending 404 for path: ${req.path}`);
    res.status(404).send('Not Found');
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // console.error("[Global Error Handler]:", err.stack);

  const origin = req.headers.origin;
  // Use the full allowedOrigins array defined earlier
  const isOriginAllowed = allowedOrigins.includes(origin || '');

  // Set CORS headers ONLY if origin is allowed and headers not sent
  if (isOriginAllowed && !res.headersSent) {
    // console.log(`[Global Error Handler] Origin ${origin} is allowed. Setting CORS headers for error response.`);
    res.setHeader('Access-Control-Allow-Origin', origin!); // Use the specific allowed origin
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // Optionally add Vary header
    res.setHeader('Vary', 'Origin'); 
  } else if (!res.headersSent) {
    // console.warn(`[Global Error Handler] Origin ${origin || 'N/A'} is NOT allowed or headers sent. Not setting CORS headers for error.`);
  }

  // Determine status code - prioritize error.status, default to 500
  const statusCode = err.status || (err instanceof Error && err.message === 'Not allowed by CORS' ? 403 : 500);
  const errorType = err.status === 401 ? 'Unauthorized' : (statusCode === 403 ? 'Forbidden' : 'Internal Server Error');
  const errorDetails = err.message || 'An unexpected error occurred';

  // Check if it's a CORS configuration error from the cors middleware itself
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
    console.error(`[Global Error Handler] CORS Blocked Origin: ${origin}`);
    if (!res.headersSent) {
      res.status(statusCode).json({ error: errorType, details: errorDetails });
    }
    return;
  }

  // Check if headers have already been sent
  if (res.headersSent) {
    console.error('[Global Error Handler] Headers already sent, cannot send error response.');
    return;
  }

  // Send the final error response
  res.status(statusCode).json({ error: errorType, details: errorDetails });
});

export default app;