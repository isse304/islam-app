import mongoose, { Document, Schema } from 'mongoose';

interface IUserUsageBase {
    userId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: 'trial' | 'active' | 'canceled' | 'free';
    currentPeriodEnd?: Date;
    trialEnd?: Date;
    aiRequests: {
        count: number;
        lastRequest: Date;
    };
    aiRequestLimit: number;
}

export interface IUserUsage extends IUserUsageBase, Document {
    incrementAIRequestCount(): Promise<void>;
    canMakeAIRequest(): Promise<boolean>;
    isTrialActive(): boolean;
    daysLeftInTrial(): number | null;
}

const userUsageSchema = new Schema<IUserUsage>({
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

userUsageSchema.methods.incrementAIRequestCount = async function(): Promise<void> {
    this.aiRequests.count += 1;
    this.aiRequests.lastRequest = new Date();
    await this.save();
};

userUsageSchema.methods.canMakeAIRequest = async function(): Promise<boolean> {
    return this.aiRequests.count < this.aiRequestLimit;
};

// New method to check if trial is still active
userUsageSchema.methods.isTrialActive = function(): boolean {
    if (this.status !== 'trial' || !this.trialEnd) {
        return false;
    }
    
    const now = new Date();
    return now < this.trialEnd;
};

// New method to calculate days left in trial
userUsageSchema.methods.daysLeftInTrial = function(): number | null {
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

export const UserUsage = mongoose.model<IUserUsage>('UserUsage', userUsageSchema); 