import dotenv from 'dotenv';
import path from 'path';

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
import { clerkMiddleware, requireAuth } from '@clerk/express';
import { AuthenticatedRequest } from './middleware/auth.middleware';
import aiRouter from './routes/ai';
import monitoringRouter from './routes/monitoring';
import usersRouter from './routes/users';
import * as fs from 'fs';

// Log environment variables for debugging
console.log('\nEnvironment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '[SET]' : '[NOT SET]');

// Validate required environment variables
const requiredEnvVars = [
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'MONGODB_URI',
    'CORS_ORIGIN',
    'OPENAI_API_KEY'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}

const app = express();
const port = process.env.PORT || 3000;

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Configure CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Handle preflight requests
app.options('*', cors());

// Parse JSON bodies
app.use(express.json());

// Initialize Clerk middleware
app.use(clerkMiddleware());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/islamapp')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Serve test auth page
app.get('/test-auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-auth.html'));
});

// Test authentication endpoint
app.get('/api/auth-test', requireAuth(), (req: AuthenticatedRequest, res) => {
    res.json({
        message: 'Authentication successful!',
        user: {
            id: req.session.auth?.userId,
            sessionId: req.session.auth?.sessionId
        }
    });
});

// Routes
app.use('/api/ai', aiRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/users', usersRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 