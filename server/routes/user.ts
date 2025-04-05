import express, { Response } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, withAuth, withPremium } from '../middleware/auth';
import mongoose, { Document, Schema } from 'mongoose';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import { StripeService } from '../services/stripe.service';
import { UserUsage } from '../models/UserUsage';
import { EmailService } from '../services/email.service';

const router = express.Router();

// Define interfaces
interface IPreferences {
    selectedReciter?: number;
    selectedTranslation?: string;
    bookmarks?: string[];
    lastState?: {
        isMushafView?: boolean;
        lastSurah?: number;
        lastVerse?: number;
        lastPage?: number;
        timestamp?: Date;
    };
    readingHistory?: any[]; // Adjust type if known
    fontSize?: number;
    isDarkMode?: boolean;
    arabicFont?: string;
    showWordByWord?: boolean;
    isDoublePageView?: boolean;
}

// Extend Mongoose Document
interface IUserPreferencesDocument extends Document {
    userId: string;
    preferences: IPreferences; 
}

interface IReadingHistoryEntry extends Document {
    userId: string;
    timestamp: Date;
    surah: number;
    verse: number;
}

// Create schemas
const readingHistorySchema = new Schema<IReadingHistoryEntry>({
    userId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    surah: { type: Number, required: true },
    verse: { type: Number, required: true }
});

// Create compound unique index on userId and surah to ensure one entry per surah per user
readingHistorySchema.index({ userId: 1, surah: 1 }, { unique: true });

// Add compound index for efficient user history retrieval and sorting
readingHistorySchema.index({ userId: 1, timestamp: -1 });

const preferencesSubSchema = new Schema<IPreferences>({ // Define sub-schema for typing
    selectedReciter: { type: Number, default: 1 },
    selectedTranslation: { type: String, default: '131' },
    bookmarks: [String],
    lastState: {
        isMushafView: Boolean,
        lastSurah: Number,
        lastVerse: Number,
        lastPage: Number,
        timestamp: { type: Date, default: Date.now }
    },
    readingHistory: [{
        surah: Number,
        verse: Number,
        timestamp: { type: Date, default: Date.now }
    }],
    fontSize: { type: Number, default: 24 },
    isDarkMode: { type: Boolean, default: false },
    arabicFont: { type: String, default: 'uthmani' },
    showWordByWord: { type: Boolean, default: true },
    isDoublePageView: { type: Boolean, default: false }
}, { _id: false }); // No _id for subdocument

const userPreferencesSchema = new Schema<IUserPreferencesDocument>({
    userId: { type: String, required: true, unique: true, index: true }, // Index userId
    preferences: { type: preferencesSubSchema, default: () => getDefaultPreferences() } // Use sub-schema
});

// Create models
const ReadingHistory = mongoose.model<IReadingHistoryEntry>('ReadingHistory', readingHistorySchema);
const UserPreferences = mongoose.model<IUserPreferencesDocument>('UserPreferences', userPreferencesSchema);

// Helper function to verify user access
const verifyUserAccess = (req: AuthenticatedRequest, userId: string): boolean => {
    console.log('Verifying user access:', {
        requestUserId: req.auth?.uid,
        targetUserId: userId,
        hasAuth: !!req.auth
    });
    if (!req.auth) return false;
    const hasAccess = req.auth.uid === userId;
    console.log('Access verification result:', hasAccess);
    return hasAccess;
};

// Helper function to get default preferences
const getDefaultPreferences = (): IPreferences => ({
    selectedReciter: 1,
    selectedTranslation: '131',
    bookmarks: [],
    lastState: {
        isMushafView: false,
        lastSurah: 1,
        lastVerse: 1,
        lastPage: 1,
        timestamp: new Date()
    },
    readingHistory: [],
    fontSize: 24,
    isDarkMode: false,
    arabicFont: 'uthmani',
    showWordByWord: true,
    isDoublePageView: false
});

// Instantiate StripeService (assuming EmailService is already instantiated)
const emailServiceInstance = new EmailService(); // Assuming this exists
const stripeService = new StripeService(emailServiceInstance); // Instantiate StripeService

