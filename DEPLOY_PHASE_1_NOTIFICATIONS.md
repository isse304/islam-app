# 🚀 Deploy Phase 1 Notifications - Quick Guide

## Prerequisites
- Firebase CLI installed and authenticated
- Node.js and npm installed
- Access to Firebase project `nuraai`

---

## Deployment Steps

### **Step 1: Build Cloud Functions**
```bash
cd functions
npm install
npm run build
cd ..
```

### **Step 2: Deploy Everything**
```bash
firebase deploy --only firestore,functions
```

This will deploy:
- ✅ Firestore security rules (notifications)
- ✅ Firestore indexes (5 new indexes)
- ✅ Cloud Function: `onSubmissionCreated`
- ✅ Cloud Function: `onSubmissionGraded` (updated)
- ✅ Cloud Function: `onAssignmentCreated` (existing)

---

## Expected Output

```
=== Deploying to 'nuraai'...

i  deploying firestore, functions
i  firestore: checking firestore.rules for compilation errors...
✔  firestore: rules file firestore.rules compiled successfully
i  firestore: uploading rules firestore.rules...
i  firestore: uploading indexes firestore.indexes.json...
✔  firestore: deployed indexes in firestore.indexes.json successfully
✔  firestore: released rules firestore.rules to cloud.firestore

i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (XX.XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: updating Node.js 18 function onSubmissionCreated(us-central1)...
i  functions: updating Node.js 18 function onSubmissionGraded(us-central1)...
i  functions: updating Node.js 18 function onAssignmentCreated(us-central1)...
✔  functions[onSubmissionCreated(us-central1)]: Successful update operation.
✔  functions[onSubmissionGraded(us-central1)]: Successful update operation.
✔  functions[onAssignmentCreated(us-central1)]: Successful update operation.

✔  Deploy complete!
```

---

## Verification

### **1. Check Functions in Firebase Console**
1. Go to [Firebase Console → Functions](https://console.firebase.google.com/project/nuraai/functions)
2. Verify these functions are listed:
   - ✅ `onSubmissionCreated`
   - ✅ `onSubmissionGraded`
   - ✅ `onAssignmentCreated`

### **2. Check Indexes in Firebase Console**
1. Go to [Firebase Console → Firestore → Indexes](https://console.firebase.google.com/project/nuraai/firestore/databases/nura/indexes)
2. Wait for indexes to finish building (may take a few minutes)
3. Verify these indexes are "Enabled":
   - `notifications` (toUid, createdAt)
   - `notifications` (toUid, read, createdAt)
   - `submissions` (status, gradedAt)
   - `submissions` (studentId, status, gradedAt)
   - `submissions` (assignmentId, status, gradedAt)

### **3. Test the Feature**
1. **As a student**: Submit an assignment
2. **As a teacher**: 
   - Check notification bell → should see "📝 New Submission Received"
   - Check class card → should see red badge "1 new"
   - Click notification → should navigate to submission

---

## Troubleshooting

### **Issue**: Functions deployment fails with authentication error
**Solution**: Run `firebase login --reauth` and try again

### **Issue**: Indexes show "Building" for a long time
**Solution**: This is normal. Indexes can take 5-15 minutes to build. Check back later.

### **Issue**: Notification doesn't appear after submission
**Check**:
1. Is the Cloud Function deployed? (Check Firebase Console)
2. Are there any errors in Function logs? (Firebase Console → Functions → Logs)
3. Is the user authenticated?
4. Does the assignment have a valid `teacherId`?

### **Issue**: Badge doesn't show on class card
**Check**:
1. Are the Firestore indexes enabled?
2. Is there an ungraded submission for that class?
3. Check browser console for errors

---

## Rollback (If Needed)

If something goes wrong, you can rollback:

```bash
# Rollback functions only
firebase functions:delete onSubmissionCreated

# Restore previous rules (manual in Firebase Console)
```

---

## Post-Deployment Testing

### **Test 1: Submission Notification**
```
1. Login as student
2. Go to an assignment
3. Submit it
4. Login as teacher
5. Check bell icon → should see notification
6. Check class card → should see "1 new" badge
```

### **Test 2: Real-Time Updates**
```
1. Open teacher dashboard in two browser tabs
2. In tab 1, keep dashboard open
3. In tab 2, submit an assignment as student
4. Switch to tab 1 → badge should appear without refresh
```

### **Test 3: Mark as Read**
```
1. As teacher, click notification bell
2. Click on a notification
3. Bell badge count should decrement
4. Notification should appear dimmed/read
```

---

## Success Criteria ✅

- [ ] All 3 Cloud Functions deployed
- [ ] All 5 Firestore indexes enabled
- [ ] Notification appears when student submits
- [ ] Badge appears on class card
- [ ] Real-time updates work without refresh
- [ ] No console errors

---

**Ready to deploy!** 🚀

Run: `firebase deploy --only firestore,functions`

