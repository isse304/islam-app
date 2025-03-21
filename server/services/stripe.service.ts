import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';
import { Request } from 'express';

export class StripeService {
    private stripe: Stripe;
    private priceId: string;

    constructor() {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('Stripe secret key is required');
        }

        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: '2022-11-15'
        });
        this.priceId = process.env.STRIPE_PRICE_ID || '';
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
            if (process.env.NODE_ENV === 'development') {
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

    async createCheckoutSession(userId: string): Promise<Stripe.Checkout.Session> {
        return await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: this.priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.CLIENT_URL}/subscription/success`,
            cancel_url: `${process.env.CLIENT_URL}/subscription/cancel`,
            client_reference_id: userId,
        });
    }

    async constructWebhookEvent(req: Request): Promise<Stripe.Event> {
        const sig = req.headers['stripe-signature'] as string;
        return this.stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    }

    async handleWebhookEvent(event: Stripe.Event): Promise<void> {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object as Stripe.Checkout.Session;
                await this.handleSuccessfulSubscription(session);
                break;
            case 'customer.subscription.deleted':
                const subscription = event.data.object as Stripe.Subscription;
                await this.handleCancelledSubscription(subscription);
                break;
        }
    }

    async getSubscriptionStatus(userId: string): Promise<string> {
        try {
            const customer = await this.stripe.customers.search({
                query: `metadata['userId']:'${userId}'`,
            });

            if (customer.data.length === 0) {
                return 'inactive';
            }

            const subscriptions = await this.stripe.subscriptions.list({
                customer: customer.data[0].id,
                status: 'active',
            });

            return subscriptions.data.length > 0 ? 'active' : 'inactive';
        } catch (error) {
            console.error('Error getting subscription status:', error);
            return 'inactive';
        }
    }

    private async handleSuccessfulSubscription(session: Stripe.Checkout.Session): Promise<void> {
        if (session.client_reference_id) {
            // Update user's subscription status in your database
            // This is where you would update the user's role/permissions
        }
    }

    private async handleCancelledSubscription(subscription: Stripe.Subscription): Promise<void> {
        const customer = subscription.customer as string;
        // Update user's subscription status in your database
        // This is where you would remove the user's premium access
    }
} 