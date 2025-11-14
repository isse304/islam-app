# 🔔 Notification System Troubleshooting Guide

## Current Status
All notification code is implemented correctly. If notifications aren't showing, here's how to diagnose and fix:

---

## 🧪 STEP 1: Verify Cloud Functions Are Deployed

### Check Firebase Console:
1. Go to: https://console.firebase.google.com/project/nuraai/functions
2. You should see **4 functions**:
   - ✅ `onUserCreate`
   - ✅ `onAssignmentCreated`
   - ✅ `onSubmissionCreated`
   - ✅ `onSubmissionGraded`

### If functions are NOT there or outdated:

```bash
# From project root
cd functions
npm run build
cd ..
firebase deploy --only functions
```

**Expected output:**
```
✔  functions[onUserCreate(us-central1)] Successful update operation.
✔  functions[onAssignmentCreated(us-central1)] Successful update operation.
✔  functions[onSubmissionCreated(us-central1)] Successful update operation.
✔  functions[onSubmissionGraded(us-central1)] Successful update operation.
```

---

## 🧪 STEP 2: Verify Firestore Indexes Are Built

### Check Firestore Console:
1. Go to: https://console.firebase.google.com/project/nuraai/firestore/indexes
2. Look for these indexes (status should be "**Enabled**"):

**Required Indexes:**
```
Collection: notifications
Fields: toUid (Ascending) + createdAt (Descending)

Collection: notifications  
Fields: toUid (Ascending) + read (Ascending) + createdAt (Descending)
```

### If indexes are missing or "Building":

```bash
firebase deploy --only firestore:indexes
```

⚠️ **Note:** Indexes can take 5-15 minutes to build. If status shows "Building", wait.

---

## 🧪 STEP 3: Test Notification Creation Manually

### Test in Firestore Console:

1. Go to: https://console.firebase.google.com/project/nuraai/firestore/databases/nura/data
2. Click on `notifications` collection
3. Manually add a test document:

```json
{
  "toUid": "YOUR_USER_UID_HERE",
  "type": "assignment_posted",
  "title": "Test Notification",
  "body": "This is a test notification",
  "read": false,
  "createdAt": [TIMESTAMP - use Firestore timestamp],
  "ref": {
    "collection": "assignments",
    "id": "test123"
  }
}
```

**Expected Result:** Notification should appear in your app's header bell icon immediately.

---

## 🧪 STEP 4: Test End-to-End Flow

### Test 1: Assignment Creation Notification

**As Teacher:**
1. Login as teacher
2. Go to `/t/classes`
3. Create a new assignment
4. Check Firebase Console → Functions → Logs
5. Should see: "onAssignmentCreated triggered"

**As Student:**
1. Login as student (who is in that class)
2. Check notification bell in header
3. Should see notification: "New Assignment Posted"

### Test 2: Submission Notification

**As Student:**
1. Login as student
2. Go to `/s/assignments`
3. Open an assignment
4. Click "Submit"
5. Check Firebase Console → Functions → Logs
6. Should see: "Submission notification created for teacher: [TEACHER_UID]"

**As Teacher:**
1. Login as teacher
2. Check notification bell in header
3. Should see: "📝 New Submission Received"
4. Should see red badge on class card: "1 new"

### Test 3: Grading Notification

**As Teacher:**
1. Login as teacher
2. Grade a submission
3. Check Firebase Console → Functions → Logs
4. Should see: "onSubmissionGraded triggered"

**As Student:**
1. Login as student
2. Check notification bell
3. Should see: "Assignment Graded"

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: "No notifications showing up"

**Possible Causes:**
1. ✅ Cloud Functions not deployed → Deploy with `firebase deploy --only functions`
2. ✅ Firestore indexes not built → Check console, wait if "Building"
3. ✅ User not authenticated → Check `this.auth.currentUser` in NotificationService
4. ✅ Wrong database → Functions should use `.firestore.database("nura")`

**Debug:**
```typescript
// In browser console
// Check if user is authenticated
console.log(firebase.auth().currentUser);

// Check if NotificationService is injected
// In header.component.ts ngOnInit, add:
console.log('NotificationService:', this.notificationService);
console.log('Current user:', this.auth.currentUser);
```

---

### Issue 2: "Bell icon not showing"

**Check:**
1. ✅ Header component is rendered
2. ✅ User is authenticated (bell only shows for logged-in users)
3. ✅ Material Icon font is loaded

**Fix:**
Check `index.html` for Material Icons:
```html
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
```

---

### Issue 3: "Functions triggered but no notification created"

**Check Firebase Function Logs:**
```bash
firebase functions:log
```

Look for errors like:
- "Assignment not found"
- "Permission denied"
- "User not found"

**Common Fix:**
Ensure the function is using the correct database:
```typescript
functions.firestore.database("nura")  // ← Must be "nura", not "(default)"
```

---

### Issue 4: "Badge shows wrong count"

