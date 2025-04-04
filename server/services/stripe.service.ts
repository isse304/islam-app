import Stripe from 'stripe';
import { UserUsage } from '../models/UserUsage';
import { Request } from 'express';
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

    async handleWebhookEvent(event: Stripe.Event): Promise<void> {
        const adminEmail = process.env['ADMIN_EMAIL']; // Get admin email for notifications
        try {
            const session = event.data.object as any; // Use 'any' carefully, consider more specific types if possible
            let userId: string | null = null;
            let stripeCustomerId: string | null = null;
            let subscriptionId: string | null = null;
            let subscriptionStatus: string | null = null;
            let currentPeriodEnd: Date | null = null;

            // Extract common data based on event type
            if (event.type === 'checkout.session.completed') {
                stripeCustomerId = session.customer as string;
                userId = session.client_reference_id;
                subscriptionId = session.subscription as string;
                // console.log(`[Webhook] Checkout completed for user ${userId}, customer ${stripeCustomerId}, sub ${subscriptionId}`);

                 // Send notification to admin about new potential subscription
                 if (adminEmail && userId) {
                    const userRecord = await auth.getUser(userId);
                    const subject = `🎉 New Potential Subscription Started (via Checkout)`;
                    const text = `User ${userRecord.email} (${userId}) completed checkout. Awaiting 'customer.subscription.created' or 'customer.subscription.updated' to confirm activation.`;
                    try {
                        await this.emailService.sendEmail(adminEmail, subject, text);
                    } catch (emailError) {
                        console.error(`[Webhook] Failed to send new checkout notification email:`, emailError);
                    }
                 }

            } else if (event.type.startsWith('customer.subscription.')) {
                const subscription = event.data.object as Stripe.Subscription;
                subscriptionId = subscription.id;
                stripeCustomerId = subscription.customer as string;
                subscriptionStatus = subscription.status;
                // Convert Unix timestamp (seconds) to JS Date object (milliseconds)
                currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

                // Find user subscription to get the userId
                const userSub = await UserSubscription.findOne({ stripeSubscriptionId: subscriptionId });
                if (userSub) {
                    userId = userSub.userId;
                    // console.log(`[Webhook] Subscription event ${event.type} for user ${userId}, sub ${subscriptionId}, status ${subscriptionStatus}`);
                } else {
                    // If it's a created event, the record might not exist yet. Try finding by customer ID.
                    const userSubByCustomer = await UserSubscription.findOne({ stripeCustomerId });
                    if (userSubByCustomer) {
                        userId = userSubByCustomer.userId;
                        // console.log(`[Webhook] Found user ${userId} via customer ID for subscription event ${event.type}`);
                        // Update the subscription ID if it's missing or different (first time seeing it)
                        if (!userSubByCustomer.stripeSubscriptionId || userSubByCustomer.stripeSubscriptionId !== subscriptionId) {
                            userSubByCustomer.stripeSubscriptionId = subscriptionId;
                            await userSubByCustomer.save();
                             console.log(`[Webhook] Updated subscription ID for user ${userId} to ${subscriptionId}`);
                        }
                    } else {
                        console.error(`[Webhook] UserSubscription not found for subscription ${subscriptionId} or customer ${stripeCustomerId} on event ${event.type}. Cannot determine userId.`);
                        // Cannot proceed without userId for claim updates or user emails
                        return;
                    }
                }
            } else if (event.type === 'invoice.payment_failed') {
                const invoice = event.data.object as Stripe.Invoice;
                stripeCustomerId = invoice.customer as string;
                 // Retrieve the subscription ID if available
                 if (typeof invoice.subscription === 'string') {
                    subscriptionId = invoice.subscription;
                 } else if (invoice.subscription) {
                    subscriptionId = invoice.subscription.id;
                 }
                 // Find user subscription to get the userId
                 const userSub = await UserSubscription.findOne({ stripeCustomerId });
                 if(userSub) {
                    userId = userSub.userId;
                     console.log(`[Webhook] Invoice payment failed for user ${userId}, customer ${stripeCustomerId}`);
                 } else {
                     console.error(`[Webhook] UserSubscription not found for customer ${stripeCustomerId} on invoice.payment_failed. Cannot determine userId.`);
                     return; // Cannot proceed without userId
                 }
            }

            // Ensure userId is found before proceeding with actions requiring it
            if (!userId) {
                console.error(`[Webhook] Could not determine userId for event ${event.type} (ID: ${event.id}). Aborting further processing for this event.`);
                // Send critical error email to admin
                if (adminEmail) {
                    const subject = `🚨 CRITICAL Stripe Webhook Error: UserId Missing`;
                    const text = `Could not determine userId for Stripe event type ${event.type} (ID: ${event.id}).
Customer ID: ${stripeCustomerId}
Subscription ID: ${subscriptionId}
Manual investigation required.`;
                    try {
                        await this.emailService.sendEmail(adminEmail, subject, text);
                    } catch (emailError) {
                        console.error(`[Webhook] Failed to send critical error email:`, emailError);
                    }
                }
                return;
            }

            // Get user email for user-facing notifications
            let userEmail: string | undefined;
            try {
                const userRecord = await auth.getUser(userId);
                userEmail = userRecord.email;
            } catch (authError) {
                console.error(`[Webhook] Failed to retrieve user email for ${userId}:`, authError);
                // Decide if processing should continue without user email. For critical updates, it should.
                // For user notifications, it cannot.
            }


            switch (event.type) {
                case 'checkout.session.completed':
                    // Handled above for extracting IDs, main logic in subscription events
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    if (subscriptionStatus && stripeCustomerId && userId && subscriptionId) {
                        const userSub = await UserSubscription.findOneAndUpdate(
                            { userId },
                            {
                                stripeCustomerId,
                                stripeSubscriptionId: subscriptionId,
                                status: subscriptionStatus,
                                currentPeriodEnd: currentPeriodEnd,
                                updatedAt: new Date()
                            },
                            { upsert: true, new: true, setDefaultsOnInsert: true }
                        );
                         console.log(`[Webhook] Upserted UserSubscription for user ${userId}, status: ${userSub.status}`);
                         await this.updateFirebaseClaims(userId, userSub.status, userSub.currentPeriodEnd);

                        // Send Welcome Email to USER only when subscription becomes active
                        if (userEmail && (userSub.status === 'active' || userSub.status === 'trialing') && event.type === 'customer.subscription.created') {
                            const subject = '🎉 Welcome to NuraAI Premium!';
                            const text = `Assalamu alaikum,

Your NuraAI Premium subscription is now active!

You can now access exclusive features like AI Tafsir Chat, Emotional Dua Search, and Dua Insights.

Explore your enhanced features now: [Link to App]

JazakAllah Khair for your support.`;
                            try {
                                await this.emailService.sendEmail(userEmail, subject, text);
                                console.log(`[Webhook] Sent welcome email to user ${userId}`);
                            } catch (emailError) {
                                console.error(`[Webhook] Failed to send welcome email to user ${userId}:`, emailError);
                            }
                        }

                        // Send notification to ADMIN on creation/update for tracking
                         if (adminEmail && (event.type === 'customer.subscription.created')) {
                             const subject = `🚀 Subscription ${event.type === 'customer.subscription.created' ? 'Created' : 'Updated'} for ${userEmail || userId}`;
                             const text = `User ${userEmail || userId} subscription details:
Status: ${userSub.status}
Sub ID: ${subscriptionId}
Customer ID: ${stripeCustomerId}
Period End: ${userSub.currentPeriodEnd?.toLocaleDateString()}`;
                             try {
                                 await this.emailService.sendEmail(adminEmail, subject, text);
                             } catch (emailError) {
                                 console.error(`[Webhook] Failed to send admin subscription notification email:`, emailError);
                             }
                         }
                    }
                    break;

                case 'customer.subscription.deleted': // User cancelled OR subscription ended naturally after cancellation
                    if (userId && subscriptionId) {
                         console.log(`[Webhook] Processing subscription deletion for user ${userId}, sub ${subscriptionId}`);
                         const userSub = await UserSubscription.findOne({ userId, stripeSubscriptionId: subscriptionId });

                         if (userSub) {
                             // Mark as canceled instead of deleting, keep period end date
                             userSub.status = 'canceled'; // Or potentially 'expired' if we want to differentiate
                             userSub.currentPeriodEnd = null; // Set end date to null as access is revoked immediately by Stripe on delete? Or keep it? Check Stripe docs. Let's set to null for now.
                             userSub.updatedAt = new Date();
                             await userSub.save();
                             console.log(`[Webhook] Marked UserSubscription as 'canceled' for user ${userId}`);
                             await this.updateFirebaseClaims(userId, userSub.status, userSub.currentPeriodEnd); // Update claims to remove premium access

                            // Send Cancellation Email to USER
                            if (userEmail) {
                                const subject = 'Your NuraAI Premium Subscription Has Been Cancelled';
                                const text = `Assalamu alaikum,

Your NuraAI Premium subscription has been cancelled.

Your access to premium features will end immediately (or based on Stripe's behavior for 'deleted' events).

If you believe this is an error, please contact support.

We hope to see you back soon.

JazakAllah Khair.`;
                                try {
                                    await this.emailService.sendEmail(userEmail, subject, text);
                                    console.log(`[Webhook] Sent cancellation email to user ${userId}`);
                                } catch (emailError) {
                                    console.error(`[Webhook] Failed to send cancellation email to user ${userId}:`, emailError);
                                }
                            }

                             // Send notification to ADMIN
                             if (adminEmail) {
                                 const subject = `❌ Subscription Cancelled/Deleted for ${userEmail || userId}`;
                                 const text = `Subscription ${subscriptionId} for user ${userEmail || userId} was deleted via Stripe webhook.
Status set to 'canceled'. Premium access revoked.`;
                                 try {
                                     await this.emailService.sendEmail(adminEmail, subject, text);
                                 } catch (emailError) {
                                     console.error(`[Webhook] Failed to send admin cancellation notification email:`, emailError);
                                 }
                             }

                         } else {
                             console.error(`[Webhook] UserSubscription not found for user ${userId} and sub ${subscriptionId} on deletion event.`);
                             // Attempt to update claims based on userId anyway, assuming deletion means revoked access
                             await this.updateFirebaseClaims(userId, 'canceled', null);
                         }
                    }
                    break;

                case 'invoice.payment_failed':
                     // Logic for handling failed payments (notifications, etc.)
                     if (userId && stripeCustomerId) {
                         const userSub = await UserSubscription.findOne({ stripeCustomerId });
                         if (userSub) {
                             // Update status if necessary (e.g., to 'past_due')
                             if (subscriptionId) { // Check if we got subscriptionId
                                 try {
                                     const subDetails = await this.stripe.subscriptions.retrieve(subscriptionId);
                                     if (userSub.status !== subDetails.status) {
                                         userSub.status = subDetails.status; // e.g., 'past_due'
                                         await userSub.save();
                                         console.log(`[Webhook] Updated UserSubscription status to ${userSub.status} for user ${userSub.userId} after failed payment.`);
                                         await this.updateFirebaseClaims(userSub.userId, userSub.status, userSub.currentPeriodEnd);
                                     }
                                 } catch (subError) {
                                     console.error(`[Webhook] Error retrieving subscription ${subscriptionId} details after payment failure:`, subError);
                                 }
                             } else {
                                console.warn(`[Webhook] Could not retrieve subscription details for failed payment event ${event.id} as subscription ID was not found on the invoice.`);
                             }
                             // Send Payment Failed Email to USER
                             if (userEmail) {
                                const subject = '⚠️ NuraAI Subscription Payment Failed';
                                const text = `Assalamu alaikum,

We were unable to process the payment for your NuraAI Premium subscription.

Please update your payment method to avoid interruption of service: [Link to Billing Portal or Instructions]

If you have already updated your payment method, please disregard this email.

JazakAllah Khair.`;
                                try {
                                    await this.emailService.sendEmail(userEmail, subject, text);
                                     console.log(`[Webhook] Sent payment failed email to user ${userId}`);
                                } catch (emailError) {
                                    console.error(`[Webhook] Failed to send payment failed email to user ${userId}:`, emailError);
                                }
                            }

                         } else {
                             console.error(`[Webhook] UserSubscription not found for customer ${stripeCustomerId} on invoice.payment_failed`);
                         }
                      }
                     break;

                default:
                    console.log(`[Webhook] Unhandled event type ${event.type}`);
            }
        } catch (error) {
             console.error('[Webhook] Error processing webhook event:', error);
             // Re-throw or handle error appropriately, maybe notify admin
             if (adminEmail) {
                 const subject = `🚨 Stripe Webhook Processing Error`;
                 const text = `Error processing Stripe webhook event type ${event.type}.\nError: ${error instanceof Error ? error.message : String(error)}\nEvent ID: ${event.id}`;
                 try {
                     await this.emailService.sendEmail(adminEmail, subject, text);
                 } catch (emailError) {
                     console.error(`[Webhook] Failed to send webhook error email:`, emailError);
                 }
             }
        }
    }

    private async updateFirebaseClaims(userId: string, status: string, currentPeriodEnd: Date | null): Promise<void> {
        try {
            const isPremium = status === 'active' || status === 'trialing';
            // Ensure currentPeriodEnd is a valid Date before calling getTime()
            const subscriptionEndTimestamp = (status === 'canceled' && currentPeriodEnd instanceof Date)
                ? currentPeriodEnd.getTime() / 1000 // Convert JS ms timestamp to Unix seconds
                : null;

            const claimsToSet = {
                premium: isPremium,
                subscriptionStatus: status,
                subscriptionEnd: subscriptionEndTimestamp, // Unix timestamp (seconds) or null
                 // Update features based on premium status
                 features: {
                     emotionalDuaSearch: isPremium,
                     aiTafsirChat: isPremium,
                     duaInsights: isPremium,
                     // Add other features here
                 }
            };

             console.log(`[Claims] Setting Firebase custom claims for user ${userId}:`, claimsToSet);
             await auth.setCustomUserClaims(userId, claimsToSet);
             console.log(`[Claims] Successfully set custom claims for user ${userId}.`);
        } catch (error) {
             console.error(`[Claims] Error setting custom claims for user ${userId}:`, error);
             // Optionally notify admin about claim update failures
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