import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage.js';
import { Request } from 'express';
import { auth } from '../config/firebase.js';

export class StripeService {
    private stripe: Stripe;
    private priceId: string;

    constructor() {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('Stripe secret key is required');
        }

        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            apiVersion: '2023-10-16'
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
        try {
            // Get user from Firebase
            const userRecord = await auth.getUser(userId);
            if (!userRecord) {
                throw new Error('User not found');
            }

            // Create or get customer
            let customer;
            const customers = await this.stripe.customers.search({
                query: `metadata['userId']:'${userId}'`,
            });

            if (customers.data.length > 0) {
                customer = customers.data[0];
            } else {
                // Create new customer
                customer = await this.stripe.customers.create({
                    email: userRecord.email || undefined,
                    metadata: { userId }
                });
            }

            // Create checkout session
            return await this.stripe.checkout.sessions.create({
                customer: customer.id,
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
        } catch (error) {
            console.error('Error creating checkout session:', error);
            throw error;
        }
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
        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    await this.handleSuccessfulSubscription(session);
                    break;
                case 'customer.subscription.deleted':
                    const subscription = event.data.object as Stripe.Subscription;
                    await this.handleCancelledSubscription(subscription);
                    break;
                case 'customer.subscription.updated':
                    const updatedSubscription = event.data.object as Stripe.Subscription;
                    await this.handleUpdatedSubscription(updatedSubscription);
                    break;
            }
        } catch (error) {
            console.error('Error handling webhook event:', error);
            throw error;
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

            if (subscriptions.data.length === 0) {
                return 'inactive';
            }

            const subscription = subscriptions.data[0];
            return subscription.status;
        } catch (error) {
            console.error('Error getting subscription status:', error);
            return 'inactive';
        }
    }

    private async handleSuccessfulSubscription(session: Stripe.Checkout.Session): Promise<void> {
        if (!session.client_reference_id) {
            console.error('No client_reference_id in session');
            return;
        }

        const userId = session.client_reference_id;
        
        try {
            // Update Firebase custom claims with correct premium features
            await auth.setCustomUserClaims(userId, {
                premium: true,
                subscriptionStatus: 'active',
                subscriptionEnd: null,
                features: {
                    emotionalDuaSearch: true,
                    aiTafsirChat: true,
                    duaInsights: true
                }
            });

            // Update usage record
            const usage = await this.getOrCreateUsageRecord(userId);
            usage.status = 'active';
            usage.currentPeriodEnd = null;
            await usage.save();

            // Force token refresh by revoking refresh tokens
            await auth.revokeRefreshTokens(userId);

            console.log(`Successfully updated subscription for user ${userId}`);
        } catch (error) {
            console.error('Error updating user subscription status:', error);
            throw error;
        }
    }

    private async handleCancelledSubscription(subscription: Stripe.Subscription): Promise<void> {
        try {
            const customerResponse = await this.stripe.customers.retrieve(subscription.customer as string);
            if (customerResponse.deleted) {
                throw new Error('Customer has been deleted');
            }

            const customer = customerResponse as Stripe.Customer;
            const userId = customer.metadata?.userId;
            if (!userId) {
                throw new Error('No userId found in customer metadata');
            }

            // Update Firebase custom claims
            await auth.setCustomUserClaims(userId, {
                premium: false,
                subscriptionStatus: 'canceled',
                subscriptionEnd: subscription.current_period_end
            });

            // Update usage record
            const usage = await this.getOrCreateUsageRecord(userId);
            usage.status = 'canceled';
            usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
            await usage.save();

            console.log(`Successfully cancelled subscription for user ${userId}`);
        } catch (error) {
            console.error('Error handling subscription cancellation:', error);
            throw error;
        }
    }

    private async handleUpdatedSubscription(subscription: Stripe.Subscription): Promise<void> {
        try {
            const customerResponse = await this.stripe.customers.retrieve(subscription.customer as string);
            if (customerResponse.deleted) {
                throw new Error('Customer has been deleted');
            }

            const customer = customerResponse as Stripe.Customer;
            const userId = customer.metadata?.userId;
            if (!userId) {
                throw new Error('No userId found in customer metadata');
            }

            // Update Firebase custom claims based on subscription status
            await auth.setCustomUserClaims(userId, {
                premium: subscription.status === 'active',
                subscriptionStatus: subscription.status,
                subscriptionEnd: subscription.current_period_end
            });

            // Update usage record
            const usage = await this.getOrCreateUsageRecord(userId);
            usage.status = subscription.status;
            usage.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
            await usage.save();

            console.log(`Successfully updated subscription status for user ${userId}`);
        } catch (error) {
            console.error('Error handling subscription update:', error);
            throw error;
        }
    }
} 