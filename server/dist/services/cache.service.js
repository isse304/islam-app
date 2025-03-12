"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
// Define cache schema
const cacheSchema = new mongoose_1.default.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});
// Create TTL index for automatic expiration
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Create model
const Cache = mongoose_1.default.model('Cache', cacheSchema);
class CacheService {
    constructor() {
        this.DEFAULT_TTL = 3600; // 1 hour in seconds
        this.RANDOM_TTL_RANGE = 300; // 5 minutes in seconds
    }
    generateTTL() {
        // Add random jitter to prevent cache stampede
        const ttl = this.DEFAULT_TTL + Math.floor(Math.random() * this.RANDOM_TTL_RANGE);
        return new Date(Date.now() + ttl * 1000);
    }
    async get(key) {
        const cache = await Cache.findOne({
            key,
            expiresAt: { $gt: new Date() }
        });
        return cache?.value || null;
    }
    async set(key, value, ttl) {
        const expiresAt = ttl
            ? new Date(Date.now() + ttl * 1000)
            : this.generateTTL();
        await Cache.findOneAndUpdate({ key }, { value, expiresAt }, { upsert: true });
    }
    async delete(key) {
        await Cache.deleteOne({ key });
    }
    async increment(key) {
        const result = await Cache.findOneAndUpdate({ key }, { $inc: { value: 1 } }, { upsert: true, new: true });
        return parseInt(result.value) || 0;
    }
    async getUsageStats() {
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
exports.CacheService = CacheService;
//# sourceMappingURL=cache.service.js.map