// Get user data (preferences, bookmarks, history)
router.get('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        
        // Get or create user preferences
        const userPrefs = await UserPreferences.findOne({ userId }) || 
                         await UserPreferences.create(getDefaultPreferences());

        // Ensure preferences exist
        const preferences = userPrefs.preferences || getDefaultPreferences();

        res.json({
            success: true,
            preferences: preferences,
            bookmarks: preferences.bookmarks || [],
            history: preferences.readingHistory || []
        });
    } catch (error) {
        console.error('Error getting user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// Update user data
router.put('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const { preferences: newPreferences } = req.body;

        // Get or create user preferences
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs) {
            userPrefs = await UserPreferences.create(getDefaultPreferences());
        }

        // Ensure preferences exist
        const currentPreferences = userPrefs.preferences || getDefaultPreferences();

        // Update preferences
        if (newPreferences) {
            userPrefs.preferences = {
                ...currentPreferences,
                ...newPreferences,
                lastState: {
                    ...(currentPreferences.lastState || {}),
                    ...(newPreferences.lastState || {}),
                },
                bookmarks: newPreferences.bookmarks || currentPreferences.bookmarks || [],
                readingHistory: newPreferences.readingHistory || currentPreferences.readingHistory || []
            };
            await userPrefs.save();
        }

        // Get the updated preferences
        const savedPreferences = userPrefs.preferences || getDefaultPreferences();

        res.json({
            success: true,
            preferences: savedPreferences,
            bookmarks: savedPreferences.bookmarks || [],
            history: savedPreferences.readingHistory || []
        });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ error: 'Failed to update user data' });
    }
}));

// For backward compatibility - redirect old endpoints to new ones
router.get('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        console.log('Handling preferences request for user:', req.params.userId);
        console.log('Auth object:', req.auth);
        
        if (!verifyUserAccess(req, req.params.userId)) {
            console.log('Access denied for user:', req.params.userId);
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        console.log('Fetching preferences for user:', userId);
        
        // Fetch the lean document first
        const userPrefsResult = await UserPreferences.findOne({ userId }).lean();
        
        // Determine the actual preferences data
        const preferencesData = userPrefsResult 
            ? userPrefsResult.preferences // Use nested preferences from the found document
            : getDefaultPreferences();    // Use the default object if not found

        console.log('Found preferences:', !!preferencesData);
        res.json({
            success: true,
            preferences: preferencesData // Return the correctly determined preferences
        });
    } catch (error) {
        console.error('Error getting preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

router.put('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const newPreferences = req.body;

        // Find the document and update only the preferences field
        const updatedUserPrefs = await UserPreferences.findOneAndUpdate(
            { userId },
            { $set: { preferences: newPreferences } },
            { new: true, upsert: true }
        ).lean();

        if (!updatedUserPrefs) {
            throw new Error('Failed to update or create user preferences');
        }

        res.json({
            success: true,
            preferences: updatedUserPrefs.preferences
        });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
}));

// Get reading history
router.get('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const history = await ReadingHistory.find({ userId })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, history });
    } catch (error) {
        console.error('Error getting reading history:', error);
        res.status(500).json({ success: false, error: 'Failed to get reading history' });
    }
}));

// Save reading history entry
router.post('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const { surah, verse } = req.body;

        // Enhanced input validation
        if (!surah || !verse) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields: surah and verse are required.' 
            });
        }

        // Convert to numbers and validate
        const surahNum = Number(surah);
        const verseNum = Number(verse);

        if (isNaN(surahNum) || isNaN(verseNum)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid input: surah and verse must be valid numbers.' 
            });
        }

        if (surahNum < 1 || surahNum > 114 || verseNum < 1) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid input: surah must be between 1 and 114, verse must be positive.' 
            });
        }

        // Find existing entry for this surah
        let historyEntry = await ReadingHistory.findOne({ userId, surah: surahNum });
        
        if (historyEntry) {
            // Update existing entry
            historyEntry.verse = verseNum;
            historyEntry.timestamp = new Date();
            await historyEntry.save();
        } else {
            // Create new entry if none exists
            historyEntry = new ReadingHistory({
                userId,
                surah: surahNum,
                verse: verseNum,
                timestamp: new Date()
            });
            await historyEntry.save();
        }

        // Get or create user preferences with default values
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs) {
            // console.log(`[History Post ${userId}] No preferences found, creating new document.`);
            // Create new preferences ONLY IF they don't exist, INCLUDE userId
            userPrefs = new UserPreferences({
                userId: userId, // **Explicitly add userId here**
                preferences: getDefaultPreferences(),
                // Add other default fields if needed by the schema
            });
        }

        // Update lastState within the existing or newly created preferences
        if (!userPrefs.preferences) {
            // This case should technically be covered by the creation step above,
            // but as a safeguard, initialize if somehow still missing.
            // console.log(`[History Post ${userId}] Preferences object missing, initializing.`);
            userPrefs.preferences = getDefaultPreferences();
        }

        if (!userPrefs.preferences.lastState) {
            userPrefs.preferences.lastState = {
                isMushafView: false,
                lastSurah: surahNum,
                lastVerse: verseNum,
                lastPage: 1,
                timestamp: new Date()
            };
        } else {
            userPrefs.preferences.lastState = {
                ...userPrefs.preferences.lastState,
                lastSurah: surahNum,
                lastVerse: verseNum,
                timestamp: new Date()
            };
        }

        await userPrefs.save();

        res.json({ 
            success: true, 
            entry: historyEntry,
            message: 'Reading history updated successfully'
        });
    } catch (error) {
        console.error('Error saving reading history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save reading history',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}));

