import mongoose from 'mongoose';

// Define cache schema
const cacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Create TTL index for automatic expiration
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create model
const Cache = mongoose.model('Cache', cacheSchema);

export class CacheService {
    private readonly DEFAULT_TTL = 3600; // 1 hour in seconds
    private readonly RANDOM_TTL_RANGE = 300; // 5 minutes in seconds

    private generateTTL(): Date {
        // Add random jitter to prevent cache stampede
        const ttl = this.DEFAULT_TTL + Math.floor(Math.random() * this.RANDOM_TTL_RANGE);
        return new Date(Date.now() + ttl * 1000);
    }

    async get(key: string): Promise<string | null> {
        const cache = await Cache.findOne({ 
            key,
            expiresAt: { $gt: new Date() }
        });
        return cache?.value || null;
    }

    async set(key: string, value: string, ttl?: number): Promise<void> {
        const expiresAt = ttl 
            ? new Date(Date.now() + ttl * 1000)
            : this.generateTTL();

        await Cache.findOneAndUpdate(
            { key },
            { value, expiresAt },
            { upsert: true }
        );
    }

    async delete(key: string): Promise<void> {
        await Cache.deleteOne({ key });
    }

    async increment(key: string): Promise<number> {
        const result = await Cache.findOneAndUpdate(
            { key },
            { $inc: { value: 1 } },
            { upsert: true, new: true }
        );
        return parseInt(result.value) || 0;
    }

    async getUsageStats(): Promise<{
        hits: number;
        misses: number;
        memory: string;
    }> {
        const [hits, misses, total] = await Promise.all([
            Cache.countDocuments({ key: /^cache:hits$/ }),
            Cache.countDocuments({ key: /^cache:misses$/ }),
            Cache.countDocuments()
        ]);

        return {
            hits: hits || 0,
            misses: misses || 0,
            memory: `${total} documents`
        };
    }
} 