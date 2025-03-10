import mongoose from 'mongoose';
import winston from 'winston';

interface DatabaseConfig {
    uri: string;
    options: mongoose.ConnectOptions;
}

const configs: Record<string, DatabaseConfig> = {
    development: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/islamapp',
        options: {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4
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

    try {
        await mongoose.connect(config.uri, config.options);
        logger.info(`Connected to MongoDB in ${env} mode`);

        // Set up connection monitoring
        mongoose.connection.on('error', (error) => {
            logger.error('MongoDB connection error:', error);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

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
        process.exit(1);
    }
}; 