// Clear reading history
router.delete('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        await ReadingHistory.deleteMany({ userId });

        res.json({ success: true, message: 'Reading history cleared' });
    } catch (error) {
        console.error('Error clearing reading history:', error);
        res.status(500).json({ success: false, error: 'Failed to clear reading history' });
    }
}));

// Get user bookmarks
router.get('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        // Find user preferences, lean for performance as we only need bookmarks
        const userPrefsDoc = await UserPreferences.findOne({ userId }).lean<IUserPreferencesDocument>();

        // Safely access bookmarks, defaulting to an empty array
        const bookmarks = userPrefsDoc?.preferences?.bookmarks || [];

        res.json(bookmarks); // Always return an array

    } catch (error) {
        console.error('Error getting bookmarks:', error);
        res.status(500).json({ error: 'Internal server error getting bookmarks' }); // More specific error message
    }
}));

// Add bookmark
router.post('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const { verseReference } = req.body;

        if (!verseReference) {
            return res.status(400).json({ 
                success: false, 
                message: 'Verse reference is required',
                bookmarks: []
            });
        }

        // Validate verse reference format
        const [surah, verse] = verseReference.split(':').map(Number);
        if (isNaN(surah) || isNaN(verse) || surah < 1 || surah > 114 || verse < 1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verse reference format. Expected format: surah:verse where surah is 1-114 and verse is positive',
                bookmarks: []
            });
        }

        // Get or create user preferences with default values
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs || !userPrefs.preferences) {
            userPrefs = await UserPreferences.create(getDefaultPreferences());
        }

        // At this point we know userPrefs and preferences exist
        const preferences = userPrefs.preferences!;

        // Ensure bookmarks array exists
        if (!preferences.bookmarks) {
            preferences.bookmarks = [];
        }

        // Add bookmark if it doesn't exist
        if (!preferences.bookmarks.includes(verseReference)) {
            preferences.bookmarks.push(verseReference);
            await userPrefs.save();
        }

        res.json({ 
            success: true, 
            message: 'Bookmark added successfully',
            bookmarks: preferences.bookmarks 
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({ error: 'Failed to add bookmark' });
    }
}));

// Delete bookmark
router.delete('/:userId/bookmarks/:bookmark', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        const bookmark = req.params.bookmark;

        // Validate bookmark format
        const [surah, verse] = bookmark.split(':').map(Number);
        if (isNaN(surah) || isNaN(verse) || surah < 1 || surah > 114 || verse < 1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bookmark format',
                bookmarks: []
            });
        }

        // Get or create user preferences with default values
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs || !userPrefs.preferences) {
            userPrefs = await UserPreferences.create(getDefaultPreferences());
        }

        // At this point we know userPrefs and preferences exist
        const preferences = userPrefs.preferences!;

        // Ensure bookmarks array exists
        if (!preferences.bookmarks) {
            preferences.bookmarks = [];
        }

        // Remove bookmark
        preferences.bookmarks = preferences.bookmarks.filter(b => b !== bookmark);
        await userPrefs.save();

        res.json({ 
            success: true, 
            message: 'Bookmark removed successfully',
            bookmarks: preferences.bookmarks 
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({ error: 'Failed to remove bookmark' });
    }
}));

