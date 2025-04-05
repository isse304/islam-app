import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';
import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { EmailService } from './email.service';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables

export class StripeService {
    private stripe: Stripe;
    private priceId: string;
    private emailService: EmailService;
    private webhookSecret: string;

    constructor(emailService: EmailService) {
        if (!process.env['STRIPE_SECRET_KEY'] || !process.env['STRIPE_WEBHOOK_SECRET']) {
            throw new Error('Stripe secret key or webhook secret not configured');
        }

        this.stripe = new Stripe(process.env['STRIPE_SECRET_KEY'], { apiVersion: '2023-10-16' });
        this.priceId = process.env['STRIPE_PRICE_ID'] || '';
        this.emailService = emailService;
        this.webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
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
            if (process.env['NODE_ENV'] === 'development') {
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

    async createCheckoutSession(userId: string, priceId = process.env['STRIPE_PRICE_ID']): Promise<Stripe.Checkout.Session> {
        console.log(`[Stripe] Creating checkout session for user ${userId} and price ${priceId}`);
        if (!priceId) {
            throw new Error('Stripe Price ID not configured in environment variables.');
        }

        // Find or create Stripe Customer ID associated with Firebase UID
        let userSubscription = await UserSubscription.findOne({ userId });
        let stripeCustomerId: string | undefined;

        if (userSubscription && userSubscription.stripeCustomerId) {
            stripeCustomerId = userSubscription.stripeCustomerId;
            console.log(`[Stripe] Found existing Stripe Customer ID: ${stripeCustomerId} for user ${userId}`);
        } else {
            try {
                // Fetch user email from Firebase Auth
            const userRecord = await auth.getUser(userId);
                const email = userRecord.email;

                if (!email) {
                    console.warn(`[Stripe] User ${userId} does not have an email address in Firebase Auth. Creating Stripe customer without email.`);
                }

                console.log(`[Stripe] Creating new Stripe Customer for user ${userId}${email ? ' with email ' + email : ''}`);
                const customer = await this.stripe.customers.create({
                    email: email, // Associate email if available
                    metadata: { firebaseUID: userId } // Link Firebase UID in metadata
                });
                stripeCustomerId = customer.id;
                console.log(`[Stripe] Created new Stripe Customer ID: ${stripeCustomerId} for user ${userId}`);

                // Save the new customer ID back to our database
                if (userSubscription) {
                    userSubscription.stripeCustomerId = stripeCustomerId;
                    await userSubscription.save();
                } else {
                    await UserSubscription.create({ userId, stripeCustomerId, status: 'inactive' });
                }
            } catch (error) {
                console.error(`[Stripe] Error creating Stripe customer or fetching user email for ${userId}:`, error);
                throw new Error('Failed to prepare Stripe customer.');
            }
        }

        try {
            const session = await this.stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{ price: priceId, quantity: 1 }],
                mode: 'subscription',
                success_url: `${process.env['CLIENT_URL']}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env['CLIENT_URL']}/subscription?canceled=true`,
                customer: stripeCustomerId, // Use the determined Stripe Customer ID
                // Add client_reference_id to link session back to Firebase user
                client_reference_id: userId,
                // Optionally allow promotion codes
                allow_promotion_codes: true,
                 // Automatic tax calculation (configure in Stripe dashboard)
                automatic_tax: { enabled: true },
                // Collect billing address if needed
                billing_address_collection: 'auto', // 'required' or 'auto'
                customer_update: { address: 'auto' },
                // To prefill email if creating customer here (not needed if using existing customer)
                // customer_email: email // Only if customer ID is not provided
            });
            console.log(`[Stripe] Checkout session ${session.id} created for user ${userId}`);
            return session;
        } catch (error) {
            console.error(`[Stripe] Error creating Stripe checkout session for user ${userId}:`, error);
            throw error; // Re-throw the error to be caught by the route handler
        }
    }

    async createCustomerPortalSession(userId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
        console.log(`[Stripe] Attempting to create portal session for user ${userId}`);
        const userSubscription = await UserSubscription.findOne({ userId });

        if (!userSubscription || !userSubscription.stripeCustomerId) {
            console.error(`[Stripe] Stripe Customer ID not found for user ${userId}`);
            throw new Error('Stripe Customer ID not found for this user.');
        }

        const stripeCustomerId = userSubscription.stripeCustomerId;
        console.log(`[Stripe] Found Stripe Customer ID ${stripeCustomerId} for user ${userId}. Creating portal session with return URL: ${returnUrl}`);

        try {
            const portalSession = await this.stripe.billingPortal.sessions.create({
                customer: stripeCustomerId,
                return_url: returnUrl,
            });
            console.log(`[Stripe] Customer portal session created for user ${userId}`);
            return portalSession;
        } catch (error) {
            console.error(`[Stripe] Error creating Stripe customer portal session for user ${userId} (Customer ID: ${stripeCustomerId}):`, error);
            throw error; // Re-throw the error
        }
    }

    async getSubscriptionStatus(userId: string): Promise<string> {
        const userSubscription = await UserSubscription.findOne({ userId });
        return userSubscription?.status || 'inactive';
    }

    async constructWebhookEvent(req: Request): Promise<Stripe.Event> {
        const sig = req.headers['stripe-signature'] as string;
        return this.stripe.webhooks.constructEvent(req.body, sig, this.webhookSecret);
    }

    async handleWebhookEvent(req: Request, res: Response): Promise<void> {
        const sig = req.headers['stripe-signature'] as string;
        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(req.body, sig, this.webhookSecret);
        } catch (err: any) {
            console.error('[Webhook] Error verifying signature:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        console.log(`[Webhook] Received event: ${event.type}`);

        let userId: string | undefined;
        let userSub: IUserSubscription | null = null;
        const adminEmail = process.env['ALERT_EMAIL']; // Get admin email for notifications

        try {
            // Process based on event type
            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    userId = session.metadata?.userId;
                    if (!userId) {
                        console.error('[Webhook] Error: userId missing in checkout session metadata', session.id);
                        res.status(400).send('Webhook Error: Missing userId in metadata');
                        return;
                    }
                    // Retrieve the subscription details if needed, or wait for subscription created event
                    if (session.subscription) {
                        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                        const subscriptionDetails = await this.stripe.subscriptions.retrieve(subscriptionId);
                        userSub = await this.updateUserSubscriptionStatus(userId, subscriptionDetails);
                        if (userSub) {
                             await this.updateFirebaseClaims(userId, userSub.status, userSub.currentPeriodEnd);
                             console.log(`[Webhook] Updated claims based on checkout completion for user ${userId}`);
                        } else {
                            console.error(`[Webhook] Failed to update DB/claims after checkout for user ${userId}`);
                        }
                    }
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    const subscription = event.data.object as Stripe.Subscription;
                    userId = subscription.metadata?.userId;
                    if (!userId) {
                        console.error('[Webhook] Error: userId missing in subscription metadata', subscription.id);
                        res.status(400).send('Webhook Error: Missing userId in metadata');
                        return;
                    }

                    // Update subscription status in our database
                    userSub = await this.updateUserSubscriptionStatus(userId, subscription);
                    if (!userSub) {
                        console.error(`[Webhook] Failed to update subscription in DB for user ${userId}, subscription ${subscription.id}`);
                        // Still try to update claims based on Stripe data as fallback
                    }

                    // Fetch user info from Firebase AFTER updating DB/getting userSub status
                    let userEmail: string | undefined;
                    let userName: string | undefined;
                    try {
                        const userRecord = await auth.getUser(userId);
                        userEmail = userRecord.email;
                        userName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Friend';
                    } catch (authError) {
                        console.error(`[Webhook] Failed to fetch user ${userId} from Firebase Auth:`, authError);
                    }

                    // Determine the status and period end to use for claims and emails
                    const statusToUse = userSub?.status || subscription.status;
                    const periodEndToUse = userSub?.currentPeriodEnd || (subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null);

                    // Update Firebase claims
                    await this.updateFirebaseClaims(userId, statusToUse, periodEndToUse);

                    // Send Welcome Email to USER only when subscription becomes active/trialing on CREATION
                    if (userEmail && (statusToUse === 'active' || statusToUse === 'trialing') && event.type === 'customer.subscription.created') {
                        try {
                            await this.emailService.sendWelcomeEmail(userEmail, userName || 'Friend');
                            console.log(`[Webhook] Sent premium welcome email to user ${userId}`);
                        } catch (emailError) {
                            console.error(`[Webhook] Failed to send premium welcome email to user ${userId}:`, emailError);
                        }
                    }

                    // Send notification email to ADMIN
                    if (adminEmail) {
                        const subject = `🚀 Subscription ${event.type === 'customer.subscription.created' ? 'Created' : 'Updated'} for ${userEmail || userId}`;
                        const text = `User ${userEmail || userId} subscription details:\nStatus: ${statusToUse}\nSub ID: ${subscription.id}\nCustomer ID: ${subscription.customer}\nPeriod End: ${periodEndToUse?.toLocaleDateString() || 'N/A'}`;
                        try {
                            await this.emailService.sendEmail(adminEmail, subject, text);
                        } catch (emailError) {
                            console.error(`[Webhook] Failed to send admin subscription notification email:`, emailError);
                        }
                    }
                    break;

                case 'customer.subscription.deleted':
                    const deletedSubscription = event.data.object as Stripe.Subscription;
                    userId = deletedSubscription.metadata?.userId;
                    if (!userId) {
                        console.error('[Webhook] Error: userId missing in deleted subscription metadata', deletedSubscription.id);
                        res.status(400).send('Webhook Error: Missing userId in metadata');
                        return;
                    }

                    // Fetch user info for notifications
                    let deletedUserEmail: string | undefined;
                    try {
                        const userRecord = await auth.getUser(userId);
                        deletedUserEmail = userRecord.email;
                    } catch (authError) {
                        console.error(`[Webhook] Failed to fetch user ${userId} for deletion notification:`, authError);
                    }

                    // Update DB status to 'canceled' instead of deleting
                    const canceledSub = await UserSubscription.findOneAndUpdate(
                        { userId: userId }, // Find by userId
                        {
                            status: 'canceled',
                            currentPeriodEnd: null, // Indicate immediate cancellation/end
                            cancelAtPeriodEnd: false,
                            updatedAt: new Date()
                        },
                        { new: true } // Return the updated document
                    );

                    if (canceledSub) {
                        console.log(`[Webhook] Marked UserSubscription as canceled for user ${userId}`);
                         // Update claims to reflect cancellation
                         await this.updateFirebaseClaims(userId, 'canceled', null);
                    } else {
                        console.warn(`[Webhook] No subscription found in DB to mark as canceled for user ${userId}`);
                        // Still update claims as a safety measure
                        await this.updateFirebaseClaims(userId, 'canceled', null);
                    }

                    // Send Cancellation Email to User
                    if (deletedUserEmail) {
                        const subject = 'Your NuraAI Subscription Has Been Canceled';
                        const text = `Assalamu alaikum,\n\nYour NuraAI Premium subscription has been canceled. Your access will continue until the end of your current billing period if applicable, otherwise it ends now.\n\nIf you believe this was in error, please contact support.\n\nWe hope to see you back soon!\n\nThe NuraAI Team`;
                        // TODO: Add HTML version for cancellation email
                        try {
                            await this.emailService.sendEmail(deletedUserEmail, subject, text);
                            console.log(`[Webhook] Sent cancellation email to user ${userId}`);
                        } catch (emailError) {
                            console.error(`[Webhook] Failed to send cancellation email to user ${userId}:`, emailError);
                        }
                    }

                    // Send Cancellation Notification to Admin
                    if (adminEmail) {
                        const subject = `❌ Subscription Canceled for ${deletedUserEmail || userId}`;
                        const text = `User ${deletedUserEmail || userId} subscription has been canceled.\nStripe Sub ID: ${deletedSubscription.id}\nStripe Customer ID: ${deletedSubscription.customer}`;
                        try {
                            await this.emailService.sendEmail(adminEmail, subject, text);
                        } catch (emailError) {
                            console.error(`[Webhook] Failed to send admin cancellation notification email:`, emailError);
                        }
                    }
                    break;

                default:
                    console.log(`[Webhook] Unhandled event type ${event.type}`);
            }
        } catch (error) {
            console.error('[Webhook] Internal error handling event:', error);
            // Send generic error response? Avoid sending error details.
            res.status(500).send('Internal Server Error');
            return;
        }

        // Send a 200 OK response to acknowledge receipt of the event
        res.json({ received: true });
    }

    private async updateFirebaseClaims(userId: string, status: string, periodEnd: Date | null): Promise<void> {
        try {
            const claims = {
                subscriptionStatus: status,
                premium: status === 'active' || status === 'trialing',
                subscriptionEnd: periodEnd ? Math.floor(periodEnd.getTime() / 1000) : null
            };
            await auth.setCustomUserClaims(userId, claims);
            console.log(`[StripeService] Updated Firebase claims for user ${userId}:`, claims);
        } catch (error) {
            console.error(`[StripeService] Error setting custom claims for user ${userId}:`, error);
        }
    }

    private async updateUserSubscriptionStatus(userId: string, subscription: Stripe.Subscription): Promise<IUserSubscription | null> {
        try {
            const userSub = await UserSubscription.findOneAndUpdate(
                { userId },
                {
                    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
                    stripeSubscriptionId: subscription.id,
                    status: subscription.status,
                    planId: subscription.items.data[0]?.price.id,
                    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    updatedAt: new Date()
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`[StripeService] Upserted UserSubscription for user ${userId}, status: ${userSub.status}`);
            return userSub;
        } catch (error) {
            console.error(`[StripeService] Error updating UserSubscription for ${userId}:`, error);
            return null;
        }
    }

    /**
     * Fetches all active subscriptions for a given Stripe Customer ID.
     * @param customerId The Stripe Customer ID.
     * @returns A promise that resolves to an array of active Stripe Subscription objects.
     */
    async getActiveSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
        console.log(`[StripeService] Fetching active subscriptions for customer: ${customerId}`);
        try {
            const subscriptions = await this.stripe.subscriptions.list({
                customer: customerId,
                status: 'active',
                limit: 10, // Adjust limit as needed, though most users have 1
            });
            console.log(`[StripeService] Found ${subscriptions.data.length} active subscriptions.`);
            return subscriptions.data;
        } catch (error) {
            console.error(`[StripeService] Error fetching active subscriptions for customer ${customerId}:`, error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    /**
     * Cancels a Stripe subscription immediately (at the end of the current period is default).
     * @param subscriptionId The ID of the Stripe subscription to cancel.
     * @returns A promise that resolves to the cancelled Stripe Subscription object.
     */
    async cancelSubscriptionImmediately(subscriptionId: string): Promise<Stripe.Subscription> {
        console.log(`[StripeService] Cancelling subscription immediately: ${subscriptionId}`);
        try {
            const cancelledSubscription = await this.stripe.subscriptions.cancel(subscriptionId);
            // To cancel immediately instead of at period end, use update:
            // const cancelledSubscription = await this.stripe.subscriptions.update(subscriptionId, {
            //   cancel_at_period_end: false, // Might require immediate cancellation logic
            // });
            // Actually, subscriptions.cancel() is sufficient and preferred.
            console.log(`[StripeService] Subscription ${subscriptionId} cancelled successfully.`);
            return cancelledSubscription;
        } catch (error) {
            console.error(`[StripeService] Error cancelling subscription ${subscriptionId}:`, error);
            throw error; // Re-throw the error
        }
    }
} 