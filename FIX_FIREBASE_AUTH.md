# 🔧 Fix Firebase CLI Authentication Error

## Problem
Firebase CLI shows: `401, Request had invalid authentication credentials`

This means your Firebase CLI login token is expired or corrupted.

---

## Solution (Choose One)

### **Option 1: Re-login via Browser (Easiest)**

1. **Open a NEW PowerShell window** (not through Cursor)
2. Run:
   ```powershell
   firebase logout
   firebase login
   ```
3. A browser window will open
4. Login with your Google account (`isse304@gmail.com`)
5. Grant permissions
6. Return to PowerShell - you should see "✔ Success!"

---

### **Option 2: Use CI Token (If Option 1 Fails)**

1. **Open a NEW PowerShell window**
2. Run:
   ```powershell
   firebase login:ci
   ```
3. A browser will open - login with your Google account
4. Copy the token that appears
5. Set it as an environment variable:
   ```powershell
   $env:FIREBASE_TOKEN="paste-your-token-here"
   ```
6. Now you can deploy:
   ```powershell
   firebase deploy --only "firestore,functions" --token $env:FIREBASE_TOKEN
   ```

---

### **Option 3: Use Application Default Credentials**

1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Run:
   ```powershell
   gcloud auth application-default login
   ```
3. Login with your Google account
4. Try deploying again:
   ```powershell
   firebase deploy --only "firestore,functions"
   ```

---

## After Authentication Works

Once you've successfully authenticated, deploy everything:

```powershell
cd C:\Users\qadar\Desktop\IslamApp
firebase deploy --only "firestore,functions"
```

This will deploy:
- ✅ Firestore security rules
- ✅ Firestore indexes (5 new ones)
- ✅ Cloud Functions (3 functions including the new notification one)

---

## Expected Output

```
=== Deploying to 'nuraai'...

i  deploying firestore, functions
✔  firestore: rules file compiled successfully
✔  firestore: indexes deployed successfully
✔  functions: Finished running predeploy script.
✔  functions[onSubmissionCreated(us-central1)]: Successful update operation.
✔  functions[onSubmissionGraded(us-central1)]: Successful update operation.
✔  functions[onAssignmentCreated(us-central1)]: Successful update operation.

✔  Deploy complete!
```

---

## Troubleshooting

### **Issue**: Browser doesn't open
**Solution**: Copy the URL from the terminal and paste it into your browser manually

### **Issue**: "Permission denied" error
**Solution**: Make sure you're logged in with an account that has Owner/Editor role in the Firebase project

### **Issue**: Still getting 401 errors
**Solution**: 
1. Check if you have multiple Google accounts - make sure you're using the right one
2. Try Option 2 (CI Token) instead
3. Check Firebase Console to verify your account has the correct permissions

---

## Quick Test After Deployment

1. Login as a student
2. Submit an assignment
3. Login as a teacher
4. Check the notification bell (🔔)
5. You should see: "📝 New Submission Received"

---

**TL;DR**: Open a NEW PowerShell window and run:
```powershell
firebase logout
firebase login
cd C:\Users\qadar\Desktop\IslamApp
firebase deploy --only "firestore,functions"
```