// Get user profile
router.get('/:userId/profile', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    const requestedUserId = req.params.userId;
    const startTime = Date.now(); // Start timing

    // Ensure the authenticated user is requesting their own profile
    if (!verifyUserAccess(req, requestedUserId)) {
      console.warn(`[Profile ${requestedUserId}] Unauthorized access attempt: Auth UID ${req.auth?.uid}`);
      return res.status(403).json({ error: 'Forbidden: You can only access your own profile.' });
    }

    const userId = req.auth!.uid; // Use uid from verified auth token

    console.log(`[Profile ${userId}] Handler started.`);

    try {
        // Fetch preferences and subscription status in parallel
        console.log(`[Profile ${userId}] Starting parallel DB queries...`);
        const prefsPromise = UserPreferences.findOne({ userId }).lean<IUserPreferencesDocument>();
        const subPromise = UserSubscription.findOne({ userId }).lean<IUserSubscription>();

        const prefsStartTime = Date.now();
        const prefsDoc = await prefsPromise;
        console.log(`[Profile ${userId}] Prefs query took ${Date.now() - prefsStartTime}ms. Found: ${!!prefsDoc}`);

        const subStartTime = Date.now();
        const subscriptionDoc = await subPromise;
        console.log(`[Profile ${userId}] Subscription query took ${Date.now() - subStartTime}ms. Found: ${!!subscriptionDoc}`);

        const dbQueriesEndTime = Date.now();
        console.log(`[Profile ${userId}] Finished parallel DB queries. Total DB time: ${dbQueriesEndTime - startTime}ms`);

        // Determine premium status: prioritize token claim, fallback to active subscription status
        const hasActiveSubscription = subscriptionDoc?.status === 'active';
        const isPremium = req.auth?.['premium'] === true || hasActiveSubscription; // Allow token claim to override DB

        // Get preferences, using defaults if not found in DB
        const preferencesData = prefsDoc?.preferences || getDefaultPreferences();

        // Construct the profile data
        const profileData = {
            id: userId,
            uid: userId,
            email: req.auth?.['email'] || '',
            firstName: '', // Placeholder
            lastName: '',  // Placeholder
            emailVerified: req.auth?.['email_verified'] || false,
            isAdmin: req.auth?.['admin'] === true, // Ensure boolean check
            isPremium: isPremium,
            preferences: { // Ensure all preference fields are present
                selectedReciter: preferencesData.selectedReciter ?? 1,
                selectedTranslation: preferencesData.selectedTranslation ?? '131',
                fontSize: preferencesData.fontSize ?? 24,
                isDarkMode: preferencesData.isDarkMode ?? false,
                arabicFont: preferencesData.arabicFont ?? 'uthmani',
                showWordByWord: preferencesData.showWordByWord ?? true,
                isDoublePageView: preferencesData.isDoublePageView ?? false,
                lastState: preferencesData.lastState || getDefaultPreferences().lastState
            },
            bookmarks: preferencesData.bookmarks || [],
            history: preferencesData.readingHistory || [], // Uses history from prefs doc
            subscriptionStatus: subscriptionDoc?.status || 'inactive',
            subscriptionEnd: subscriptionDoc?.currentPeriodEnd || null,
        };

        const processingEndTime = Date.now();
        console.log(`[Profile ${userId}] Profile data constructed. Processing time: ${processingEndTime - dbQueriesEndTime}ms`);
        console.log(`[Profile ${userId}] Profile fetched successfully. Total handler time: ${Date.now() - startTime}ms`);
        res.json(profileData);

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[Profile ${userId}] Error fetching profile after ${duration}ms:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));

