import mongoose, { Document, Schema, model } from 'mongoose';

export interface IUserSubscription extends Document {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'unpaid' | 'paused' | 'inactive';
    plan: 'free' | 'standard' | 'premium';
    planId?: string;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
    welcomeEmailSent?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const userSubscriptionSchema = new Schema<IUserSubscription>(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        stripeCustomerId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        stripeSubscriptionId: {
            type: String,
            unique: true,
            sparse: true,
            index: true
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
        planId: {
            type: String
        },
        currentPeriodEnd: {
            type: Date
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        },
        welcomeEmailSent: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Index for faster lookups
userSubscriptionSchema.index({ userId: 1 });
userSubscriptionSchema.index({ stripeCustomerId: 1 });
userSubscriptionSchema.index({ stripeSubscriptionId: 1 });

export const UserSubscription = model<IUserSubscription>('UserSubscription', userSubscriptionSchema); 