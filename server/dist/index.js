"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const connect_mongo_1 = __importDefault(require("connect-mongo"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("./middleware/auth");
const ai_1 = __importDefault(require("./routes/ai"));
const monitoring_1 = __importDefault(require("./routes/monitoring"));
const users_1 = __importDefault(require("./routes/users"));
const winston_1 = __importDefault(require("winston"));
const database_1 = require("./config/database");
const subscription_1 = __importDefault(require("./routes/subscription"));
const usage_1 = __importDefault(require("./routes/usage"));
// Set NODE_ENV if not already set (development by default)
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Starting server in ${process.env.NODE_ENV} mode`);
// Load environment variables - try multiple locations
function loadEnvVariables() {
    const possiblePaths = [
        path_1.default.resolve(process.cwd(), '.env'), // Current working directory
        path_1.default.resolve(process.cwd(), '../.env'), // Parent directory
        path_1.default.resolve(__dirname, '../.env'), // Relative to current file's directory
        path_1.default.resolve(__dirname, '../../.env'), // Two levels up from current file
    ];
    console.log('Looking for .env file in:');
    for (const envPath of possiblePaths) {
        console.log(`- ${envPath} (exists: ${fs_1.default.existsSync(envPath)})`);
        if (fs_1.default.existsSync(envPath)) {
            const result = dotenv_1.default.config({ path: envPath });
            if (result.error) {
                console.warn(`Warning: Error loading .env from ${envPath}:`, result.error);
            }
            else {
                console.log(`✅ Successfully loaded .env from ${envPath}`);
                // In development, validate required variables are present
                validateEnvironmentVariables();
                return true;
            }
        }
    }
    if (process.env.NODE_ENV === 'development') {
        console.error('❌ Could not find .env file in any of the checked locations');
        console.log('Available environment variables:', Object.keys(process.env).length);
        return false;
    }
    // In production, we might get env vars from the deployment platform
    console.log('No .env file found, but continuing (might use environment variables from deployment platform)');
    return true;
}
function validateEnvironmentVariables() {
    // Log the presence of important environment variables
    const importantVars = [
        'MONGODB_URI',
        'OPENAI_API_KEY',
        'FIREBASE_PROJECT_ID',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_PRICE_ID',
        'RATE_LIMIT_WINDOW_MS',
        'RATE_LIMIT_MAX_REQUESTS',
        'DAILY_USER_LIMIT'
    ];
    console.log('\nEnvironment Variables Status:');
    for (const varName of importantVars) {
        const exists = !!process.env[varName];
        console.log(`- ${varName}: ${exists ? '✅ Set' : '❌ Missing'}`);
    }
    console.log();
}
// Try to load environment variables
loadEnvVariables();
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
// Initialize Express app
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Connect to database and start server
const startServer = async () => {
    try {
        await (0, database_1.connectDatabase)(logger);
        logger.info('Database connection established');
        // Apply middleware
        app.use((0, cors_1.default)({
            origin: process.env.NODE_ENV === 'development' ? true : process.env.CORS_ORIGIN?.split(','),
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
        }));
        // We're using Firebase auth, not Clerk, so we don't need this middleware
        logger.info('Using Firebase authentication');
        // Configure session middleware with secure settings and MongoDB store
        app.use((0, express_session_1.default)({
            secret: process.env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            store: connect_mongo_1.default.create({
                mongoUrl: process.env.MONGODB_URI,
                ttl: 24 * 60 * 60,
                autoRemove: 'native'
            }),
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'strict'
            }
        }));
        // Apply routes
        app.use('/api/subscription', subscription_1.default);
        app.use('/api/usage', usage_1.default);
        app.use('/api/ai', ai_1.default);
        app.use('/api/monitoring', monitoring_1.default);
        app.use('/api/users', users_1.default);
        // Health check endpoint
        app.get('/api/health', (req, res) => {
            res.status(200).json({
                status: 'ok',
                message: 'API is running',
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
            });
        });
        // Start server
        app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
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
    }
    catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};
startServer();
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