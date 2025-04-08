import express from 'express';
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
  console.log('>>> PING route hit! <<<');
  res.status(200).send('pong');
});

// Log ALL incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  console.log(`[Server] Received ${req.method} request for ${req.originalUrl} at ${new Date().toISOString()} from origin: ${req.headers.origin}`);
  next(); // Continue to next middleware
});

// ** Apply specific CORS configuration early **
console.log('[Server] Applying specific CORS configuration...');
const allowedOrigins = ['http://localhost:4200'];
const corsOptions = {
  origin: function (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests) or from allowed origins
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      console.log(`[CORS Options] Allowed origin: ${origin || '(no origin)'}`);
      callback(null, true)
    } else {
      console.error(`[CORS Options] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,             // Allow cookies/authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly allow methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Explicitly allow headers
  exposedHeaders: ['Authorization'], // Expose Authorization header
  preflightContinue: false,     // Handle preflight ourselves
  optionsSuccessStatus: 204     // Some legacy browsers (IE11) choke on 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', (req, res, next) => {
  // Log preflight request details
  console.log(`[CORS Preflight] Handling OPTIONS request for ${req.originalUrl} from origin: ${req.headers.origin}`);
  console.log(`[CORS Preflight] Access-Control-Request-Method: ${req.headers['access-control-request-method']}`);
  console.log(`[CORS Preflight] Access-Control-Request-Headers: ${req.headers['access-control-request-headers']}`);

  // Apply CORS options logic to the preflight request
  cors(corsOptions)(req, res, (err: any) => {
    if (err) {
      console.error(`[CORS Preflight] Error during preflight processing: ${err.message}`);
      return next(err); // Pass error to the error handler
    }
    // cors() middleware should automatically handle setting headers and ending the response for OPTIONS
    console.log(`[CORS Preflight] Preflight check successful for origin: ${req.headers.origin}. Sending 204.`);
    // Explicitly set status if cors middleware didn't end the response (unlikely but safe)
    if (!res.headersSent) {
        res.sendStatus(204);
    }
  });
});

console.log('[Server] Specific CORS configuration and preflight handler applied.');

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
const clientBuildPath = path.join(__dirname, '../../dist/islam-app/browser');
app.use(express.static(clientBuildPath));

// Serve the Angular index.html for all non-API routes
app.get('*', (req, res) => {
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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error Handler]:", err.stack);
  // ** Check if it's a CORS error from our options **
  if (err instanceof Error && err.message === 'Not allowed by CORS') {
      console.error(`[Global Error Handler] CORS Blocked Origin: ${req.headers.origin}`);
      return res.status(403).json({ error: 'CORS Error', details: 'Origin not allowed' });
  }
  // ** Check if headers have already been sent **
  if (res.headersSent) {
      console.error('[Global Error Handler] Headers already sent, cannot send 500.');
      return next(err); // Pass to default Express error handler if possible
  }
  res.status(500).json({ error: 'Internal Server Error', details: 'Something broke!' }); // Send JSON error
});

export default app; 