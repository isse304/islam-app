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
    freeTierQuestions: {
        count: number;
        limit: number;
        lastRequest: Date;
    };
}

export interface IUserUsage extends IUserUsageBase, Document {
    incrementAIRequestCount(): Promise<void>;
    canMakeAIRequest(): Promise<boolean>;
    validateTokenCount(tokenCount: number): boolean;
    canMakeFreeTierRequest(): Promise<boolean>;
    incrementFreeTierCount(): Promise<void>;
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
    aiRequestLimit: { type: Number, default: 0 },
    freeTierQuestions: {
        count: { type: Number, default: 0 },
        limit: { type: Number, default: 5 },
        lastRequest: { type: Date }
    }
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

userUsageSchema.methods['canMakeFreeTierRequest'] = async function(): Promise<boolean> {
    const now = new Date();
    const lastRequest = this['freeTierQuestions'].lastRequest;

    if (lastRequest) {
        const lastDate = new Date(lastRequest);
        if (lastDate.getDate() !== now.getDate() ||
            lastDate.getMonth() !== now.getMonth() ||
            lastDate.getFullYear() !== now.getFullYear()) {
            this['freeTierQuestions'].count = 0;
            await this['save']();
        }
    }

    return this['freeTierQuestions'].count < this['freeTierQuestions'].limit;
};

userUsageSchema.methods['incrementFreeTierCount'] = async function(): Promise<void> {
    this['freeTierQuestions'].count += 1;
    this['freeTierQuestions'].lastRequest = new Date();
    await this['save']();
};

userUsageSchema.methods['validateTokenCount'] = function(tokenCount: number): boolean {
    const MAX_TOKENS = 15000;
    return tokenCount <= MAX_TOKENS;
};

export const UserUsage = mongoose.model<IUserUsage>('UserUsage', userUsageSchema); 