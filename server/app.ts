import express from 'express';
import cors from 'cors';
import type { CorsOptions } from 'cors';
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
  next(); // Continue to next middleware
});

// ** Apply specific CORS configuration early **
console.log('[Server] Applying specific CORS configuration...');

const corsOptions = {
  origin: 'http://localhost:4200', // Exact origin instead of array
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS configuration
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

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
  // console.error("[Global Error Handler]:", err.stack);

  const origin = req.headers.origin;
  // Use the allowedOrigins array defined earlier in the file
  const isOriginAllowed = ['http://localhost:4200'].includes(origin || ''); 

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
    // console.error(`[Global Error Handler] CORS Blocked Origin: ${origin}`);
    // Headers should have been set above if the origin was allowed (edge case)
    // Send the determined status code (403)
    if (!res.headersSent) {
      res.status(statusCode).json({ error: errorType, details: errorDetails });
    }
    return; // Stop further processing for this specific error
  }

  // Check if headers have already been sent
  if (res.headersSent) {
    // console.error('[Global Error Handler] Headers already sent, cannot send error response.');
    // If next is not called here, the request might hang for the client.
    // However, calling next(err) might lead to Express's default handler,
    // which might send HTML, potentially undesirable for an API.
    // Logging is often the best we can do here.
    return; // Stop processing
  }

  // Send the final error response (CORS headers should be set above if applicable)
  // console.log(`[Global Error Handler] Sending final error response. Status: ${statusCode}, Type: ${errorType}, Details: ${errorDetails}`);
  res.status(statusCode).json({ error: errorType, details: errorDetails }); 
});

export default app; 