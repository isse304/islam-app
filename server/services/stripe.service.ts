import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';

export class StripeService {
    private stripe: Stripe;
    private priceId: string;
    private isDevMode: boolean;

    constructor(apiKey: string, priceId: string) {
        this.stripe = new Stripe(apiKey, {
            apiVersion: '2022-11-15'
        });
        this.priceId = priceId;
        this.isDevMode = process.env.NODE_ENV === 'development';
        
        if (this.isDevMode) {
            console.log('StripeService initialized in development mode');
        }
    }

    private async getOrCreateUsageRecord(userId: string): Promise<any> {
        try {
            let usage = await UserUsage.findOne({ userId });
            if (!usage) {
                usage = await UserUsage.create({
                    userId,
                    status: 'free',
                    aiRequests: { count: 0, lastReset: new Date() },
                    currentPeriodEnd: new Date()
                });
            }
            return usage;
        } catch (error) {
            console.error(`Error getting/creating usage record for user ${userId}:`, error);
            
            // In development, provide a fallback mock record
            if (this.isDevMode) {
                console.log('Returning mock usage record in development mode');
                return {
                    userId,
                    status: 'free',
                    save: async () => console.log('Mock save operation')
                };
            }
            throw error;
        }
    }

    async createCheckoutSession(userId: string): Promise<string> {
        try {
            // Development mode fallback for easier testing
            if (this.isDevMode && (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID)) {
                console.log(`[DEV] Creating mock checkout session for user ${userId}`);
                return `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/success?dev=true`;
            }
            
            const usage = await this.getOrCreateUsageRecord(userId);
            
            // Create or get Stripe customer
            let customer;
            if (!usage.stripeCustomerId) {
                customer = await this.stripe.customers.create({
                    metadata: { userId }
                });
                usage.stripeCustomerId = customer.id;
                await usage.save();
            } else {
                customer = await this.stripe.customers.retrieve(usage.stripeCustomerId);
            }

            // Configure trial period
            const trialPeriodDays = 7; // 7-day trial
            console.log(`Setting up ${trialPeriodDays}-day trial period for user ${userId}`);
            
            // Create Stripe checkout session with trial period
            const session = await this.stripe.checkout.sessions.create({
                customer: customer.id,
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [{
                    price: this.priceId,
                    quantity: 1,
                }],
                subscription_data: {
                    trial_period_days: trialPeriodDays,
                    metadata: { 
                        userId,
                        trialPeriodDays: String(trialPeriodDays)
                    }
                },
                success_url: `${process.env.CLIENT_URL}/subscription/success`,
                cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
                metadata: { 
                    userId,
                    hasTrial: 'true',
                    trialDays: String(trialPeriodDays)
                }
            });

            console.log(`Created checkout session with ID ${session.id} for user ${userId} with ${trialPeriodDays}-day trial`);
            return session.url || '';
        } catch (error) {
            console.error('Error creating checkout session:', error);
            
            // In development mode, return a mock URL
            if (this.isDevMode) {
                console.log('Returning mock checkout URL in development mode');
                return `${process.env.CLIENT_URL || 'http://localhost:4200'}/subscription/success?dev=true`;
            }
            
            throw error;
        }
    }

