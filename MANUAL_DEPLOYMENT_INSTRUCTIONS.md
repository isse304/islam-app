# 🚀 Manual Deployment Instructions - Phase 1 Notifications

## Overview
Since the Firebase CLI deployment is having issues, here's how to deploy everything manually through the Firebase Console.

---

## Part 1: Deploy Firestore Security Rules

### **Step 1: Open Firebase Console**
1. Go to: https://console.firebase.google.com/project/nuraai/firestore/rules
2. You should see the Firestore Rules editor

### **Step 2: Add Notification Rules**
Scroll to the bottom of the rules file and add this **before the last closing brace**:

```firebase
// Notifications collection
match /notifications/{notificationId} {
  // Users can only read their own notifications
  allow read: if request.auth != null && resource.data.toUid == request.auth.uid;
  // Only Cloud Functions can write notifications
  allow write: if false;
  // Users can mark their own notifications as read
  allow update: if request.auth != null 
                && resource.data.toUid == request.auth.uid
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
}
```

### **Step 3: Publish Rules**
1. Click **"Publish"** button
2. Wait for confirmation

---

## Part 2: Deploy Firestore Indexes

### **Step 1: Open Indexes Page**
1. Go to: https://console.firebase.google.com/project/nuraai/firestore/databases/nura/indexes
2. Click **"Add Index"** button (you'll need to do this 5 times)

### **Step 2: Create Index 1 - Notifications (toUid + createdAt)**
- **Collection ID**: `notifications`
- **Fields to index**:
  1. Field: `toUid` | Order: `Ascending`
  2. Field: `createdAt` | Order: `Descending`
- **Query scope**: `Collection`
- Click **"Create"**

### **Step 3: Create Index 2 - Notifications (toUid + read + createdAt)**
- **Collection ID**: `notifications`
- **Fields to index**:
  1. Field: `toUid` | Order: `Ascending`
  2. Field: `read` | Order: `Ascending`
  3. Field: `createdAt` | Order: `Descending`
- **Query scope**: `Collection`
- Click **"Create"**

### **Step 4: Create Index 3 - Submissions (status + gradedAt)**
- **Collection ID**: `submissions`
- **Fields to index**:
  1. Field: `status` | Order: `Ascending`
  2. Field: `gradedAt` | Order: `Ascending`
- **Query scope**: `Collection`
- Click **"Create"**

### **Step 5: Create Index 4 - Submissions (studentId + status + gradedAt)**
- **Collection ID**: `submissions`
- **Fields to index**:
  1. Field: `studentId` | Order: `Ascending`
  2. Field: `status` | Order: `Ascending`
  3. Field: `gradedAt` | Order: `Ascending`
- **Query scope**: `Collection`
- Click **"Create"**

### **Step 6: Create Index 5 - Submissions (assignmentId + status + gradedAt)**
- **Collection ID**: `submissions`
- **Fields to index**:
  1. Field: `assignmentId` | Order: `Ascending`
  2. Field: `status` | Order: `Ascending`
  3. Field: `gradedAt` | Order: `Ascending`
- **Query scope**: `Collection`
- Click **"Create"**

### **Step 7: Wait for Indexes to Build**
- All 5 indexes will show "Building..." status
- This can take 5-15 minutes
- You can proceed to Part 3 while they build

---

## Part 3: Deploy Cloud Functions Manually

Unfortunately, Cloud Functions **cannot** be deployed manually through the console. They must be deployed via CLI or CI/CD.

### **Option A: Fix Firebase CLI Authentication (Recommended)**

#### **Method 1: Re-login**
```bash
# Open PowerShell and run:
firebase logout
firebase login
firebase deploy --only functions
```

#### **Method 2: Use Service Account (Advanced)**
If the above doesn't work, you may need to:
1. Go to: https://console.firebase.google.com/project/nuraai/settings/serviceaccounts/adminsdk
2. Click "Generate new private key"
3. Save the JSON file
4. Set environment variable:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
   firebase deploy --only functions
   ```

### **Option B: Deploy via Google Cloud Console (Alternative)**

#### **Step 1: Build Functions Locally**
```powershell
cd C:\Users\qadar\Desktop\IslamApp\functions
npm run build
```

#### **Step 2: Manually Upload to Cloud Functions**
1. Go to: https://console.cloud.google.com/functions/list?project=nuraai
2. For each function (`onAssignmentCreated`, `onSubmissionGraded`, `onSubmissionCreated`):
   - Click "CREATE FUNCTION"
   - **Basics**:
     - Function name: (e.g., `onSubmissionCreated`)
     - Region: `us-central1`
   - **Trigger**:
     - Trigger type: `Cloud Firestore`
     - Event type: `providers/cloud.firestore/eventTypes/document.create`
     - Document path: `submissions/{sid}`
   - **Runtime**:
     - Runtime: `Node.js 18`
     - Entry point: `onSubmissionCreated`
   - **Source code**:
     - Upload the `functions/lib` folder as a ZIP
   - Click "DEPLOY"

**Note**: This is tedious for 3 functions. Method A is much easier.

---

## Part 4: Verify Deployment

### **Check Firestore Rules**
1. Go to: https://console.firebase.google.com/project/nuraai/firestore/rules
2. Verify you see the `notifications` rules

### **Check Indexes**
1. Go to: https://console.firebase.google.com/project/nuraai/firestore/databases/nura/indexes
2. Wait until all 5 indexes show "Enabled" (not "Building")

### **Check Cloud Functions**
1. Go to: https://console.firebase.google.com/project/nuraai/functions
2. Verify these 3 functions exist:
   - ✅ `onAssignmentCreated`
   - ✅ `onSubmissionGraded`
   - ✅ `onSubmissionCreated` (NEW)

---

## Part 5: Test the Feature

### **Test 1: Submit an Assignment**
1. Login as a **student**
2. Navigate to an assignment
3. Click "Submit"
4. Logout

### **Test 2: Check Teacher Notification**
1. Login as the **teacher** who created that assignment
2. Look at the notification bell (🔔) in the header
3. **Expected**: Badge shows "1"
4. Click the bell
5. **Expected**: See "📝 New Submission Received" notification

### **Test 3: Check Dashboard Badge**
1. Still logged in as teacher
2. Go to teacher dashboard
3. **Expected**: Class card shows red badge "1 new"

### **Test 4: Real-Time Updates**
1. Open teacher dashboard in **two browser tabs**
2. In tab 1, keep dashboard open
3. In tab 2, login as student and submit another assignment
4. Switch back to tab 1
5. **Expected**: Badge updates to "2 new" **without refreshing**

---

## Troubleshooting

### **Issue**: Indexes stuck on "Building"
**Solution**: Wait longer (can take up to 30 minutes for large databases). Check back later.

### **Issue**: Notification doesn't appear
**Check**:
1. Are Cloud Functions deployed? (Check Firebase Console → Functions)
2. Are there errors in Function logs? (Firebase Console → Functions → Logs)
3. Is the submission status "submitted"? (Check Firestore)
4. Does the assignment have a valid `teacherId`?

### **Issue**: Badge doesn't show
**Check**:
1. Are indexes enabled? (Not "Building")
2. Is there an ungraded submission? (Check Firestore → submissions)
3. Check browser console for errors

### **Issue**: Firebase CLI won't authenticate
**Try**:
1. Update Firebase CLI: `npm install -g firebase-tools`
2. Clear credentials: `firebase logout` then `firebase login`
3. Use incognito/private browser window for login
4. Check if you have the correct permissions in Firebase Console

---

## Summary Checklist

- [ ] Firestore Rules deployed (notifications section added)
- [ ] 5 Firestore Indexes created and enabled
- [ ] 3 Cloud Functions deployed (including new `onSubmissionCreated`)
- [ ] Test: Student submits → Teacher sees notification
- [ ] Test: Badge appears on class card
- [ ] Test: Real-time updates work

---

## Need Help?

If you're stuck on any step, let me know which part and I'll help troubleshoot!

**Most Important**: The Cloud Functions are critical. If you can't deploy them via CLI, we'll need to fix the authentication issue first.





