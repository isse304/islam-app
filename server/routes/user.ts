import express, { Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { AuthenticatedRequest, withAuth, withPremium } from '../middleware/auth';
import mongoose, { Document, Schema } from 'mongoose';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import { StripeService } from '../services/stripe.service';
import { UserUsage } from '../models/UserUsage';
import { EmailService } from '../services/email.service';
import mailchimp from '@mailchimp/mailchimp_marketing';
import crypto from 'crypto';

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
    if (!req.auth) return false;
    const hasAccess = req.auth.uid === userId;
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

// Configure Mailchimp
try {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
  if (!apiKey || !serverPrefix) {
    throw new Error('Mailchimp API Key or Server Prefix not found in environment variables.');
  }
  mailchimp.setConfig({
    apiKey: apiKey,
    server: serverPrefix, 
  });
} catch (error) {
  // console.error('Error configuring Mailchimp client:', error);
  // Allow server to continue even if Mailchimp config fails initially.
  // Routes using Mailchimp will check config later.
}

// Keep EmailService instance for other potential uses (like contact form)
const emailServiceInstance = new EmailService();
const stripeService = new StripeService(emailServiceInstance); // Pass instance

// Get user data (preferences, bookmarks, history)
router.get('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
        next(error);
    }
}));

// Update user data
router.put('/:userId/data', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
        next(error);
    }
}));

// For backward compatibility - redirect old endpoints to new ones
router.get('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        
        // Fetch the lean document first
        const userPrefsResult = await UserPreferences.findOne({ userId }).lean();
        
        // Determine the actual preferences data
        const preferencesData = userPrefsResult 
            ? userPrefsResult.preferences // Use nested preferences from the found document
            : getDefaultPreferences();    // Use the default object if not found

        res.json({
            success: true,
            preferences: preferencesData // Return the correctly determined preferences
        });
    } catch (error) {
        next(error);
    }
}));

router.put('/:userId/preferences', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
        next(error);
    }
}));

// Get reading history
// Remove the temporary debugging code and reinstate withAuth
router.get('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Restore the use of req.auth and access verification
    if (!verifyUserAccess(req, req.params.userId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const userId = req.auth!.uid; // Use req.auth again

        const history = await ReadingHistory.find({ userId }) // Use userId from auth
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();
        
        res.json({ success: true, history });
    } catch (error) {
        const userIdForError = req.auth?.uid || req.params.userId; // Get ID for logging
        next(error);
    }
}));

// Save reading history entry
router.post('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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

        // --- REVERT: Restore findOne and update logic FOR HISTORY ONLY ---
        let historyEntry = await ReadingHistory.findOne({ userId, surah: surahNum });

        if (historyEntry) {
            historyEntry.verse = verseNum;
            historyEntry.timestamp = new Date();
            await historyEntry.save();
            console.log(`[History POST ${userId}] Updated existing history entry: S:${surahNum} V:${verseNum}`);
        } else {
            historyEntry = new ReadingHistory({
                userId,
                surah: surahNum,
                verse: verseNum,
                timestamp: new Date()
            });
            await historyEntry.save();
            console.log(`[History POST ${userId}] Saved new history entry: S:${surahNum} V:${verseNum}`);
        }
        // --- END REVERT FOR HISTORY ONLY ---

        // --- REMOVE UserPreferences Update Logic ---
        /*
        let userPrefs = await UserPreferences.findOne({ userId });
        if (!userPrefs) {
           // ... (create userPrefs) ...
        }
        if (!userPrefs.preferences) {
           // ... (initialize preferences) ...
        }
        if (!userPrefs.preferences.lastState) {
           // ... (initialize lastState) ...
        } else {
           // ... (update lastState) ...
        }
        await userPrefs.save();
        */
        // --- END REMOVAL ---

        res.json({
            success: true,
            entry: historyEntry, // Return the history entry
            message: 'Reading history updated successfully'
        });
    } catch (error) {
        next(error);
    }
}));

// Clear reading history
router.delete('/:userId/reading-history', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const userId = req.auth!.uid;
        await ReadingHistory.deleteMany({ userId });

        res.json({ success: true, message: 'Reading history cleared' });
    } catch (error) {
        next(error);
    }
}));

// Get user bookmarks
router.get('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.auth!.uid; // Get userId early for logging

        if (!verifyUserAccess(req, req.params.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Find user preferences, lean for performance as we only need bookmarks
        const userPrefsDoc = await UserPreferences.findOne({ userId }).lean<IUserPreferencesDocument>();

        // Safely access bookmarks, defaulting to an empty array
        const bookmarks = userPrefsDoc?.preferences?.bookmarks || [];

        res.json(bookmarks); // Always return an array

    } catch (error) {
        const userIdForError = req.auth?.uid || req.params.userId; // Get ID for logging
        next(error);
    }
}));

