# 📬 Notification Enhancement Plan

## Current State ✅

### What We Have:
1. **`NotificationService`** - Basic service to fetch and mark notifications as read
2. **Cloud Functions**:
   - `onAssignmentCreated` - Notifies students when a new assignment is posted
   - `onSubmissionGraded` - Notifies students when their submission is graded
3. **Notification Model** - Basic structure with types: `assignment_posted`, `due_soon`, `graded`, `comment`

### What's Missing:
- ❌ No notification bell UI component
- ❌ No unread count badge
- ❌ No real-time updates
- ❌ No notification for when students submit assignments (teachers don't get notified!)
- ❌ No visual indicators on classes/students with pending submissions
- ❌ No notification dropdown/panel
- ❌ No FCM (Firebase Cloud Messaging) for push notifications
- ❌ No email notifications

---

## 🎯 Proposed Enhancements

### Phase 1: Core Notification UI (High Priority)

#### 1.1 Notification Bell Component
**Location**: `src/app/components/shared/notification-bell/`

**Features**:
- Bell icon in header (for both teachers and students)
- Red badge showing unread count
- Dropdown panel showing recent notifications
- Click to mark as read
- Click notification to navigate to relevant page
- Real-time updates using Firestore snapshots

**UI Design**:
```
┌─────────────────────────────────────┐
│  🔔 (5)  ← Red badge with count     │
│  ↓ Click opens dropdown             │
│  ┌───────────────────────────────┐  │
│  │ 📬 Notifications              │  │
│  │ ─────────────────────────────│  │
│  │ 🆕 New submission from Ali    │  │
│  │    Surah Al-Fatiha • 2m ago  │  │
│  │ ─────────────────────────────│  │
│  │ ✅ Assignment graded          │  │
│  │    Score: 95/100 • 1h ago    │  │
│  │ ─────────────────────────────│  │
│  │ 📝 New assignment posted      │  │
│  │    Surah Al-Baqarah • 3h ago │  │
│  │ ─────────────────────────────│  │
│  │ View All →                    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

#### 1.2 Submission Notification Cloud Function
**Location**: `functions/src/notifications.ts`

**New Function**: `onSubmissionCreated`
- Triggers when a student submits an assignment
- Notifies the teacher who created the assignment
- Includes student name, assignment title, and submission time

```typescript
export const onSubmissionCreated = functions.firestore
  .document('submissions/{sid}')
  .onCreate(async (snap) => {
    const submission = snap.data();
    
    // Get assignment details
    const assignmentDoc = await db.doc(`assignments/${submission.assignmentId}`).get();
    const assignment = assignmentDoc.data();
    
    // Get student details
    const studentDoc = await db.doc(`users/${submission.studentId}`).get();
    const student = studentDoc.data();
    
    // Create notification for teacher
    const notification = {
      toUid: assignment.teacherId,
      type: 'submission_received',
      ref: { collection: 'submissions', id: snap.id },
      title: '📝 New Submission Received',
      body: `${student.displayName || 'A student'} submitted "${assignment.title}"`,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        assignmentId: submission.assignmentId,
        studentId: submission.studentId,
        classId: assignment.classId,
      }
    };
    
    await db.collection('notifications').add(notification);
  });
```

#### 1.3 Update Notification Model
**Location**: `src/app/models/classroom.models.ts`

Add new notification type:
```typescript
export interface Notification {
  id: string;
  toUid: string;
  type: 'assignment_posted' | 'due_soon' | 'graded' | 'comment' | 'submission_received'; // NEW
  ref: { collection: string; id: string };
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
  metadata?: { // NEW - Additional context
    assignmentId?: string;
    studentId?: string;
    classId?: string;
  };
}
```

#### 1.4 Class/Student Badge Indicators
**Location**: `src/app/features/classroom/teacher-dashboard.component.ts`

**Features**:
- Red badge on class cards showing ungraded submission count
- Badge on student cards in 1-on-1 mode
- Real-time updates

**Implementation**:
```typescript
// Add to TeacherDashboardComponent
ungradedSubmissionsCount: { [classId: string]: Observable<number> } = {};
ungradedSubmissionsForStudent: { [studentId: string]: Observable<number> } = {};

ngOnInit() {
  // For each class, count ungraded submissions
  this.myClasses$.subscribe(classes => {
    classes.forEach(cls => {
      this.ungradedSubmissionsCount[cls.id] = this.submissionService
        .countUngradedSubmissionsForClass(cls.id);
    });
  });
  
  // For each student, count ungraded submissions
  this.myStudents$.subscribe(students => {
    students.forEach(student => {
      this.ungradedSubmissionsForStudent[student.id] = this.submissionService
        .countUngradedSubmissionsForStudent(student.id);
    });
  });
}
```

**UI Update** (`teacher-dashboard.component.html`):
```html
<!-- Class card with badge -->
<div class="card bg-base-100 shadow-xl relative">
  <!-- Badge for ungraded submissions -->
  <div *ngIf="(ungradedSubmissionsCount[cls.id] | async) as count" 
       class="absolute top-2 right-2 badge badge-error badge-lg">
    {{ count }} new
  </div>
  
  <div class="card-body">
    <h2 class="card-title">{{ cls.name }}</h2>
    <!-- ... rest of card ... -->
  </div>
