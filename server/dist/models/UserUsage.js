"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserUsage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userUsageSchema = new mongoose_1.default.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    count: {
        type: Number,
        default: 0
    },
    totalTokens: {
        type: Number,
        default: 0
    },
    lastReset: {
        type: Date,
        default: Date.now
    },
    lastRequest: {
        type: Date,
        default: Date.now
    },
    requests: [{
            timestamp: Date,
            tokens: Number,
            systemMessage: String,
            userMessage: String
        }]
});
// Index for faster queries
userUsageSchema.index({ lastReset: 1 });
exports.UserUsage = mongoose_1.default.model('UserUsage', userUsageSchema);