// DELETE User Account (Handles Stripe Cancellation + Firebase Deletion)
router.delete('/me', withAuth(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.auth!.uid;
    console.log(`[API] Received request to delete account for user: ${userId}`);

    try {
        // 1. Find User Subscription data to get Stripe Customer ID
        const userSub = await UserSubscription.findOne({ userId });
        let stripeCustomerId: string | undefined | null = null;
        if (userSub) {
            stripeCustomerId = userSub.stripeCustomerId;
            console.log(`[DeleteUser] Found UserSubscription for ${userId}. Stripe Customer ID: ${stripeCustomerId}`);
        } else {
            console.log(`[DeleteUser] No UserSubscription record found for ${userId}. Skipping Stripe cancellation.`);
        }

        // 2. Cancel Active Stripe Subscriptions if Customer ID exists
        if (stripeCustomerId) {
            try {
                console.log(`[DeleteUser] Fetching active subscriptions for Stripe Customer: ${stripeCustomerId}`);
                const activeSubscriptions = await stripeService.getActiveSubscriptions(stripeCustomerId);

                if (activeSubscriptions.length > 0) {
                    console.log(`[DeleteUser] Found ${activeSubscriptions.length} active subscription(s) for cancellation.`);
                    for (const sub of activeSubscriptions) {
                        console.log(`[DeleteUser] Cancelling Stripe subscription ${sub.id} for customer ${stripeCustomerId}`);
                        await stripeService.cancelSubscriptionImmediately(sub.id);
                        console.log(`[DeleteUser] Successfully cancelled subscription ${sub.id}.`);
                    }
                } else {
                    console.log(`[DeleteUser] No active Stripe subscriptions found for customer ${stripeCustomerId}.`);
                }

                // --- Optional: Delete Stripe Customer ---
                // Uncomment the following lines to delete the Stripe Customer object itself.
                // This permanently removes payment methods and history associated with the customer in Stripe.
                // Consider the implications before enabling (e.g., user cannot easily resubscribe later).
                // try {
                //     console.log(`[DeleteUser] Deleting Stripe Customer ${stripeCustomerId}`);
                //     await stripe.customers.del(stripeCustomerId); // Assuming 'stripe' instance is available or add via StripeService method
                //     console.log(`[DeleteUser] Successfully deleted Stripe Customer ${stripeCustomerId}`);
                // } catch (stripeDelError) {
                //     console.error(`[DeleteUser] Error deleting Stripe Customer ${stripeCustomerId}:`, stripeDelError);
                //     // Log error but continue with deletion process
                // }
                // --- End Optional Deletion ---

            } catch (stripeError) {
                console.error(`[DeleteUser] Error handling Stripe resources for customer ${stripeCustomerId}:`, stripeError);
                // Log the error but proceed with Firebase/DB deletion if possible,
                // as the user wants their account gone regardless of Stripe issues.
                // Consider sending an admin alert about the Stripe failure.
            }
        }

        // 3. Delete Firebase User
        console.log(`[DeleteUser] Deleting Firebase user: ${userId}`);
        try {
            await admin.auth().deleteUser(userId);
            console.log(`[DeleteUser] Successfully deleted Firebase user: ${userId}`);
        } catch (firebaseError: any) {
             // If user was already deleted somehow, log it but don't fail the whole process
             if (firebaseError.code === 'auth/user-not-found') {
                 console.warn(`[DeleteUser] Firebase user ${userId} not found during deletion, possibly already deleted.`);
             } else {
                 console.error(`[DeleteUser] Error deleting Firebase user ${userId}:`, firebaseError);
                 // Throw error here? If Firebase deletion fails, maybe we shouldn't delete DB data?
                 // For now, let's throw to prevent DB deletion if Firebase deletion fails.
                 throw new Error(`Failed to delete Firebase user: ${firebaseError.message}`);
             }
        }


        // 4. Delete User Data from MongoDB
        console.log(`[DeleteUser] Deleting MongoDB records for user: ${userId}`);
        try {
            const subDeletion = await UserSubscription.deleteOne({ userId });
            console.log(`[DeleteUser] UserSubscription deletion result:`, subDeletion);
            const usageDeletion = await UserUsage.deleteOne({ userId });
            console.log(`[DeleteUser] UserUsage deletion result:`, usageDeletion);
            // Add deletion logic for UserPreferences and ReadingHistory
            const prefDeletion = await UserPreferences.deleteOne({ userId });
            console.log(`[DeleteUser] UserPreferences deletion result:`, prefDeletion);
            const historyDeletion = await ReadingHistory.deleteMany({ userId });
            console.log(`[DeleteUser] ReadingHistory deletion result:`, historyDeletion);
        } catch (dbError) {
            console.error(`[DeleteUser] Error deleting MongoDB data for user ${userId}:`, dbError);
            // Log error, consider alerting admin. Data might be orphaned.
        }

        console.log(`[DeleteUser] Account deletion process completed for user: ${userId}`);
        res.status(200).json({ success: true, message: 'Account deleted successfully.' });

    } catch (error) {
        console.error(`[API] Error during account deletion for user ${userId}:`, error);
        // Ensure error response structure is consistent
        const message = error instanceof Error ? error.message : 'An unexpected error occurred during account deletion.';
        res.status(500).json({ success: false, error: 'Account Deletion Failed', message: message });
    }
}));

export default router; 