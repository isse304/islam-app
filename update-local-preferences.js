// Script to update user preferences in localStorage
const userId = 'PP9fgkr9lJYxLNNBS4NULNcah052';
const preferenceKey = `user_preferences_${userId}`;

// Get current preferences
let preferences = {};
try {
  const existingPrefs = localStorage.getItem(preferenceKey);
  if (existingPrefs) {
    preferences = JSON.parse(existingPrefs);
    console.log('Found existing preferences:', preferences);
  }
} catch (error) {
  console.error('Error reading preferences:', error);
}

// Set subscription status
preferences.subscriptionStatus = 'trial';

// Update other preferences if needed
if (!preferences.selectedReciter) preferences.selectedReciter = 7;
if (!preferences.selectedTranslation) preferences.selectedTranslation = 'en.sahih';
if (!preferences.fontSize) preferences.fontSize = 18;
if (!preferences.bookmarks) preferences.bookmarks = [];

// Save updated preferences
try {
  localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  console.log('Updated preferences saved:', preferences);
  
  // Also set premium status flag
  localStorage.setItem('isPremiumUser', 'true');
  console.log('Set isPremiumUser flag to true');
} catch (error) {
  console.error('Error saving preferences:', error);
}

console.log('User preferences updated successfully!');
console.log('Please reload the application to apply changes.'); 