import mongoose from 'mongoose';
import winston from 'winston';

interface DatabaseConfig {
    uri: string;
    options: mongoose.ConnectOptions;
}

// Create logger instance
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

const configs: Record<string, DatabaseConfig> = {
    development: {
        uri: process.env['MONGODB_URI'] || 'mongodb://127.0.0.1:27017/nura',
        options: {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            family: 4,
            retryWrites: true,
            retryReads: true,
            maxPoolSize: 5,  // Reduced from 10 for local development
            minPoolSize: 2,  // Reduced from 5 for local development
            keepAlive: true,
            keepAliveInitialDelay: 300000,
            autoCreate: true,
            heartbeatFrequencyMS: 10000
        }
    },
    production: {
        uri: process.env['MONGODB_URI']!,
        options: {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
            family: 4,
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10,  // Reduced from 50 to prevent memory exhaustion
            minPoolSize: 2,    // Reduced from 10 to save memory
            maxIdleTimeMS: 10000,
            compressors: ['zlib'],
            keepAlive: true,
            keepAliveInitialDelay: 300000,
            autoCreate: true,
            heartbeatFrequencyMS: 10000
        }
    }
};

// Add proper error type
const handleError = (error: Error): void => {
    logger.error('MongoDB connection error:', error);
    if (error.name === 'MongoNetworkError') {
        logger.info('Attempting to reconnect to MongoDB...');
        setTimeout(() => {
            connectDatabase().catch(handleError);
        }, 5000);
    }
};

// Add connection monitoring
mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected successfully');
});

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
    setTimeout(() => {
        connectDatabase().catch(handleError);
    }, 5000);
});

mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error:', error);
    if (error.name === 'MongoNetworkError') {
        setTimeout(() => {
            connectDatabase().catch(handleError);
        }, 5000);
    }
});

// Export the connect function
export async function connectDatabase(): Promise<void> {
    const env = process.env['NODE_ENV'] || 'development';
    const config = configs[env];

    if (!config) {
        throw new Error(`No database configuration found for environment: ${env}`);
    }

    if (!config.uri) {
        throw new Error('MONGODB_URI is not set.');
    }

    try {
        logger.info('Connecting to MongoDB...');
        await mongoose.connect(config.uri, {
            ...config.options,
            serverApi: {
                version: '1',
                strict: true,
                deprecationErrors: true
            }
        });
        logger.info('MongoDB connection established successfully');
    } catch (error) {
        logger.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}

export default {
    connectDatabase,
    handleError
}; 