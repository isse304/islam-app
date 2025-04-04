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
        uri: process.env['MONGODB_URI'] || 'mongodb+srv://isse304:ExrjEBm54q0yJWKQ@nura.inxyo.mongodb.net/?retryWrites=true&w=majority&appName=Nura',
        options: {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4,
            retryWrites: true,
            retryReads: true,
            maxPoolSize: 10,
            minPoolSize: 5
        }
    },
    production: {
        uri: process.env['MONGODB_URI']!,
        options: {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4,
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 50,
            minPoolSize: 10,
            maxIdleTimeMS: 10000,
            compressors: ['zlib']
        }
    }
};

// Add proper error type
const handleError = (error: Error): void => {
    logger.error('MongoDB connection error:', error);
};

export const connectDatabase = async (externalLogger?: winston.Logger) => {
    const dbLogger = externalLogger || logger;
    const env = process.env['NODE_ENV'] || 'development';
    const config = configs[env];

    if (!config) {
        throw new Error(`Invalid environment: ${env}`);
    }

    // Validate MongoDB URI
    if (!config.uri) {
        throw new Error('MongoDB URI is not defined. Please set MONGODB_URI in your environment variables.');
    }

    try {
        // Add event listeners before connecting
        mongoose.connection.on('error', (error: Error) => {
            handleError(error);
        });

        mongoose.connection.on('disconnected', () => {
            dbLogger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            dbLogger.info('MongoDB reconnected');
        });

        mongoose.connection.on('connected', () => {
            dbLogger.info('MongoDB connected successfully');
        });

        // Set mongoose options
        mongoose.set('strictQuery', true);
        
        // Attempt to connect
        await mongoose.connect(config.uri, {
            ...config.options,
            autoIndex: env === 'development', // Only create indexes in development
        });

        dbLogger.info(`Connected to MongoDB in ${env} mode`);

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                dbLogger.info('MongoDB connection closed through app termination');
                process.exit(0);
            } catch (err) {
                dbLogger.error('Error during MongoDB shutdown:', err);
                process.exit(1);
            }
        });

    } catch (error) {
        dbLogger.error('Error connecting to MongoDB:', error);
        if (env === 'development') {
            dbLogger.info('Development mode: Please ensure MongoDB is running locally or provide a valid MONGODB_URI');
            dbLogger.info('You can:');
            dbLogger.info('1. Install and start MongoDB locally');
            dbLogger.info('2. Use MongoDB Atlas (https://www.mongodb.com/cloud/atlas)');
            dbLogger.info('3. Set MONGODB_URI in your .env file');
        }
        throw error;
    }
}; 