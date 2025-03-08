"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const express_2 = require("@clerk/express");
const ai_1 = __importDefault(require("./routes/ai"));
const monitoring_1 = __importDefault(require("./routes/monitoring"));
const users_1 = __importDefault(require("./routes/users"));
// Load production environment variables
console.log('Loading environment from: .env.production');
dotenv_1.default.config({ path: path_1.default.join(__dirname, '.env.production') });
// Log loaded environment variables (excluding sensitive data)
console.log('Environment:', {
    NODE_ENV: 'production',
    PORT: process.env.PORT,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    MONGODB_URI: process.env.MONGODB_URI ? '[SET]' : '[NOT SET]',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]'
});
// Validate required environment variables
const requiredEnvVars = [
    'CLERK_SECRET_KEY',
    'CLERK_PUBLISHABLE_KEY',
    'MONGODB_URI',
    'CORS_ORIGIN'
];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
    }
}
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Configure session middleware
app.use((0, express_session_1.default)({
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
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'http://localhost:4200'],
    credentials: true
}));
// Parse JSON bodies
app.use(express_1.default.json());
// Initialize Clerk middleware
app.use((0, express_2.clerkMiddleware)());
// Connect to MongoDB
mongoose_1.default.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/islamapp')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});
// Serve test auth page
app.get('/test-auth', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'test-auth.html'));
});
// Test authentication endpoint
app.get('/api/auth-test', (0, express_2.requireAuth)(), (req, res) => {
    res.json({
        message: 'Authentication successful!',
        user: {
            id: req.session.auth?.userId,
            sessionId: req.session.auth?.sessionId
        }
    });
});
// Routes
app.use('/api/ai', ai_1.default);
app.use('/api/monitoring', monitoring_1.default);
app.use('/api/users', users_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
