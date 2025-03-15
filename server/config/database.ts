import mongoose from 'mongoose';
import winston from 'winston';

interface DatabaseConfig {
    uri: string;
    options: mongoose.ConnectOptions;
}

const configs: Record<string, DatabaseConfig> = {
    development: {
        uri: process.env.MONGODB_URI || 'mongodb+srv://isse304:ExrjEBm54q0yJWKQ@nura.inxyo.mongodb.net/?retryWrites=true&w=majority&appName=Nura',
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
        uri: process.env.MONGODB_URI!,
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

export const connectDatabase = async (logger: winston.Logger) => {
    const env = process.env.NODE_ENV || 'development';
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
        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB connection error:', error);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

        mongoose.connection.on('connected', () => {
            logger.info('MongoDB connected successfully');
        });

        // Set mongoose options
        mongoose.set('strictQuery', true);
        
        // Attempt to connect
        await mongoose.connect(config.uri, {
            ...config.options,
            autoIndex: env === 'development', // Only create indexes in development
        });

        logger.info(`Connected to MongoDB in ${env} mode`);

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                logger.info('MongoDB connection closed through app termination');
                process.exit(0);
            } catch (err) {
                logger.error('Error during MongoDB shutdown:', err);
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error('Error connecting to MongoDB:', error);
        if (env === 'development') {
            logger.info('Development mode: Please ensure MongoDB is running locally or provide a valid MONGODB_URI');
            logger.info('You can:');
            logger.info('1. Install and start MongoDB locally');
            logger.info('2. Use MongoDB Atlas (https://www.mongodb.com/cloud/atlas)');
            logger.info('3. Set MONGODB_URI in your .env file');
        }
        throw error;
    }
}; 