    async handleWebhook(event: Stripe.Event): Promise<void> {
        const { type, data } = event;
        console.log(`Processing webhook event: ${type}`);

        try {
            switch (type) {
                case 'checkout.session.completed': {
                    const session = data.object as Stripe.Checkout.Session;
                    const userId = session.metadata?.userId;
                    if (!userId) {
                        console.warn('Checkout session completed but no userId in metadata');
                        break;
                    }

                    const usage = await this.getOrCreateUsageRecord(userId);
                    const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
                    
                    const isTrialing = subscription.status === 'trialing';
                    console.log(`User ${userId} subscription status: ${subscription.status}, trialing: ${isTrialing}`);
                    
                    usage.status = isTrialing ? 'trialing' : 'active';
                    usage.stripeSubscriptionId = subscription.id;
                    usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                    
                    // Store trial information if applicable
                    if (isTrialing && subscription.trial_end) {
                        usage.trialEnd = new Date(subscription.trial_end * 1000);
                        console.log(`Trial period ends on ${usage.trialEnd} for user ${userId}`);
                    }
                    
                    await usage.save();
                    console.log(`Updated user ${userId} with subscription status: ${usage.status}`);
                    break;
                }
                case 'customer.subscription.updated': {
                    const subscription = data.object as Stripe.Subscription;
                    const userId = subscription.metadata?.userId;
                    if (!userId) {
                        console.warn('Subscription updated but no userId in metadata');
                        break;
                    }

                    const usage = await this.getOrCreateUsageRecord(userId);
                    
                    const isTrialing = subscription.status === 'trialing';
                    console.log(`User ${userId} subscription updated to: ${subscription.status}, trialing: ${isTrialing}`);
                    
                    usage.status = isTrialing ? 'trialing' : 
                                  (subscription.status === 'active' ? 'active' : subscription.status);
                    usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                    
                    // Update trial end if still in trial
                    if (isTrialing && subscription.trial_end) {
                        usage.trialEnd = new Date(subscription.trial_end * 1000);
                        console.log(`Trial period updated to end on ${usage.trialEnd} for user ${userId}`);
                    }
                    
                    await usage.save();
                    console.log(`Updated user ${userId} subscription status to ${usage.status}`);
                    break;
                }
                case 'customer.subscription.deleted': {
                    const subscription = data.object as Stripe.Subscription;
                    const userId = subscription.metadata?.userId;
                    if (!userId) {
                        console.warn('Subscription deleted but no userId in metadata');
                        break;
                    }

                    const usage = await this.getOrCreateUsageRecord(userId);
                    usage.status = 'canceled';
                    usage.stripeSubscriptionId = null;
                    await usage.save();
                    console.log(`User ${userId} subscription canceled`);
                    break;
                }
                case 'customer.subscription.trial_will_end': {
                    // This event is sent 3 days before a trial ends
                    const subscription = data.object as Stripe.Subscription;
                    const userId = subscription.metadata?.userId;
                    if (!userId) {
                        console.warn('Trial ending but no userId in metadata');
                        break;
                    }
                    
                    console.log(`Trial will end soon for user ${userId}, trial end date: ${subscription.trial_end ? new Date(subscription.trial_end * 1000) : 'unknown'}`);
                    
                    // Here you could send an email to notify the user that their trial is ending
                    break;
                }
            }
        } catch (error) {
            console.error('Error processing webhook event:', error);
            throw error;
        }
    }

    async getSubscriptionStatus(userId: string): Promise<{
        status: string;
        plan: 'free' | 'premium';
        currentPeriodEnd?: Date;
    }> {
        try {
            // Development mode fallback
            if (this.isDevMode && (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID)) {
                console.log(`[DEV] Returning mock subscription status for user ${userId}`);
                return {
                    status: 'active',
                    plan: 'premium',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                };
            }
            
            const usage = await this.getOrCreateUsageRecord(userId);
            
            // Check if trial is expired but status still shows trial
            if (usage.status === 'trialing' && usage.trialEnd && new Date() > usage.trialEnd) {
                console.log(`Trial expired for user ${userId}, updating status`);
                usage.status = 'free';
                await usage.save();
            }
            
            return {
                status: usage.status,
                plan: usage.status === 'free' ? 'free' : 'premium',
                currentPeriodEnd: usage.currentPeriodEnd
            };
        } catch (error) {
            console.error(`Error getting subscription status for user ${userId}:`, error);
            
            // In development mode, return a mock status
            if (this.isDevMode) {
                console.log('Returning mock subscription status in development mode');
                return {
                    status: 'active',
                    plan: 'premium',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                };
            }
            
            throw error;
        }
    }
} 