# 🎓 How to Set Student Role (Fix Redirect Issue)

## 🐛 Problem
Student routes redirect to home because the user doesn't have the `role: 'student'` custom claim set in Firebase.

---

## ✅ **EASIEST METHOD: Use the Node.js Script**

I've created a simple script that does everything for you!

### **Step 1: Get Your UID**

Open this file in your browser (while signed in to your app):
```
scripts/get-my-uid.html
```

Or manually get it:
1. Open your app in browser
2. Open DevTools (F12)
3. Go to Console tab
4. Paste this:
   ```javascript
   firebase.auth().currentUser.uid
   ```
5. Copy the UID that appears

### **Step 2: Run the Script**

Open terminal in your project folder and run:

```bash
# For student role
node scripts/set-student-role.js YOUR_UID_HERE student

# For teacher role
node scripts/set-student-role.js YOUR_UID_HERE teacher

# For parent role
node scripts/set-student-role.js YOUR_UID_HERE parent
```

**Example:**
```bash
node scripts/set-student-role.js abc123xyz456 student
```

### **Step 3: Sign Out and Sign In**

1. In your app, click "Sign Out"
2. Sign in again
3. Go to: `http://localhost:4200/s/assignments`
4. ✅ Should work now!

---

## 🎯 **Complete Example**

```bash
# 1. Get your UID (from browser console or get-my-uid.html)
# Let's say it's: Kx9mP2nQ3rS4tU5v

# 2. Run the script
node scripts/set-student-role.js Kx9mP2nQ3rS4tU5v student

# 3. You'll see:
# ✅ Success! Role "student" has been set for user Kx9mP2nQ3rS4tU5v
# ⚠️  IMPORTANT: The user must sign out and sign in again!

# 4. In your app:
# - Sign out
# - Sign in
# - Go to /s/assignments
# - ✅ Works!
```

---

## 🔍 **Alternative: Find UID in Firebase Console**

1. Go to: https://console.firebase.google.com/
2. Select project: **nuraai**
3. Click **Authentication** (left sidebar)
4. Click **Users** tab
5. Find your user
6. Copy the **User UID** (long string like `abc123xyz...`)

---

## 🐛 **Troubleshooting**

### **Error: "Cannot find module '../server/serviceAccountKey.json'"**

The script needs your Firebase service account key. 

**Fix:**
1. Go to Firebase Console
2. Project Settings (gear icon) → Service Accounts
3. Click "Generate New Private Key"
4. Save the file as `serviceAccountKey.json`
5. Put it in the `server/` folder
6. Run the script again

### **Still Redirecting After Setting Role?**

Make sure you:
1. ✅ Signed out completely
2. ✅ Signed in again (this refreshes the token)
3. ✅ Cleared browser cache if needed
4. ✅ Used the correct UID

**Verify the role was set:**
```javascript
// In browser console
firebase.auth().currentUser.getIdTokenResult().then(token => {
  console.log('My role:', token.claims.role);
});
```

### **Script Errors?**

Make sure you have the dependencies:
```bash
cd server
npm install
```

---

## 📋 **Quick Reference**

### **Set Roles for Different Users:**

```bash
# Student
node scripts/set-student-role.js USER_UID student

# Teacher  
node scripts/set-student-role.js USER_UID teacher

# Parent
node scripts/set-student-role.js USER_UID parent
```

### **Routes by Role:**

| Role | Routes | Purpose |
|------|--------|---------|
| `student` | `/s/assignments` | View and complete assignments |
| `teacher` | `/t/classes`, `/t/reports` | Create classes, assignments, grade |
| `parent` | `/p/home`, `/p/student/{id}` | View child's progress (read-only) |

---

## ✨ **What the Script Does**

1. ✅ Connects to Firebase Admin SDK
2. ✅ Sets the custom claim `{ role: 'student' }`
3. ✅ Verifies the claim was set
4. ✅ Shows you the user's details
5. ✅ Reminds you to sign out/in

---

## 🚀 **After Setting Role**

### **Test the Student View:**

1. Sign out from your app
2. Sign in again
3. Navigate to: `http://localhost:4200/s/assignments`
4. You should see:
   - ✅ "My Assignments" heading
   - ✅ "Join a Class" button
   - ✅ No redirect to home

### **Join a Class:**

1. Have a teacher create a class (get the join code)
2. Click "Join a Class"
3. Enter the code
4. ✅ Success! You'll see the class badge
5. ✅ Assignments from that class will appear

---

## 💡 **Pro Tips**

### **Set Multiple Roles at Once:**

```bash
# Create multiple test accounts
node scripts/set-student-role.js STUDENT_UID_1 student
node scripts/set-student-role.js STUDENT_UID_2 student
node scripts/set-student-role.js TEACHER_UID teacher
node scripts/set-student-role.js PARENT_UID parent
```

### **Check Current Role:**

Add this to any component temporarily:
```typescript
import { Auth } from '@angular/fire/auth';

constructor(private auth: Auth) {
  this.auth.currentUser?.getIdTokenResult().then(token => {
    console.log('🔑 My Claims:', token.claims);
    console.log('👤 My Role:', token.claims.role);
  });
}
```

---

## 📞 **Need Help?**

If you're still having issues:

1. Check that `server/serviceAccountKey.json` exists
2. Verify you're using the correct UID
3. Make sure you signed out and back in
4. Check browser console for errors
5. Try clearing localStorage: `localStorage.clear()`

---

**Ready? Run the script and let's get you testing! 🚀**
