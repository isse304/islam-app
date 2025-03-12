"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const connect_mongo_1 = __importDefault(require("connect-mongo"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const auth_1 = require("./middleware/auth");
const security_1 = __importDefault(require("./middleware/security"));
const ai_1 = __importDefault(require("./routes/ai"));
const monitoring_1 = __importDefault(require("./routes/monitoring"));
const users_1 = __importDefault(require("./routes/users"));
const winston_1 = __importDefault(require("winston"));
const database_1 = require("./config/database");
const subscription_1 = __importDefault(require("./routes/subscription"));
const usage_1 = __importDefault(require("./routes/usage"));
// Load environment variables first, before any other imports
const envPath = path_1.default.resolve(process.cwd(), '.env');
const result = dotenv_1.default.config({ path: envPath });
if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}
// Configure logging
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'combined.log' })
    ]
});
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston_1.default.transports.Console({
        format: winston_1.default.format.simple()
    }));
}
// Validate required environment variables
const requiredEnvVars = [
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'MONGODB_URI',
    'CORS_ORIGIN',
    'OPENAI_API_KEY',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_PRICE_ID',
    'STRIPE_WEBHOOK_SECRET'
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Apply security middleware
app.use(security_1.default.helmet);
app.use(security_1.default.compression);
app.use(security_1.default.rateLimiter);
app.use(security_1.default.securityHeaders);
// Configure session middleware with secure settings and MongoDB store
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: connect_mongo_1.default.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60, // 1 day
        autoRemove: 'native'
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    }
}));
// Configure CORS with strict options
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'development' ? true : process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
// Parse JSON bodies with size limits
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Serve static files with cache headers (only if assets directory exists)
const assetsPath = path_1.default.join(__dirname, '../dist/assets');
if (fs_1.default.existsSync(assetsPath)) {
    app.use('/assets', express_1.default.static(assetsPath, {
        maxAge: '1d',
        etag: true
    }));
}
// Initialize Clerk middleware
app.use((0, clerk_sdk_node_1.ClerkExpressWithAuth)({
    onError: (error) => {
        logger.error('Clerk auth error:', error);
        return {
            status: 401,
            message: 'Unauthorized'
        };
    }
}));
// Connect to database
(0, database_1.connectDatabase)(logger).catch(err => {
    logger.error('Failed to connect to database:', err);
    process.exit(1);
});
// Test authentication endpoint
app.get('/api/auth-test', (0, clerk_sdk_node_1.ClerkExpressWithAuth)(), (req, res) => {
    if (!req.auth?.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({
        message: 'Authentication successful!',
        user: {
            id: req.auth.userId
        }
    });
});
// Routes
app.use('/api/ai', ai_1.default);
app.use('/api/usage', usage_1.default);
app.use('/api/subscription', subscription_1.default);
app.use('/api/monitoring', monitoring_1.default);
app.use('/api/users', users_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});
// Global error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});
// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    mongoose_1.default.connection.close()
        .then(() => {
        logger.info('MongoDB connection closed.');
        process.exit(0);
    })
        .catch(err => {
        logger.error('Error during shutdown:', err);
        process.exit(1);
    });
});
// Start the server
if (process.env.NODE_ENV === 'production' && process.env.DOMAIN) {
    // In production with custom domain, use HTTPS
    const httpsOptions = {
        key: fs_1.default.readFileSync(path_1.default.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN, 'privkey.pem')),
        cert: fs_1.default.readFileSync(path_1.default.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN, 'cert.pem')),
        ca: fs_1.default.readFileSync(path_1.default.join(__dirname, '../greenlock.d/live/', process.env.DOMAIN, 'chain.pem'))
    };
    https_1.default.createServer(httpsOptions, app).listen(443, () => {
        logger.info('HTTPS Server running on port 443');
    });
    // Redirect HTTP to HTTPS
    const httpApp = (0, express_1.default)();
    httpApp.use((req, res) => {
        res.redirect(`https://${req.headers.host}${req.url}`);
    });
    httpApp.listen(80, () => {
        logger.info('HTTP Server running on port 80 (redirecting to HTTPS)');
    });
}
else {
    // In development or production without custom domain (e.g., Render)
    app.listen(port, () => {
        logger.info(`Server is running on port ${port} in ${process.env.NODE_ENV} mode`);
    });
}
app.get('/api/user-session', auth_1.authenticateUser, (req, res) => {
    const authReq = req;
    try {
        return res.json({
            userId: authReq.auth.userId
        });
    }
    catch (error) {
        console.error('Error fetching user session:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
//# sourceMappingURL=index.js.map