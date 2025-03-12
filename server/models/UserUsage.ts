import mongoose, { Document, Schema } from 'mongoose';

interface IUserUsageBase {
    userId: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    status: 'trial' | 'active' | 'canceled' | 'free';
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

export const UserUsage = mongoose.model<IUserUsage>('UserUsage', userUsageSchema); 