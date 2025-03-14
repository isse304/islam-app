# Comprehensive Troubleshooting - Islam App

Based on our analysis of the codebase, we've identified several issues related to authentication, subscription status, bookmarks, and reading history. This document outlines the problems and provides solutions.

## 1. Authentication Issues

### Problem
The migration from Clerk to Firebase authentication seems complete in terms of code, but there may be some integration issues between the authentication system and other parts of the application.

### Solution
1. Verify Firebase initialization in `server/middleware/auth.ts` and `src/app/services/firebase-auth.service.ts`.
2. Confirm that tokens are being passed correctly in the `FirebaseAuthInterceptor`.
3. Run the `update-firebase-claims.js` script to add custom claims to the user for subscription status.

```bash
node update-firebase-claims.js
```

## 2. Subscription Status Not Updating

### Problem
The subscription status is not updating properly when a trial is purchased. This is because:
1. No record is being created in the `UserUsage` collection in MongoDB.
2. The preferences in the Firebase user object are not being updated.

### Solution
1. Run the `fix-subscription.js` script to create a trial subscription record in MongoDB:

```bash
node fix-subscription.js
```

2. Verify that the `subscriptionStatus` is correctly set in the user preferences:

```javascript
// Client-side check (use this in the app)
const userSettings = await firebaseAuthService.getUserSettings();
console.log('Current subscription status:', userSettings?.preferences?.subscriptionStatus);

// Update if needed
await firebaseAuthService.saveUserPreferences({
  ...userSettings,
  subscriptionStatus: 'trial'
});
```

3. Make sure `isPremiumUser()` method in `firebase-auth.service.ts` is checking for both:
   - `'trial'` status
   - `'premium'` status
   - `'active'` status

## 3. Bookmarks and Reading History Not Working

### Problem
Bookmarks and reading history endpoints are trying to use Firebase auth but may be failing due to:
1. Authentication middleware issues
2. Missing or incomplete server-side models
3. Client-side storage issues

### Solution
1. Verify that the `/api/users/:userId/preferences` endpoint is working:

```javascript
// Check if endpoint is working
const response = await fetch(`${environment.apiUrl}/api/users/${userId}/preferences`, {
  headers: {
    'Authorization': `Bearer ${await firebaseAuthService.getToken()}`
  }
});
console.log('Preferences API response:', await response.json());
```

2. Ensure the client code fallbacks to localStorage correctly when the API fails:

```javascript
// In the Firebase auth service
async saveUserPreferences(preferences: any): Promise<void> {
  const user = this.auth.currentUser;
  if (!user) return Promise.reject(new Error('No user logged in'));
  
  try {
    try {
      await this.http.put(`${environment.apiUrl}/api/users/${user.uid}/preferences`, preferences).toPromise();
    } catch (error) {
      console.warn('User preferences API endpoint not available, using localStorage instead');
      // Save to localStorage as fallback
      localStorage.setItem(`user_preferences_${user.uid}`, JSON.stringify(preferences));
    }
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
}
```

3. Implement proper server-side storage for bookmarks and reading history:

```javascript
// Create MongoDB models for bookmarks and reading history if they don't exist
```

## 4. Premium Guards Not Working Correctly

### Problem
The `PremiumGuard` may not be correctly checking for premium status because:
1. It's not recognizing 'trial' as a valid premium status
2. The subscription status isn't being propagated correctly from the API to the user object

### Solution
1. Update `isPremiumUser()` method in `firebase-auth.service.ts`:

```javascript
async isPremiumUser(): Promise<boolean> {
  const user = this.auth.currentUser;
  if (!user) return false;
  
  try {
    // First check user custom claims
    const idTokenResult = await user.getIdTokenResult(true); // Force refresh
    if (idTokenResult.claims.premium === true) {
      return true;
    }
    
    // Then check user settings
    const userSettings = await this.getUserSettings();
    const status = userSettings?.preferences?.subscriptionStatus || '';
    
    // Consider all these statuses as premium
    return ['premium', 'trial', 'active'].includes(status);
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}
```

2. Update the `PremiumGuard` to handle all valid premium statuses:

```javascript
const isPremium = 
  ['active', 'trial', 'premium'].includes(subscriptionStatus) || 
  await this.authService.isPremiumUser();
```

## Testing the Fix

1. Run the `fix-subscription.js` script to create a subscription record in MongoDB:
```bash
node fix-subscription.js
```

2. Run the `update-firebase-claims.js` script to add subscription claims to the Firebase user:
```bash
node update-firebase-claims.js
```

3. Restart the server and client applications:
```bash
# Server
cd server && npm run dev

# Client
ng serve
```

4. Test the following features:
   - Login with Firebase
   - Access premium content
   - Create and view bookmarks
   - View reading history

If issues persist, check the browser console and server logs for specific error messages.

## Development Mode Vs. Production

In development mode, the application should:
1. Auto-authorize requests with mock user ID
2. Return mock subscription status
3. Allow access to premium features

If development mode is not working as expected, check:
- The `isDevMode` flag in the server code
- The `environment.production` setting in Angular

## Final Notes

The migration from Clerk to Firebase has been completed in terms of code, but some issues with integrations remain. The scripts and solutions provided above should resolve the major issues with authentication, subscription status, and user preferences management. 