**Possible Causes:**
1. ✅ Old unread notifications from testing
2. ✅ Multiple notifications for same event

**Fix:**
Clear old notifications manually in Firestore Console, or add "Mark all as read" button:

```typescript
// In header.component.html, add:
<button mat-menu-item (click)="markAllAsRead()">
  Mark all as read
</button>

// In header.component.ts, add:
markAllAsRead() {
  this.notificationService.markAllAsRead();
}
```

---

### Issue 5: "Notifications delayed or not real-time"

**Check:**
1. ✅ Using `listenToMyNotifications()` (not `listMyNotifications()`)
2. ✅ Using `collectionData()` from `@angular/fire/firestore`

**Verify in header.component.ts:**
```typescript
// Should be:
this.notifications$ = this.notificationService.listenToMyNotifications();
this.unreadCount$ = this.notificationService.getUnreadCount();

// NOT:
this.notifications$ = this.notificationService.listMyNotifications();
```

---

## 🔍 DEBUGGING CHECKLIST

Run through this checklist:

### Backend:
- [ ] Cloud Functions deployed to Firebase
- [ ] All 4 functions show "✔" in deployment
- [ ] Functions are targeting database `"nura"`
- [ ] Firestore indexes are "Enabled" (not "Building")
- [ ] Firestore security rules allow reading notifications

### Frontend:
- [ ] NotificationService injected in HeaderComponent
- [ ] Using `listenToMyNotifications()` (real-time)
- [ ] Using `getUnreadCount()` (real-time)
- [ ] User is authenticated when accessing notifications
- [ ] Material Icons loaded in `index.html`

### Test Flow:
- [ ] Teacher creates assignment → Students see notification
- [ ] Student submits → Teacher sees notification + red badge
- [ ] Teacher grades → Student sees notification
- [ ] Notification bell shows unread count
- [ ] Clicking notification marks it as read
- [ ] Count decrements after marking as read

---

## 📊 EXPECTED BEHAVIOR

### Teacher Experience:
1. **Student submits assignment:**
   - 🔔 Bell badge: +1
   - 📱 Notification: "Ali submitted 'Surah Al-Fatiha'"
   - 🔴 Class card: "1 new" badge
   - ✅ No page refresh needed

2. **Click notification:**
   - Marks as read
   - Badge count: -1
   - Can navigate to submission (optional)

### Student Experience:
1. **Teacher creates assignment:**
   - 🔔 Bell badge: +1
   - 📱 Notification: "New Assignment Posted"
   - ✅ Real-time update

2. **Teacher grades submission:**
   - 🔔 Bell badge: +1
   - 📱 Notification: "Assignment Graded"
   - ✅ Can click to view grade

---

## 🚀 QUICK FIX COMMANDS

If notifications aren't working, run these in order:

```bash
# 1. Deploy Firestore rules and indexes
firebase deploy --only firestore

# 2. Build and deploy functions
cd functions
npm run build
cd ..
firebase deploy --only functions

# 3. Check deployment status
firebase functions:list

# 4. Watch function logs in real-time
firebase functions:log --only onSubmissionCreated,onAssignmentCreated,onSubmissionGraded
```

---

## 📞 STILL NOT WORKING?

### Verify in Firebase Console:

1. **Functions Console:**
   - Check if functions exist and are active
   - Check logs for errors

2. **Firestore Console:**
   - Check if `notifications` collection exists
   - Manually add a test notification
   - See if it appears in app

3. **Browser Console:**
   - Check for JavaScript errors
   - Check if NotificationService is throwing errors
   - Verify user authentication

### Debug in Code:

Add logging to `notification.service.ts`:

```typescript
listenToMyNotifications(limitCount: number = 20): Observable<Notification[]> {
  const user = this.auth.currentUser;
  console.log('[NotificationService] Current user:', user);
  
  if (!user) {
    console.warn('[NotificationService] No user authenticated');
    return of([]);
  }

  const q = query(
    this.notificationsCollection,
    where('toUid', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  return collectionData(q, { idField: 'id' }).pipe(
    map(notifications => {
      console.log('[NotificationService] Notifications received:', notifications);
      return notifications;
    })
  ) as Observable<Notification[]>;
}
```

---

## ✅ FINAL VERIFICATION

To confirm notifications are 100% working:

1. ✅ Deploy functions: `firebase deploy --only functions`
2. ✅ Deploy indexes: `firebase deploy --only firestore:indexes`
3. ✅ Wait 5-10 min for indexes to build
4. ✅ Login as teacher → Create assignment
5. ✅ Login as student → See notification
6. ✅ Student submits assignment
7. ✅ Login as teacher → See notification + red badge
8. ✅ Teacher grades assignment
9. ✅ Login as student → See notification

If ALL steps work: **Notifications are fully functional!** 🎉

---

**Need more help? Share:**
1. Firebase Functions logs (`firebase functions:log`)
2. Browser console errors
3. Screenshots of Firebase Console (Functions & Firestore)





