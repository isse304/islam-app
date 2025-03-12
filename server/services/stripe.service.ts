import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';

export class StripeService {
    private stripe: Stripe;
    private priceId: string;

    constructor(apiKey: string, priceId: string) {
        this.stripe = new Stripe(apiKey, {
            apiVersion: '2023-10-16'
        });
        this.priceId = priceId;
    }

    private async getOrCreateUsageRecord(userId: string): Promise<any> {
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
    }

    async createCheckoutSession(userId: string): Promise<string> {
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

        // Create Stripe checkout session
        const session = await this.stripe.checkout.sessions.create({
            customer: customer.id,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: this.priceId,
                quantity: 1,
            }],
            subscription_data: {
                trial_period_days: 7,
                metadata: { userId }
            },
            success_url: `${process.env.CLIENT_URL}/subscription/success`,
            cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
            metadata: { userId }
        });

        return session.url || '';
    }

    async handleWebhook(event: Stripe.Event): Promise<void> {
        const { type, data } = event;

        switch (type) {
            case 'checkout.session.completed': {
                const session = data.object as Stripe.Checkout.Session;
                const userId = session.metadata?.userId;
                if (!userId) break;

                const usage = await this.getOrCreateUsageRecord(userId);
                const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
                
                usage.status = subscription.status === 'trialing' ? 'trial' : 'active';
                usage.stripeSubscriptionId = subscription.id;
                usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                await usage.save();
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = data.object as Stripe.Subscription;
                const userId = subscription.metadata?.userId;
                if (!userId) break;

                const usage = await this.getOrCreateUsageRecord(userId);
                usage.status = subscription.status === 'trialing' ? 'trial' : 'active';
                usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                await usage.save();
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = data.object as Stripe.Subscription;
                const userId = subscription.metadata?.userId;
                if (!userId) break;

                const usage = await this.getOrCreateUsageRecord(userId);
                usage.status = 'canceled';
                usage.stripeSubscriptionId = null;
                await usage.save();
                break;
            }
        }
    }

    async getSubscriptionStatus(userId: string): Promise<{
        status: string;
        plan: 'free' | 'premium';
        currentPeriodEnd?: Date;
    }> {
        const usage = await this.getOrCreateUsageRecord(userId);
        
        return {
            status: usage.status,
            plan: usage.status === 'free' ? 'free' : 'premium',
            currentPeriodEnd: usage.currentPeriodEnd
        };
    }
} 