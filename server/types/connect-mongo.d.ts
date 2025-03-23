declare module 'connect-mongo' {
    import { SessionOptions } from 'express-session';
    import { MongoClientOptions } from 'mongodb';

    interface MongoStoreOptions {
        mongoUrl?: string;
        clientPromise?: Promise<any>;
        mongoOptions?: MongoClientOptions;
        dbName?: string;
        ttl?: number;
        autoRemove?: 'native' | 'interval' | 'disabled';
        autoRemoveInterval?: number;
        touchAfter?: number;
        stringify?: boolean;
        crypto?: {
            secret: boolean | string;
        };
    }

    class MongoStore {
        constructor(options: MongoStoreOptions);
        static create(options: MongoStoreOptions): MongoStore;
    }

    export default MongoStore;
} 