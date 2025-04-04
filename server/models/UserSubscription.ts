import mongoose from 'mongoose';

export interface IUserSubscription {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid' | 'paused' | 'inactive';
    plan: 'free' | 'standard' | 'premium';
    currentPeriodEnd: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const userSubscriptionSchema = new mongoose.Schema<IUserSubscription>({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    stripeCustomerId: {
        type: String,
        required: true
    },
    stripeSubscriptionId: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'trialing', 'unpaid', 'paused', 'inactive'],
        default: 'inactive'
    },
    plan: {
        type: String,
        enum: ['free', 'standard', 'premium'],
        default: 'free'
    },
    currentPeriodEnd: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for faster lookups
userSubscriptionSchema.index({ userId: 1 });
userSubscriptionSchema.index({ stripeCustomerId: 1 });
userSubscriptionSchema.index({ stripeSubscriptionId: 1 });

export const UserSubscription = mongoose.model<IUserSubscription>('UserSubscription', userSubscriptionSchema); 