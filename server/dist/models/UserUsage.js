"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserUsage = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const userUsageSchema = new mongoose_1.Schema({
    userId: { type: String, required: true, unique: true },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    status: {
        type: String,
        required: true,
        enum: ['trial', 'active', 'canceled', 'free'],
        default: 'trial'
    },
    currentPeriodEnd: Date,
    trialEnd: Date,
    aiRequests: {
        count: { type: Number, default: 0 },
        lastRequest: { type: Date }
    },
    aiRequestLimit: { type: Number, default: 50 }
});
userUsageSchema.methods.incrementAIRequestCount = async function () {
    this.aiRequests.count += 1;
    this.aiRequests.lastRequest = new Date();
    await this.save();
};
userUsageSchema.methods.canMakeAIRequest = async function () {
    return this.aiRequests.count < this.aiRequestLimit;
};
// New method to check if trial is still active
userUsageSchema.methods.isTrialActive = function () {
    if (this.status !== 'trial' || !this.trialEnd) {
        return false;
    }
    const now = new Date();
    return now < this.trialEnd;
};
// New method to calculate days left in trial
userUsageSchema.methods.daysLeftInTrial = function () {
    if (this.status !== 'trial' || !this.trialEnd) {
        return null;
    }
    const now = new Date();
    const diffTime = this.trialEnd.getTime() - now.getTime();
    if (diffTime <= 0) {
        return 0;
    }
    // Convert ms to days and round up
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
exports.UserUsage = mongoose_1.default.model('UserUsage', userUsageSchema);
//# sourceMappingURL=UserUsage.js.map