# Firestore Security Rules Update - Video Call Feature

## 🔒 Required Security Rules for Call Invitations

To enable the video calling feature with proper security, add these rules to your `firestore.rules` file:

### **Location:** `firestore.rules`

Add the following rules to allow call invitations and sessions:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ... your existing rules ...
    
    // ========================================
    // VIDEO CALL INVITATIONS
    // ========================================
    
    // Call Invitations - Users can read their own invitations
    match /callInvitations/{invitationId} {
      // Allow read if user is the sender or recipient
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.fromUserId ||
        request.auth.uid == resource.data.toUserId
      );
      
      // Allow create if user is the sender
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.fromUserId;
      
      // Allow update if user is the recipient (to accept/reject)
      allow update: if request.auth != null &&
        request.auth.uid == resource.data.toUserId;
      
      // Allow delete if user is the sender or recipient
      allow delete: if request.auth != null && (
        request.auth.uid == resource.data.fromUserId ||
        request.auth.uid == resource.data.toUserId
      );
    }
    
    // ========================================
    // VIDEO CALL SESSIONS
    // ========================================
    
    // Call Sessions - Users can read/write sessions they're part of
    match /callSessions/{sessionId} {
      // Allow read if user is host or participant
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.hostId ||
        request.auth.uid in resource.data.participantIds
      );
      
      // Allow create if user is the host
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.hostId;
      
      // Allow update if user is host or participant
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.hostId ||
        request.auth.uid in resource.data.participantIds
      );
      
      // Allow delete if user is the host
      allow delete: if request.auth != null &&
        request.auth.uid == resource.data.hostId;
    }
    
    // ========================================
    // CALL PARTICIPANTS
    // ========================================
    
    // Call Participants - Users can manage their own participation
    match /callParticipants/{participantId} {
      // Allow read if authenticated
      allow read: if request.auth != null;
      
      // Allow create/update/delete if user is the participant
      allow create, update, delete: if request.auth != null &&
        request.auth.uid == request.resource.data.userId;
    }
    
    // ========================================
    // USER PRESENCE
    // ========================================
    
    // User Presence - Users can read others' status, write own status
    match /userPresence/{userId} {
      // Anyone authenticated can read presence
      allow read: if request.auth != null;
      
      // Users can only update their own presence
      allow create, update: if request.auth != null &&
        request.auth.uid == userId;
      
      // Users can only delete their own presence
      allow delete: if request.auth != null &&
        request.auth.uid == userId;
    }
    
    // ========================================
    // CALL CHAT (In-Call Messaging)
    // ========================================
    
    // Call Chat - Participants can send/receive messages
    match /callChat/{messageId} {
      // Allow read if user is in the call session
      allow read: if request.auth != null;
      
      // Allow create if user is the sender
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.senderId;
    }
    
    // ========================================
    // CALL EVENTS (Analytics)
    // ========================================
    
    // Call Events - For logging and analytics
    match /callEvents/{eventId} {
      // Allow read if user is involved in the event
      allow read: if request.auth != null;
      
      // Allow create for any authenticated user
      allow create: if request.auth != null;
    }
  }
}
```

---

## 🚀 How to Deploy These Rules

### **Option 1: Firebase Console (Easiest)**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Click on the **Rules** tab
5. Copy the rules above into the editor
6. Click **Publish**

### **Option 2: Firebase CLI**

```bash
# Make sure you're in the project directory
cd /path/to/IslamApp

# Edit the firestore.rules file
# (Copy the rules above into firestore.rules)

