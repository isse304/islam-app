# 📚 Class Management Rules & Permissions

## ✅ **Current Implementation Status**

### **1. Teacher is First Member** ✅
- **Status:** Already implemented
- **Location:** `class.service.ts` line 44
- **Code:** `memberIds: [user.uid]`
- **Behavior:** When a teacher creates a class, they are automatically added as the first member

### **2. Students Can Join Multiple Classes** ✅
- **Status:** Allowed (no limit)
- **Behavior:** Students can join as many classes as they want
- **Validation:** Checks if student is already in class (prevents duplicates)
- **Error:** "You are already a member of this class."

### **3. Teacher Can Remove Students** ✅
- **Status:** Just implemented
- **Method:** `removeStudentFromClass(classId, studentId)`
- **Permissions:** Only class owner (teacher) can remove students
- **Restrictions:** Teacher cannot remove themselves

---

## 🔒 **Business Rules**

### **Class Creation:**
```typescript
✅ Teacher creates class
✅ Teacher is automatically added as first member (memberIds[0])
✅ Unique join code is generated (8 characters)
✅ Teacher becomes class owner (ownerId)
```

### **Joining Classes:**
```typescript
✅ Students can join by entering class code
✅ System checks if student is already a member
❌ Cannot join the same class twice
✅ Can join multiple different classes (no limit)
✅ Teacher is already a member (no need to join)
```

### **Removing Students:**
```typescript
✅ Only class owner (teacher) can remove students
❌ Students CANNOT remove themselves
❌ Teacher CANNOT remove themselves
❌ Other students CANNOT remove each other
✅ Teacher can remove any student from their class
```

---

## 🛡️ **Security Rules**

### **Current Status:**
Currently using **permissive rules** for development:
```javascript
// TEMPORARY: Allow all authenticated users
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### **Production Rules (TO BE ENABLED):**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    
    // Helper functions
    function isSignedIn() { 
      return request.auth != null; 
    }
    
    function isTeacher() { 
      return isSignedIn() && request.auth.token.role == 'teacher'; 
    }
    
    function isStudent() { 
      return isSignedIn() && request.auth.token.role == 'student'; 
    }
    
    function isClassOwner(classId) {
      return isTeacher() && get(/databases/$(database)/documents/classes/$(classId)).data.ownerId == request.auth.uid;
    }
    
    function isClassMember(classId) {
      return isSignedIn() && request.auth.uid in get(/databases/$(database)/documents/classes/$(classId)).data.memberIds;
    }

    // Classes collection
    match /classes/{classId} {
      // Anyone can read classes (to join by code)
      allow read: if isSignedIn();
      
      // Only teachers can create classes
      allow create: if isTeacher() && 
                       request.resource.data.ownerId == request.auth.uid &&
                       request.resource.data.memberIds[0] == request.auth.uid;
      
      // Only class owner can update class
      allow update: if isClassOwner(classId) || 
                       (isStudent() && 
                        request.auth.uid in request.resource.data.memberIds && // Adding self
                        !request.auth.uid in resource.data.memberIds); // Not already member
      
      // Only class owner can delete class
      allow delete: if isClassOwner(classId);
    }
  }
}
```

---

## 📊 **Data Model**

```typescript
interface Class {
  id: string;
  name: string;
  ownerId: string;           // Teacher UID (never changes)
  createdAt: Timestamp;
  memberIds: string[];        // [teacherUid, studentUid1, studentUid2, ...]
  parentIds?: string[];       // Optional: parent UIDs
  code: string;              // Join code (8 chars)
}
```

**Key Points:**
- `ownerId` = Teacher who created the class
- `memberIds[0]` = Always the teacher
- `memberIds[1+]` = Students who joined
- Teacher is both owner AND member

---

## 🔧 **API Methods**

### **For Teachers:**

```typescript
// Create a class
await classService.createClass("Quran Class 101");
// → Teacher is automatically added to memberIds

// Remove a student from class
await classService.removeStudentFromClass(classId, studentUid);
// → Only owner can do this
// → Cannot remove themselves

// Check if user is class owner
const isOwner = await classService.isClassOwner(classId);
```

### **For Students:**

```typescript
// Join a class by code
await classService.joinClassByCode("ABC123");
// → Checks if already a member
// → Adds to memberIds array

// List my classes
const classes$ = classService.listMyClasses();
// → Returns all classes where user is in memberIds
```

---

## ⚠️ **Important Behaviors**

### **1. Duplicate Prevention**
```typescript
// Student tries to join same class twice
await classService.joinClassByCode("ABC123");
// First time: ✅ Success
await classService.joinClassByCode("ABC123");
// Second time: ❌ Error: "You are already a member of this class."
```

### **2. Teacher is Always First**
```typescript
// When teacher creates class
memberIds = [teacherUid]  // ✅ Automatically added

// After 2 students join
memberIds = [teacherUid, student1Uid, student2Uid]
```

### **3. Students Cannot Leave**
```typescript
// Student cannot remove themselves
// Only teacher can remove students using:
await classService.removeStudentFromClass(classId, studentUid);
```

### **4. Teacher Cannot Self-Remove**
```typescript
await classService.removeStudentFromClass(classId, teacherOwnUid);
// ❌ Error: "Teachers cannot remove themselves from their own class"
```

---

## 🧪 **Testing Scenarios**

### **Scenario 1: Create Class**
```
1. Teacher logs in
2. Creates class "Test Class"
3. ✅ Teacher.uid is in memberIds
4. ✅ Teacher.uid is the ownerId
5. ✅ Join code is generated
```

### **Scenario 2: Student Joins**
```
1. Student logs in
2. Enters valid join code
3. ✅ Student added to memberIds
4. ✅ Can see class in "My Classes"
5. ✅ Can see assignments for that class
```

### **Scenario 3: Duplicate Join Attempt**
```
1. Student already in class
2. Tries to join again with same code
3. ❌ Error: "You are already a member of this class."
4. ✅ Not added twice to memberIds
```

### **Scenario 4: Teacher Removes Student**
```
1. Teacher views class members
2. Clicks "Remove" on a student
3. ✅ Student removed from memberIds
4. ✅ Student no longer sees class or assignments
```

### **Scenario 5: Student Cannot Remove Self**
```
1. Student views their classes
2. No "Leave Class" button
3. ✅ Student cannot remove themselves
4. ✅ Only teacher can remove them
```

---

## 🚀 **To-Do (Future Enhancements)**

### **Optional Features:**
- [ ] Allow students to leave class (if you want this)
- [ ] Class size limit (max students per class)
- [ ] Class archive/deactivation
- [ ] Student approval system (teacher approves joins)
- [ ] Class invitations (invite specific students)
- [ ] Co-teachers (multiple owners)

---

## 📝 **Summary**

| Rule | Status | Enforced By |
|------|--------|-------------|
| Teacher is first member | ✅ Yes | Code (automatic) |
| Students can join multiple classes | ✅ Yes | No limit set |
| No duplicate joins | ✅ Yes | Code validation |
| Students cannot leave | ✅ Yes | No leave method exists |
| Only teacher can remove students | ✅ Yes | Code + (will add security rules) |
| Teacher cannot remove self | ✅ Yes | Code validation |

---

**All rules are implemented in code!** 🎉

Security rules are currently permissive for development. Enable production rules when ready to deploy.