</div>
```

---

### Phase 2: Real-Time Updates (Medium Priority)

#### 2.1 Real-Time Notification Service
Update `NotificationService` to use Firestore snapshots:

```typescript
// src/app/services/notification.service.ts
listenToMyNotifications(limitCount: number = 20): Observable<Notification[]> {
  const user = this.auth.currentUser;
  if (!user) return of([]);

  const q = query(
    this.notificationsCollection,
    where('toUid', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  return collectionData(q, { idField: 'id' }) as Observable<Notification[]>;
}

getUnreadCount(): Observable<number> {
  const user = this.auth.currentUser;
  if (!user) return of(0);

  const q = query(
    this.notificationsCollection,
    where('toUid', '==', user.uid),
    where('read', '==', false)
  );
  
  return collectionData(q).pipe(
    map(notifications => notifications.length)
  );
}
```

#### 2.2 Sound/Visual Alerts
- Play a subtle sound when a new notification arrives
- Show a toast notification for high-priority events
- Browser notification API (optional, requires permission)

---

### Phase 3: Advanced Features (Lower Priority)

#### 3.1 Email Notifications
**Location**: `functions/src/email-notifications.ts`

**Triggers**:
- Daily digest of ungraded submissions (for teachers)
- Assignment due reminders (for students)
- Weekly progress report (for teachers)

**Implementation**:
- Use SendGrid, Mailgun, or Firebase Extensions
- Scheduled Cloud Functions with `pubsub.schedule()`

#### 3.2 Push Notifications (FCM)
**Requirements**:
- Register device tokens
- Store tokens in Firestore
- Send push notifications via Cloud Functions
- Handle notification clicks to navigate to relevant page

#### 3.3 Notification Preferences
**Location**: `src/app/components/settings/notification-settings.component.ts`

**Features**:
- Toggle email notifications on/off
- Toggle push notifications on/off
- Choose notification types to receive
- Set quiet hours

---

## 🚀 Implementation Priority

### **Immediate (This Session)**
1. ✅ Create `NotificationBellComponent` with unread badge
2. ✅ Add `onSubmissionCreated` Cloud Function
3. ✅ Add submission count badges to teacher dashboard
4. ✅ Update `NotificationService` for real-time updates
5. ✅ Update notification model with new type

### **Next Session**
1. Email notifications for critical events
2. Notification preferences page
3. Browser push notifications (FCM)

---

## 📊 User Experience Flow

### Teacher Flow:
1. **Student submits assignment** → Teacher sees:
   - 🔔 Bell icon badge increments (+1)
   - Red badge appears on class card ("1 new")
   - Toast notification: "New submission from Ali"
   - Click notification → Navigate to submission view

2. **Teacher grades submission** → Student sees:
   - 🔔 Bell icon badge increments (+1)
   - Notification: "Assignment graded - Score: 95/100"
   - Click notification → Navigate to assignment with feedback

### Student Flow:
1. **Teacher posts assignment** → Student sees:
   - 🔔 Bell icon badge increments (+1)
   - Notification: "New assignment: Surah Al-Fatiha"
   - Click notification → Navigate to assignment reader

2. **Assignment due soon** → Student sees:
   - 🔔 Bell icon badge increments (+1)
   - Notification: "Due in 2 hours: Surah Al-Baqarah"

---

## 🎨 UI Mockups

### Notification Bell (Header)
```
┌─────────────────────────────────────┐
│  Nura AI    [🏠] [📚] [🔔 3] [👤]  │
│                        ↑             │
│                   Red badge          │
└─────────────────────────────────────┘
```

### Class Card with Badge
```
┌────────────────────────────────┐
│  [3 new] ← Red badge           │
│  📚 Tajweed Class              │
│  ─────────────────────────────│
│  15 students • 8 assignments   │
│  [View Assignments] [Settings] │
└────────────────────────────────┘
```

### Notification Dropdown
```
┌────────────────────────────────────┐
│  📬 Notifications (3 unread)       │
│  ─────────────────────────────────│
│  🆕 Ali submitted Surah Al-Fatiha │
│     2 minutes ago                  │
│  ─────────────────────────────────│
│  ✅ Fatima graded (95/100)        │
│     1 hour ago                     │
│  ─────────────────────────────────│
│  📝 New assignment posted          │
│     3 hours ago                    │
│  ─────────────────────────────────│
│  [Mark all as read] [View all →]  │
└────────────────────────────────────┘
```

---

## 🔧 Technical Implementation Details

### Firestore Indexes Required
```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "toUid", "order": "ASCENDING" },
    { "fieldPath": "read", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### Security Rules Update
```firebase
match /notifications/{notificationId} {
  allow read: if request.auth != null && resource.data.toUid == request.auth.uid;
  allow write: if false; // Only Cloud Functions can write
  allow update: if request.auth != null 
                && resource.data.toUid == request.auth.uid
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
}
```

---

## 📝 Summary

**Current Progress**: 40% complete
- ✅ Basic notification infrastructure
- ✅ Cloud Functions for assignments and grading
- ❌ No UI components
- ❌ No submission notifications for teachers
- ❌ No real-time updates

**After Phase 1**: 80% complete
- ✅ Full notification UI
- ✅ Real-time updates
- ✅ Teacher submission notifications
- ✅ Visual indicators on dashboard

**After Phase 2-3**: 100% complete
- ✅ Email notifications
- ✅ Push notifications
- ✅ User preferences

---

**Ready to implement Phase 1?** Let me know and I'll start building! 🚀