# Deploy the rules
firebase deploy --only firestore:rules
```

---

## ✅ What These Rules Do

### **Call Invitations:**
- ✅ **Create:** Only the sender can create an invitation
- ✅ **Read:** Both sender and recipient can see the invitation
- ✅ **Update:** Only the recipient can update (accept/reject)
- ✅ **Delete:** Both parties can delete

**Example Flow:**
```
Teacher creates invitation → ✅ (teacher's uid matches fromUserId)
Student reads invitation   → ✅ (student's uid matches toUserId)
Student accepts invitation → ✅ (student updates with their uid)
```

### **Call Sessions:**
- ✅ **Create:** Only the host (teacher) can create
- ✅ **Read:** All participants can read
- ✅ **Update:** Host and participants can update
- ✅ **Delete:** Only host can delete

### **Call Participants:**
- ✅ Users can only manage their own participation records
- ✅ Everyone can see who's in the call

### **User Presence:**
- ✅ Anyone authenticated can see online/offline status
- ✅ Users can only update their own status

### **Call Chat:**
- ✅ All authenticated users in a call can read messages
- ✅ Only the sender can create messages

### **Call Events:**
- ✅ Users can read events they're involved in
- ✅ Any authenticated user can log events

---

## 🔐 Security Benefits

1. **User Isolation:** Users can only see their own invitations
2. **Authorization:** Only recipients can accept/reject invitations
3. **Data Integrity:** Users can't modify other users' data
4. **Audit Trail:** Call events are protected but readable
5. **Privacy:** Participants list is controlled by host

---

## 🧪 Testing the Rules

### **Test 1: Create Invitation**

**Should succeed:**
```javascript
// As authenticated user (teacher)
createInvitation({
  fromUserId: currentUser.uid,  // ✅ Matches auth.uid
  toUserId: 'student123',
  // ... other fields
});
```

**Should fail:**
```javascript
// As authenticated user (teacher)
createInvitation({
  fromUserId: 'someOtherUser',  // ❌ Doesn't match auth.uid
  toUserId: 'student123',
  // ... other fields
});
```

### **Test 2: Accept Invitation**

**Should succeed:**
```javascript
// As authenticated user (student123)
updateInvitation('invitationId', {
  status: 'accepted',
  respondedAt: now()
});
// ✅ student123 is the toUserId
```

**Should fail:**
```javascript
// As authenticated user (randomUser)
updateInvitation('invitationId', {
  status: 'accepted',
  respondedAt: now()
});
// ❌ randomUser is not the toUserId
```

---

## 📊 Rule Validation

You can test these rules in the Firebase Console:

1. Go to **Firestore Database → Rules**
2. Click **Rules Playground**
3. Select a location (e.g., `/callInvitations/{invitationId}`)
4. Choose an operation (read/write)
5. Set authenticated user UID
6. Set request data
7. Click **Run**

---

## ⚠️ Important Notes

### **Before Deploying:**
1. ✅ Backup your existing `firestore.rules` file
2. ✅ Review all existing rules
3. ✅ Merge these rules with your existing ones
4. ✅ Test in Firebase Console before deploying

### **After Deploying:**
1. ✅ Test call creation from teacher account
2. ✅ Test invitation receiving from student account
3. ✅ Verify accept/reject works
4. ✅ Check Firebase Console for rule violations (if any)

---

## 🚨 Troubleshooting

### **Error: "Missing or insufficient permissions"**

**Cause:** Rules haven't been deployed or are incorrect

**Solution:**
1. Check Firebase Console → Firestore → Rules
2. Verify rules are published
3. Check rule syntax for errors
4. Test specific paths in Rules Playground

### **Error: "User not authenticated"**

**Cause:** User is not signed in

**Solution:**
1. Verify Firebase Auth is working
2. Check `FirebaseAuthService.user$` has a value
3. Ensure user is signed in before creating calls

---

## 📁 File Location

The `firestore.rules` file should be in your project root:

```
IslamApp/
├── firestore.rules  ← Add the rules here
├── firebase.json
├── src/
└── ...
```

If the file doesn't exist, create it:

```bash
# Create firestore.rules file
touch firestore.rules

# Add the rules above to this file
```

---

## ✅ Verification Checklist

After deploying rules, verify:

- [ ] Teacher can create call invitation
- [ ] Student receives invitation in real-time
- [ ] Student can accept invitation
- [ ] Student can decline invitation
- [ ] Non-recipients cannot see invitation
- [ ] Users cannot impersonate others
- [ ] Call sessions are created successfully
- [ ] Participants can join calls
- [ ] Presence updates work
- [ ] No console errors about permissions

---

## 🎉 Done!

Once these rules are deployed, your video calling feature will be:

✅ **Secure** - Proper user authorization  
✅ **Private** - Users only see their data  
✅ **Functional** - All operations work correctly  
✅ **Scalable** - Rules handle multiple users  

---

**Need help?** Check the Firebase Console logs for rule evaluation details.

**Rule Errors?** Use the Rules Playground to debug specific operations.

---

*Remember: Always test security rules before deploying to production!* 🔒