// Add bookmark
router.post('/:userId/bookmarks', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
        next(error);
    }
}));

// Delete bookmark
router.delete('/:userId/bookmarks/:bookmark', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
        next(error);
    }
}));

// Get user profile
router.get('/:userId/profile', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const requestedUserId = req.params.userId;
    const startTime = Date.now(); // Start timing

    // Ensure the authenticated user is requesting their own profile
    if (!verifyUserAccess(req, requestedUserId)) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own profile.' });
    }

    const userId = req.auth!.uid; // Use uid from verified auth token

    try {
        // Fetch preferences and subscription status in parallel
        const prefsPromise = UserPreferences.findOne({ userId }).lean<IUserPreferencesDocument>();
        const subPromise = UserSubscription.findOne({ userId }).lean<IUserSubscription>();

        const prefsStartTime = Date.now();
        const prefsDoc = await prefsPromise;

        const subStartTime = Date.now();
        const subscriptionDoc = await subPromise;

        const dbQueriesEndTime = Date.now();

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

        res.json(profileData);

    } catch (error) {
        const duration = Date.now() - startTime;
        next(error);
    }
}));

// DELETE User Account (Handles Stripe Cancellation + Firebase Deletion)
router.delete('/me', withAuth(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.auth!.uid;

    try {
        // 1. Find User Subscription data to get Stripe Customer ID
        const userSub = await UserSubscription.findOne({ userId });
        let stripeCustomerId: string | undefined | null = null;
        if (userSub) {
            stripeCustomerId = userSub.stripeCustomerId;
        }

        // 2. Cancel Active Stripe Subscriptions if Customer ID exists
        if (stripeCustomerId) {
            try {
                const activeSubscriptions = await stripeService.getActiveSubscriptions(stripeCustomerId);

                if (activeSubscriptions.length > 0) {
                    for (const sub of activeSubscriptions) {
                        await stripeService.cancelSubscriptionImmediately(sub.id);
                    }
                }

            } catch (stripeError) {
            }
        }

        // 3. Delete Firebase User
        await admin.auth().deleteUser(userId);

        // 4. Delete User Data from MongoDB
        await UserSubscription.deleteOne({ userId });
        await UserUsage.deleteOne({ userId });
        await UserPreferences.deleteOne({ userId });
        await ReadingHistory.deleteMany({ userId });

        res.status(200).json({ success: true, message: 'Account deleted successfully.' });

    } catch (error) {
        next(error);
    }
}));

// POST /api/user/send-welcome - Now adds user to Mailchimp list
router.post('/send-welcome', async (req: express.Request, res: Response, next: NextFunction) => {
  // Expect firstName and lastName instead of a single name field
  const { email, firstName, lastName } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const listId = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!listId) {
    return res.status(500).json({ message: 'Mailchimp configuration error (Audience ID missing).' });
  }
  
  // Check if Mailchimp client was configured successfully earlier
  if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER_PREFIX) {
      return res.status(500).json({ message: 'Mailchimp service configuration error.' });
  }

  // Mailchimp requires the email address to be hashed using MD5
  const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');

  try {
    const response = await mailchimp.lists.setListMember(listId, subscriberHash, {
      email_address: email,
      status_if_new: 'subscribed', 
      status: 'subscribed',        
      merge_fields: {
        // Map firstName to FNAME and lastName to LNAME
        FNAME: firstName || '', 
        LNAME: lastName || '' 
      }
    });

    // Type guard: Check if the response looks like a success response
    if (response && typeof response === 'object' && 'id' in response && 'status' in response) {
        res.status(200).json({ message: 'User added to Mailchimp list successfully' });
    } else {
        res.status(200).json({ message: 'User added to Mailchimp list (unexpected response format).' }); 
    }

  } catch (error: any) {
    // Check if the error is because the member already exists (which is okay)
    if (error.response && error.response.body && error.response.body.title === 'Member Exists') {
      res.status(200).json({ message: 'User already exists in Mailchimp list.' });
    } else {
      // Log the detailed error from Mailchimp if available
      const errorDetails = error.response?.body || error.message || error;
      next(error);
    }
  }
});

// Test route for timeouts
router.get('/:userId/reading-history', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const delay = req.query.delay ? parseInt(req.query.delay as string) : undefined;
    
    if (delay) {
        // Simulate a delayed response
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
        // Your normal route logic here
        res.json({ message: 'Reading history retrieved' });
    } catch (error) {
        next(error);
    }
});

export default router; 