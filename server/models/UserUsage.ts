import mongoose, { Document, Schema } from 'mongoose';

interface IUserUsageBase {
    userId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: 'free' | 'active';
    currentPeriodEnd?: Date;
    aiRequests: {
        count: number;
        lastRequest: Date;
    };
    aiRequestLimit: number;
}

export interface IUserUsage extends IUserUsageBase, Document {
    incrementAIRequestCount(): Promise<void>;
    canMakeAIRequest(): Promise<boolean>;
    validateTokenCount(tokenCount: number): boolean;
}

const userUsageSchema = new Schema<IUserUsage>({
    userId: { type: String, required: true, unique: true },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    status: {
        type: String,
        required: true,
        // enum: ['free', 'active'], // Temporarily remove enum constraint for debugging
        default: 'free'
    },
    currentPeriodEnd: Date,
    aiRequests: {
        count: { type: Number, default: 0 },
        lastRequest: { type: Date }
    },
    aiRequestLimit: { type: Number, default: 0 }
});

userUsageSchema.methods['incrementAIRequestCount'] = async function(): Promise<void> {
    this['aiRequests'].count += 1;
    this['aiRequests'].lastRequest = new Date();
    await this['save']();
};

userUsageSchema.methods['canMakeAIRequest'] = async function(): Promise<boolean> {
    // Check if last request was on a different day
    const now = new Date();
    const lastRequest = this['aiRequests'].lastRequest;
    
    if (lastRequest) {
        const lastRequestDate = new Date(lastRequest);
        if (lastRequestDate.getDate() !== now.getDate() || 
            lastRequestDate.getMonth() !== now.getMonth() || 
            lastRequestDate.getFullYear() !== now.getFullYear()) {
            // Reset count if it's a new day
            this['aiRequests'].count = 0;
            await this['save']();
        }
    }
    
    // Check both request count and token limit
    return this['aiRequests'].count < this['aiRequestLimit'];
};

// Add method to check token count
userUsageSchema.methods['validateTokenCount'] = function(tokenCount: number): boolean {
    const MAX_TOKENS = 15000; // Set maximum tokens per request
    return tokenCount <= MAX_TOKENS;
};

export const UserUsage = mongoose.model<IUserUsage>('UserUsage', userUsageSchema); 