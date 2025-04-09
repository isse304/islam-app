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
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

// Define allowed origins
const allowedOrigins = [
  'http://localhost:4200',      // Local development
  'https://www.nura-ai.app',    // Production frontend
  'https://nura-y6uq.onrender.com', // Backend URL
  'https://nura-ai-frontend.onrender.com', // Frontend on render.com
  'https://nura-ai.app'         // Production frontend without www
];

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl requests, etc)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from non-allowed origin: ${origin}`);
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

// Parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Add routes
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);

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

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    console.error(`[CORS Error] Blocked request from origin: ${origin}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation'
    });
  }

  // Handle other errors
  const statusCode = err.status || 500;
  const errorMessage = err.message || 'Internal Server Error';

  if (!res.headersSent) {
    res.status(statusCode).json({
      error: statusCode === 403 ? 'Forbidden' : 'Internal Server Error',
      message: errorMessage
    });
  }
});

export default app;