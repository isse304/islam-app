# Assignment Guard Implementation

## 🔐 Overview

The `AssignmentGuard` is a route guard that protects the `/reader` route when in assignment mode, ensuring only authorized users can access specific assignments.

## ✅ Access Control Rules

### 1. **Teachers**
- ✅ Can access any assignment they created
- ✅ No restrictions (they own the assignment)

### 2. **Students - Classroom Assignments**
- ✅ Can access if they are a member of the class
- ❌ Cannot access if not in the class
- 💡 Shown dialog with option to join the class

### 3. **Students - Individual Assignments**
- ✅ Can access if the assignment is specifically assigned to them
- ❌ Cannot access if assigned to someone else
- 💡 Shown clear error message

### 4. **Non-Assignment Mode**
- ✅ Guard allows access (doesn't interfere with normal reader usage)

## 🛡️ Security Flow

```
User clicks assignment link
         ↓
   authGuardFn checks authentication
         ↓
   assignmentGuard checks authorization
         ↓
    ┌────────────────────────┐
    │ Is mode=assignment?    │
    └────────────────────────┘
         ↓ No → Allow access
         ↓ Yes
    ┌────────────────────────┐
    │ Has assignment ID?     │
    └────────────────────────┘
         ↓ No → Deny (redirect home)
         ↓ Yes
    ┌────────────────────────┐
    │ Fetch assignment       │
    └────────────────────────┘
         ↓
    ┌────────────────────────┐
    │ Is user the teacher?   │
    └────────────────────────┘
         ↓ Yes → Allow access
         ↓ No
    ┌────────────────────────┐
    │ Check assignment mode  │
    └────────────────────────┘
         ↓
    ┌─────────────┬──────────────┐
    │ Individual  │  Classroom   │
    └─────────────┴──────────────┘
         ↓              ↓
    Is assigned    Is in class?
    to user?            ↓
         ↓         Yes → Allow
    Yes → Allow    No → Deny
    No → Deny      (show join dialog)
```

## 📁 Files Created

### 1. `src/app/guards/assignment.guard.ts`
**Purpose:** Route guard with access control logic

**Key Features:**
- Checks if route is in assignment mode
- Fetches assignment from Firestore
- Verifies user permissions based on assignment type
- Shows appropriate error dialogs
- Redirects unauthorized users

**Methods:**
- `assignmentGuard()` - Main guard function
- `showAccessDeniedDialog()` - Helper to show error dialog

### 2. `src/app/components/dialogs/assignment-access-denied-dialog/assignment-access-denied-dialog.component.ts`
**Purpose:** User-friendly dialog when access is denied

**Features:**
- Clear error message explaining why access was denied
- Lock icon for visual clarity
- For classroom assignments: Shows class code and join form
- Quick actions: Join class, go to assignments, or close
- Inline class joining (no need to navigate away)

## 🔄 User Experience

### Scenario 1: Student tries to access someone else's individual assignment
```
1. Student clicks assignment link
2. Guard checks: assignment.studentId !== user.uid
3. Dialog appears: "This assignment is not assigned to you."
4. Options: Go to My Assignments | Close
5. Student is redirected to /s/assignments
```

### Scenario 2: Student tries to access class assignment without being in class
```
1. Student clicks assignment link
2. Guard checks: user not in class.memberIds
3. Dialog appears: "You don't have access to this assignment. Join the class 'Math 101' to view it."
4. Shows: Class code: ABC123
5. Options: Join Class | Go to My Assignments | Close
6. If "Join Class" clicked:
   - Form appears with pre-filled class code
   - Student confirms and joins
   - Page reloads with access granted
```

### Scenario 3: Teacher views their own assignment
```
1. Teacher clicks assignment link
2. Guard checks: assignment.teacherId === user.uid
3. Access granted immediately (no dialog)
```

### Scenario 4: Student accesses their valid assignment
```
1. Student clicks their assignment
2. Guard checks: student is in class OR assignment is assigned to them
3. Access granted immediately
4. Reader loads with homework bar
```

## 🎨 Dialog UI

The access denied dialog features:
- **Header:** Lock icon + "Access Denied" title
- **Message:** Clear explanation of why access was denied
- **Join Form (if applicable):**
  - Shows class code
  - Input field to confirm code
  - "Join Class" button
  - "Cancel" button
- **Action Buttons:**
  - "Join Class" (if class code available)
  - "Go to My Assignments"
  - "Close"

## 🔧 Technical Implementation

### Guard Type
- Uses Angular's `CanActivateFn` (functional guard)
- Returns `Observable<boolean | UrlTree>`
- Integrates with Angular Router

### Dependencies
- `@angular/fire/firestore` - Fetch assignment and class data
- `@angular/fire/auth` - Get current user
- `@angular/material/dialog` - Show error dialogs
- `@angular/router` - Navigation and URL trees

### Error Handling
- Catches Firestore errors gracefully
- Logs errors to console for debugging
- Shows user-friendly messages
- Redirects to safe pages on error

### Performance
- Uses `take(1)` to prevent memory leaks
- Fetches only necessary data
- Caches nothing (always checks fresh data for security)

## 🧪 Testing Scenarios

### ✅ Test Case 1: Teacher Access
**Setup:** Teacher creates an assignment  
**Action:** Teacher clicks the assignment link  
**Expected:** Access granted, reader loads  
**Status:** ✅ Should work

### ✅ Test Case 2: Student - Valid Classroom Assignment
**Setup:** Student is in class, teacher assigns to class  
**Action:** Student clicks the assignment  
**Expected:** Access granted, reader loads  
**Status:** ✅ Should work

### ✅ Test Case 3: Student - Invalid Classroom Assignment
**Setup:** Student NOT in class, teacher assigns to class  
**Action:** Student clicks the assignment link  
**Expected:** Dialog appears with join option  
**Status:** ✅ Should work

### ✅ Test Case 4: Student - Valid Individual Assignment
**Setup:** Teacher assigns to specific student  
**Action:** That student clicks the assignment  
**Expected:** Access granted, reader loads  
**Status:** ✅ Should work

### ✅ Test Case 5: Student - Invalid Individual Assignment
**Setup:** Teacher assigns to Student A  
**Action:** Student B tries to access the link  
**Expected:** Dialog appears, no join option  
**Status:** ✅ Should work

### ✅ Test Case 6: Non-Assignment Mode
**Setup:** User navigates to `/reader` without assignment params  
**Action:** User accesses reader normally  
**Expected:** Guard allows access (doesn't interfere)  
**Status:** ✅ Should work

### ✅ Test Case 7: Missing Assignment ID
**Setup:** User navigates to `/reader?mode=assignment` (no aid)  
**Action:** Guard checks for assignment ID  
**Expected:** Redirect to home  
**Status:** ✅ Should work

### ✅ Test Case 8: Non-existent Assignment
**Setup:** User tries to access `/reader?mode=assignment&aid=FAKE_ID`  
**Action:** Guard tries to fetch assignment  
**Expected:** Dialog shows "Assignment not found"  
**Status:** ✅ Should work

### ✅ Test Case 9: Join Class from Dialog
**Setup:** Student sees access denied dialog with class code  
**Action:** Student enters code and clicks "Join Class"  
**Expected:** Student joins class, page reloads, access granted  
**Status:** ✅ Should work

## 🔒 Security Considerations

### ✅ **Firestore Rules Still Apply**
The guard is a **client-side check** for UX. Firestore security rules are the **server-side enforcement**. Both layers work together:
- Guard: Prevents navigation and shows helpful UI
- Rules: Prevents data access even if guard is bypassed

### ✅ **No Data Leakage**
- Guard only fetches assignment metadata (not content)
- Error messages don't reveal sensitive information
- Class codes are only shown if assignment is for that class

### ✅ **Authentication Required**
- Guard runs AFTER `authGuardFn`
- Unauthenticated users are redirected to login first

### ✅ **Real-time Verification**
- Guard checks Firestore on every navigation
- No caching of permissions
- Always uses fresh data

## 📝 Configuration

### Route Setup
```typescript
{
  path: 'reader',
  loadComponent: () => import('./components/quran/quran-reader/quran-reader.component').then(m => m.QuranReaderComponent),
  canActivate: [authGuardFn, assignmentGuard], // Both guards applied
}
```

### Guard Order
1. `authGuardFn` - Checks authentication
2. `assignmentGuard` - Checks authorization

**Important:** Order matters! Auth must come first.

## 🚀 Future Enhancements

### Potential Improvements:
1. **Parent Access:** Allow parents to view their child's assignments
2. **Caching:** Cache assignment metadata for better performance (with TTL)
3. **Offline Support:** Show cached assignments when offline
4. **Analytics:** Track unauthorized access attempts
5. **Admin Override:** Allow admins to view any assignment
6. **Expiration:** Prevent access to expired assignments
7. **Preview Mode:** Allow teachers to share preview links

## 📊 Impact

### Before Guard:
- ❌ Any student could access any assignment link
- ❌ No validation of class membership
- ❌ Security relied only on obscurity (long assignment IDs)

### After Guard:
- ✅ Students can only access their own assignments
- ✅ Class membership is verified
- ✅ Clear error messages guide users
- ✅ Option to join class directly from error dialog
- ✅ Teachers have unrestricted access to their assignments

## 🎯 Summary

The `AssignmentGuard` provides robust, user-friendly access control for assignments:
- **Secure:** Verifies permissions before granting access
- **Helpful:** Shows clear error messages with actionable steps
- **Flexible:** Handles both classroom and individual assignments
- **Performant:** Minimal overhead, only checks when needed
- **Maintainable:** Clean, well-documented code

Students can now confidently click assignment links knowing they'll either get access or receive helpful guidance on how to gain access.

