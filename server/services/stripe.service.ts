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

        // --- ADD TEST MODE CHECK ---
        const isTestMode = process.env['STRIPE_SECRET_KEY']?.startsWith('sk_test_');
        // -------------------------

        if (userSubscription && userSubscription.stripeCustomerId && !isTestMode) { // <-- Check for !isTestMode
            // Only use existing customer ID if NOT in test mode OR if it's guaranteed to be a test customer ID
            // For simplicity, we'll just force new customer creation in test mode if an ID is found
            stripeCustomerId = userSubscription.stripeCustomerId;
            console.log(`[Stripe] Found existing Stripe Customer ID: ${stripeCustomerId} for user ${userId}. Ensuring metadata is current...`);
            try {
                // *** ADDED BLOCK: Force update metadata for existing customer ***
                await this.stripe.customers.update(stripeCustomerId, {
                    metadata: { firebaseUID: userId } // Ensure the current Firebase UID is set
                });
                console.log(`[Stripe] Updated metadata for existing customer ${stripeCustomerId}`);
                // *** END OF ADDED BLOCK ***
            } catch (updateError) {
                 console.error(`[Stripe] Failed to update metadata for existing customer ${stripeCustomerId}:`, updateError);
                 // Optional: Decide if you want to proceed or throw an error.
                 // Proceeding might be okay if metadata update isn't strictly critical for checkout itself,
                 // but it's critical for the webhook later. Throwing an error might be safer.
                 // For now, we log the error and proceed.
            }
        } else if (isTestMode && userSubscription && userSubscription.stripeCustomerId) {
             console.log(`[Stripe] TEST MODE: Ignoring potentially live customer ID ${userSubscription.stripeCustomerId} found for user ${userId}. Will create a new test customer.`);
             // Let stripeCustomerId remain undefined so a new one is created below
        }
        
        // If no valid stripeCustomerId is set yet (either not found, or ignored in test mode)
        if (!stripeCustomerId) {
           try {
                // Fetch user email from Firebase Auth
            const userRecord = await auth.getUser(userId);
                const email = userRecord.email;

                if (!email) {
                    console.warn(`[Stripe] User ${userId} does not have an email address in Firebase Auth. Creating Stripe customer without email.`);
                }

                console.log(`[Stripe] Creating new Stripe Customer for user ${userId}${email ? ' with email ' + email : ''} (Mode: ${isTestMode ? 'Test' : 'Live'})`);
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

        // *** ADD LOGGING HERE ***
        console.log('[Webhook Debug] Received Headers:', JSON.stringify(req.headers, null, 2));
        console.log(`[Webhook Debug] Stripe Signature Header: ${sig}`);
        // Log the body type and potentially a snippet (be careful logging full sensitive payloads)
        console.log(`[Webhook Debug] req.body type: ${typeof req.body}`);
        if (Buffer.isBuffer(req.body)) {
            console.log(`[Webhook Debug] req.body is Buffer, length: ${req.body.length}`);
            // console.log(`[Webhook Debug] Raw Body Snippet: ${req.body.toString('utf8').substring(0, 200)}...`); // Optional: Log snippet
        } else {
            console.log('[Webhook Debug] req.body is NOT a Buffer. Body:', req.body);
        }
        // *** END LOGGING ***

        console.log('[Webhook] Attempting to construct event...');
        try {
            event = this.stripe.webhooks.constructEvent(req.body, sig, this.webhookSecret);
            console.log(`[Webhook] Event constructed successfully. Type: ${event.type}, ID: ${event.id}`);
        } catch (err: any) {
            console.error('[Webhook] Error verifying signature:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        // Initialize userId and userSub
        let userId: string | undefined;
        let userSub: IUserSubscription | null = null;
        const adminEmail = process.env['ALERT_EMAIL']; // Get admin email for notifications

        try {
            // Process based on event type
            console.log(`[Webhook] Processing event type: ${event.type}`);
            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    // Use client_reference_id as the primary way to get userId
                    userId = session.client_reference_id ?? session.metadata?.userId;
                    console.log(`[Webhook ${event.type}] Session ID: ${session.id}, User ID (from client_ref/metadata): ${userId}`);
                    if (!userId) {
                        console.error('[Webhook] Error: userId missing in session client_reference_id and metadata', session.id);
                        res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }
                    if (session.subscription) {
                        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
                        console.log(`[Webhook ${event.type}] Found subscription ID: ${subscriptionId}. Retrieving details...`);
                        const subscriptionDetails = await this.stripe.subscriptions.retrieve(subscriptionId);
                        console.log(`[Webhook ${event.type}] Retrieved subscription details. Status: ${subscriptionDetails.status}. Updating DB and claims for user ${userId}...`);
                        userSub = await this.updateUserSubscriptionStatus(userId, subscriptionDetails);
                        if (userSub) {
                            await this.updateFirebaseClaims(userId, userSub.status, userSub.currentPeriodEnd ?? null);
                            console.log(`[Webhook ${event.type}] Updated claims based on checkout completion for user ${userId}`);
                        } else {
                            console.error(`[Webhook ${event.type}] Failed to update DB/claims after checkout for user ${userId}`);
                        }
                    } else {
                         console.warn(`[Webhook ${event.type}] Checkout session ${session.id} completed, but no subscription ID found immediately. Waiting for customer.subscription.created/updated event.`);
                    }
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    const subscription = event.data.object as Stripe.Subscription;
                    // Prefer metadata, fallback to retrieving customer then checking metadata
                    userId = subscription.metadata?.userId;
                     if (!userId && typeof subscription.customer === 'string') {
                        try {
                            const customer = await this.stripe.customers.retrieve(subscription.customer);
                            if (!customer.deleted) {
                                userId = customer.metadata?.firebaseUID;
                            }
                        } catch (custError) {
                            console.error(`[Webhook ${event.type}] Error fetching customer ${subscription.customer} to get userId:`, custError);
                        }
                    }
                    console.log(`[Webhook ${event.type}] Subscription ID: ${subscription.id}, Status: ${subscription.status}, User ID (from metadata/customer): ${userId}`);
                    if (!userId) {
                        console.error(`[Webhook ${event.type}] Error: userId missing in subscription metadata and customer metadata`, subscription.id);
                        res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }

                    // --- Start Inner Try/Catch for the main logic ---
                    try {
                        // --- PRE-DB UPDATE LOG --- 
                        console.log(`[Webhook ${event.type}] PRE-DB_UPDATE: About to call updateUserSubscriptionStatus for user ${userId}`);
                        // Fetch OR Update the user subscription document
                        userSub = await this.updateUserSubscriptionStatus(userId, subscription);
                        // --- POST-DB UPDATE LOG --- 
                        console.log(`[Webhook ${event.type}] POST-DB_UPDATE: Finished calling updateUserSubscriptionStatus. Result userSub:`, !!userSub);

                        if (!userSub) {
                            console.error(`[Webhook ${event.type}] Failed to update/retrieve subscription in DB for user ${userId}, subscription ${subscription.id}`);
                            // If we can't get the DB record, we can't track email status, so skip email attempt.
                            // Still attempt claim update based on event data.
                        } else {
                             console.log(`[Webhook ${event.type}] Retrieved UserSubscription doc. Welcome email sent status: ${userSub.welcomeEmailSent}`);
                        }

                        // Determine status and period end (prioritize DB status if available, fallback to event)
                        const statusToUse = userSub?.status || subscription.status;
                        let periodEndToUse: Date | null = null;
                        // Use nullish coalescing for db status and check subscription event status explicitly
                        const rawPeriodEndFromDb = userSub?.currentPeriodEnd ?? null;
                        const rawPeriodEndFromEvent = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
                        
                        // Prioritize DB value if it exists, otherwise use event value
                        const finalRawPeriodEnd = rawPeriodEndFromDb ?? rawPeriodEndFromEvent;

                        if (finalRawPeriodEnd instanceof Date) {
                            periodEndToUse = finalRawPeriodEnd;
                        }
                        console.log(`[Webhook ${event.type}] Status to use for claims/email: ${statusToUse}, Period End: ${periodEndToUse}`);

                        // Fetch user info from Firebase
                        let userEmail: string | undefined;
                        let userName: string | undefined;
                        try {
                            console.log(`[Webhook ${event.type}] Fetching Firebase user record for ${userId}...`);
                            const userRecord = await auth.getUser(userId);
                            userEmail = userRecord.email;
                            userName = userRecord.displayName || userRecord.email?.split('@')[0] || 'Friend';
                            console.log(`[Webhook ${event.type}] Fetched Firebase user: ${userEmail}`);
                        } catch (authError) {
                            console.error(`[Webhook ${event.type}] Failed to fetch user ${userId} from Firebase Auth:`, authError);
                        }

                        // --- PRE-CLAIMS UPDATE LOG ---
                        console.log(`[Webhook ${event.type}] PRE-CLAIMS_UPDATE: About to call updateFirebaseClaims for user ${userId} with status: ${statusToUse}`);
                        await this.updateFirebaseClaims(userId, statusToUse, periodEndToUse);
                        // --- POST-CLAIMS UPDATE LOG ---
                        console.log(`[Webhook ${event.type}] POST-CLAIMS_UPDATE: Finished calling updateFirebaseClaims for user ${userId}`);

                        // Existing log check
                        console.log(`[Webhook Validation Check] Status being used before potential email/further processing:`, {
                            userId: userId,
                            statusFromUserSubModel: userSub?.status, // Status from the UserSubscription model result
                            statusUsedForClaims: statusToUse,        // Status calculated from userSub OR Stripe event
                            eventType: event.type
                        });

                        // Send Welcome Email (only if active/trialing AND not already sent)
                        if (userEmail && (statusToUse === 'active' || statusToUse === 'trialing') && userSub && !userSub.welcomeEmailSent) {
                             console.log(`[Webhook ${event.type}] Attempting to send premium welcome email to user ${userId} (${userEmail})...`);
                            try {
                                await this.emailService.sendWelcomeEmail(userEmail, userName || 'Friend');
                                console.log(`[Webhook ${event.type}] Sent premium welcome email to user ${userId}. Updating DB flag...`);
                                // Mark email as sent in the database
                                userSub.welcomeEmailSent = true;
                                await userSub.save();
                                console.log(`[Webhook ${event.type}] Marked welcomeEmailSent=true in DB for user ${userId}.`);
                            } catch (emailError) {
                                console.error(`[Webhook ${event.type}] Failed to send premium welcome email or update DB flag for user ${userId}:`, emailError);
                            }
                        } else if (userSub?.welcomeEmailSent) {
                            console.log(`[Webhook ${event.type}] Welcome email already sent for user ${userId}, skipping.`);
                        } else if (!userSub) {
                             console.log(`[Webhook ${event.type}] Skipping welcome email check because UserSubscription record was not found/updated.`);
                        } else {
                            console.log(`[Webhook ${event.type}] Conditions not met to send welcome email (Status: ${statusToUse}, Email Sent Flag: ${userSub?.welcomeEmailSent}, User Email Found: ${!!userEmail}).`);
                        }

                        // Send Admin Notification
                        if (adminEmail) {
                            console.log(`[Webhook ${event.type}] Attempting to send admin notification email to ${adminEmail}...`);
                             const subject = `🚀 Subscription ${event.type === 'customer.subscription.created' ? 'Created' : 'Updated'} for ${userEmail || userId}`;
                            const text = `User ${userEmail || userId} subscription details:\nStatus: ${statusToUse}\nSub ID: ${subscription.id}\nCustomer ID: ${subscription.customer}\nPeriod End: ${periodEndToUse?.toLocaleDateString() || 'N/A'}`;
                            try {
                                await this.emailService.sendEmail(adminEmail, subject, text);
                                 console.log(`[Webhook ${event.type}] Sent admin notification email.`);
                            } catch (emailError) {
                                console.error(`[Webhook ${event.type}] Failed to send admin subscription notification email:`, emailError);
                            }
                        }
                    // --- End Inner Try/Catch ---
                    } catch (innerError: any) {
                        console.error(`[Webhook ${event.type}] Caught inner error during processing for user ${userId}. Allowing webhook to succeed but logging error:`, innerError);
                        // Check if it's the specific UserUsage validation error we've been seeing
                        if (innerError.message?.includes('UserUsage validation failed') && innerError.errors?.status?.kind === 'enum') {
                            console.warn(`[Webhook ${event.type}] Confirmed specific UserUsage enum validation error occurred. Frontend should still work due to claims update.`);
                        } else {
                            // Log other unexpected errors more severely if needed
                            console.error(`[Webhook ${event.type}] An unexpected inner error occurred:`, innerError);
                        }
                         // Do NOT re-throw or send a 500 status. Allow the main flow to send 200 OK.
                    }
                    break;

                case 'customer.subscription.deleted':
                    const deletedSubscription = event.data.object as Stripe.Subscription;
                     // Prefer metadata, fallback to retrieving customer then checking metadata
                    userId = deletedSubscription.metadata?.userId;
                     if (!userId && typeof deletedSubscription.customer === 'string') {
                        try {
                            const customer = await this.stripe.customers.retrieve(deletedSubscription.customer);
                             if (!customer.deleted) {
                                userId = customer.metadata?.firebaseUID;
                            }
                        } catch (custError) {
                            console.error(`[Webhook ${event.type}] Error fetching customer ${deletedSubscription.customer} to get userId:`, custError);
                        }
                    }
                    console.log(`[Webhook ${event.type}] Subscription ID: ${deletedSubscription.id}, User ID (from metadata/customer): ${userId}`);
                    if (!userId) {
                        console.error(`[Webhook ${event.type}] Error: userId missing`, deletedSubscription.id);
                        res.status(400).send('Webhook Error: Missing userId');
                        return;
                    }

                     // Fetch user info for notifications
                    let deletedUserEmail: string | undefined;
                    try {
                         console.log(`[Webhook ${event.type}] Fetching Firebase user record for ${userId}...`);
                        const userRecord = await auth.getUser(userId);
                        deletedUserEmail = userRecord.email;
                         console.log(`[Webhook ${event.type}] Fetched Firebase user: ${deletedUserEmail}`);
                    } catch (authError) {
                        console.error(`[Webhook ${event.type}] Failed to fetch user ${userId} for deletion notification:`, authError);
                    }

                    console.log(`[Webhook ${event.type}] Marking DB subscription as canceled for user ${userId}...`);
                    const canceledSub = await UserSubscription.findOneAndUpdate(
                        { userId: userId },
                        {
                            status: 'canceled', // Use 'canceled' to reflect immediate intent
                            currentPeriodEnd: null,
                            cancelAtPeriodEnd: false, // Explicitly false
                            updatedAt: new Date()
                        },
                        { new: true }
                    );

                    if (canceledSub) {
                        console.log(`[Webhook ${event.type}] Marked UserSubscription as canceled in DB for user ${userId}`);
                         console.log(`[Webhook ${event.type}] Updating Firebase claims for user ${userId} to canceled...`);
                         await this.updateFirebaseClaims(userId, 'canceled', null);
                    } else {
                        console.warn(`[Webhook ${event.type}] No subscription found in DB to mark as canceled for user ${userId}. Still updating claims.`);
                         console.log(`[Webhook ${event.type}] Updating Firebase claims for user ${userId} to canceled...`);
                        await this.updateFirebaseClaims(userId, 'canceled', null);
                    }

                    // Send Cancellation Email to User
                    if (deletedUserEmail) {
                         console.log(`[Webhook ${event.type}] Attempting to send cancellation email to user ${userId} (${deletedUserEmail})...`);
                        const subject = 'Your NuraAI Subscription Has Been Canceled';
                        const text = `Assalamu alaikum,\n\nYour NuraAI Premium subscription has been canceled. \n\nIf you believe this was in error, please contact support.\n\nWe hope to see you back soon!\n\nThe NuraAI Team`;
                        try {
                            await this.emailService.sendEmail(deletedUserEmail, subject, text);
                            console.log(`[Webhook ${event.type}] Sent cancellation email to user ${userId}`);
                        } catch (emailError) {
                            console.error(`[Webhook ${event.type}] Failed to send cancellation email to user ${userId}:`, emailError);
                        }
                    }

                    // Send Cancellation Notification to Admin
                    if (adminEmail) {
                         console.log(`[Webhook ${event.type}] Attempting to send admin cancellation notification email to ${adminEmail}...`);
                        const subject = `❌ Subscription Canceled for ${deletedUserEmail || userId}`;
                        const text = `User ${deletedUserEmail || userId} subscription has been canceled.\nStripe Sub ID: ${deletedSubscription.id}\nStripe Customer ID: ${deletedSubscription.customer}`;
                        try {
                            await this.emailService.sendEmail(adminEmail, subject, text);
                             console.log(`[Webhook ${event.type}] Sent admin cancellation notification email.`);
                        } catch (emailError) {
                            console.error(`[Webhook ${event.type}] Failed to send admin cancellation notification email:`, emailError);
                        }
                    }
                    break;

                default:
                    console.log(`[Webhook] Unhandled event type ${event.type}`);
            }
        } catch (error) {
            console.error(`[Webhook] Internal error processing event ${event.type} (ID: ${event.id}):`, error);
            // Avoid sending detailed errors back to Stripe
            res.status(500).send('Internal Server Error during webhook processing.');
            return; // Stop processing
        }

        // Send a 200 OK response to acknowledge receipt of the event
        console.log(`[Webhook] Finished processing event ${event.type} (ID: ${event.id}). Sending 200 OK.`);
        res.json({ received: true });
    }

    private async updateFirebaseClaims(userId: string, status: string, periodEnd: Date | null): Promise<void> {
        const isActive = status === 'active' || status === 'trialing';
        const claims = {
            subscriptionStatus: status,
            premium: isActive,
            // Store period end only if the subscription is active/trialing, otherwise null
            subscriptionEnd: isActive && periodEnd ? Math.floor(periodEnd.getTime() / 1000) : null
        };
        console.log(`[Claims] Preparing to set claims for user ${userId}:`, claims);
        try {
            await auth.setCustomUserClaims(userId, claims);
            console.log(`[Claims] Successfully updated Firebase claims for user ${userId}.`);
        } catch (error) {
            // ADD LOG HERE
            console.error(`[Claims] Error during setCustomUserClaims for user ${userId}. Status trying to set was: ${status}`, error);
            console.error(`[Claims] Error setting custom claims for user ${userId}:`, error);
            // Consider re-throwing or logging to a monitoring service
            throw error; // Re-throw to see if this is the source
        }
    }

    private async updateUserSubscriptionStatus(userId: string, subscription: Stripe.Subscription): Promise<IUserSubscription | null> {
        const currentStatus = subscription.status.toLowerCase();
        const isPremiumActive = currentStatus === 'active' || currentStatus === 'trialing';

        const updateData = {
            stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
            stripeSubscriptionId: subscription.id,
            status: currentStatus, // Use variable
            plan: isPremiumActive ? 'premium' : 'free', // <-- Set plan based on status
            planId: subscription.items.data[0]?.price.id,
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: new Date()
        };
        console.log(`[DB Update] Preparing to update/insert UserSubscription for user ${userId} with data:`, updateData);
        try {
            const userSub = await UserSubscription.findOneAndUpdate(
                { userId },
                updateData,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`[DB Update] Successfully upserted UserSubscription for user ${userId}, new status: ${userSub.status}, Doc ID: ${userSub._id}`);
            return userSub;
        } catch (error) {
             // ADD LOG HERE
            console.error(`[DB Update] Error during UserSubscription.findOneAndUpdate for user ${userId}. Status trying to set was: ${updateData.status}`, error);
            console.error(`[DB Update] Error updating/inserting UserSubscription for ${userId}:`, error);
            return null; // Return null on failure
            // throw error; // Optionally re-throw to halt execution here if this is the cause
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