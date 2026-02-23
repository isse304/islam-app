# Nura Academy Dashboard Support Guide

**Version:** 1.0  
**Last Updated:** February 11, 2026  
**Author:** Nura Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Student Dashboard Guide](#student-dashboard-guide)
3. [Teacher Dashboard Guide](#teacher-dashboard-guide)
4. [Testing Checklist](#testing-checklist)
5. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
6. [Technical Architecture](#technical-architecture)

---

## Overview

The Nura Academy Dashboard system provides a comprehensive learning management platform with separate interfaces for students and teachers. The system features real-time data synchronization, progress tracking, assignment management, and Islamic-inspired design aesthetics.

### Key Features
- **Real-time Updates:** All data syncs instantly via Firebase
- **Responsive Design:** Works seamlessly on desktop, tablet, and mobile
- **Dark Mode Support:** Complete theme switching with Islamic patterns
- **Progress Analytics:** Chart.js visualizations for performance tracking
- **Calendar Integration:** Assignment scheduling and deadline tracking
- **Archive System:** Historical assignment records with filtering

---

## Student Dashboard Guide

### Accessing the Student Dashboard

1. **Login:** Navigate to the app and sign in with student credentials
2. **Navigation:** Click the **🕋 Academy** dropdown in the header
3. **Select:** Choose **Dashboard** from the Student Portal section

### Dashboard Home (`/s/dashboard`)

**Purpose:** Central hub for daily learning activities

#### Widgets Overview

**1. Today's Focus Widget**
- Displays assignments due today
- Shows submission status (Not Started, In Progress, Submitted)
- Quick links to start or continue work
- Color-coded status indicators:
  - 🔴 Red: Not started
  - 🟡 Yellow: In progress
  - 🟢 Green: Submitted

**2. Week Overview Widget**
- Shows assignments for the current week
- Grouped by due date
- Quick view of upcoming deadlines
- Click any assignment to view details

**3. Progress Summary Widget**
- Overall completion rate percentage
- Average grade across all assignments
- Current grade trend (Improving/Stable/Declining)
- Subject breakdown with performance indicators

#### What to Check
- ✅ All widgets load within 2-3 seconds
- ✅ Assignment counts are accurate
- ✅ Clicking assignments navigates to detail page
- ✅ Progress percentages match actual completion
- ✅ No "stuck loading" spinners

---

### Assignments Page (`/s/assignments`)

**Purpose:** View and manage all current assignments

#### Features

**Status Tabs:**
- **All:** Complete list of assignments
- **Pending:** Not yet submitted
- **In Progress:** Started but not completed
- **Submitted:** Awaiting grading
- **Graded:** Completed with feedback

**Assignment Cards Display:**
- Assignment title and description
- Due date with countdown
- Subject/class name
- Points possible
- Submission status
- Grade (if available)

**Actions:**
- Click card to view full details
- Submit work button (for pending)
- View feedback (for graded)

#### What to Check
- ✅ Tabs filter assignments correctly
- ✅ Assignment counts match in each tab
- ✅ Due dates display in readable format
- ✅ Status badges show correct colors
- ✅ Click actions navigate properly
- ✅ Late assignments show warning indicator

---

### Progress Analytics (`/s/progress`)

**Purpose:** Visualize academic performance and trends

#### Charts & Metrics

**1. Grade Trend Chart (Line Chart)**
- X-axis: Time (last 30 days)
- Y-axis: Grade percentage
- Shows performance trajectory
- Hover for specific data points

**2. Subject Performance (Bar Chart)**
- Compares average grades by subject
- Color-coded bars (Islamic palette)
- Shows which subjects need attention
- Horizontal layout for easy reading

**3. Completion Rate (Donut Chart)**
- Center displays overall percentage
- Segments show:
  - Completed (green)
  - In Progress (yellow)
  - Not Started (red)

**4. Summary Statistics**
- Total assignments completed
- Average grade
- Current streak (consecutive days)
- Best performing subject

#### What to Check
- ✅ All charts render without errors
- ✅ Data points are accurate
- ✅ Hover tooltips display correctly
- ✅ Charts resize on mobile devices
- ✅ Colors match light/dark theme
- ✅ No console errors in browser

---

### Calendar View (`/s/calendar`)

**Purpose:** Schedule and deadline visualization

#### Features

**View Modes:**
- **Month View:** Full month grid with all assignments
- **Week View:** Detailed 7-day schedule
- **Day View:** Single day focus (optional)

**Calendar Events:**
- Assignment due dates
- Class sessions (if scheduled)
- Color-coded by subject/priority
- Click event to view details

**Date Navigation:**
- Previous/Next buttons
- Today button (return to current date)
- Month/Year selector dropdown

#### What to Check
- ✅ Events appear on correct dates
- ✅ Clicking events shows details
- ✅ Navigation buttons work smoothly
- ✅ Current day is highlighted
- ✅ Past due assignments show differently
- ✅ Mobile view displays correctly

---

### Archive (`/s/archive`)

**Purpose:** Access historical assignment records

#### Filtering Options

**Available Filters:**
- **Date Range:** Select start and end dates
- **Subject/Class:** Filter by specific class
- **Status:** All, Completed, Graded, Late
- **Grade Range:** Filter by score percentage
- **Search:** Text search by assignment name

**Statistics Display:**
- Total archived assignments
- Average grade
- Completion rate
- On-time submission rate

**Export Options:**
- Export to CSV spreadsheet
- Export to PDF report
- Filter applies to export

#### What to Check
- ✅ Filters update results immediately
- ✅ Statistics recalculate with filters
- ✅ Export downloads successfully
- ✅ Search finds assignments correctly
- ✅ Date range validation works
- ✅ No duplicate records

---

## Teacher Dashboard Guide

### Accessing the Teacher Dashboard

1. **Login:** Sign in with teacher credentials
2. **Navigation:** Click **🕋 Academy** → **My Classes**
3. **View Options:** Switch between Classroom and Individual modes

### Teacher Dashboard Home (`/t/classes`)

**Purpose:** Manage classes and monitor student progress

#### Dashboard Stats Cards

**1. Total Classes**
- Count of active classes
- Click to view class list

**2. Total Students**
- Aggregate student count across all classes
- Updates in real-time

**3. Active Assignments**
- Currently open assignments
- Shows deadline info

**4. Ungraded Submissions**
- Pending grading queue
- Prioritized by due date

**5. Average Score**
- Overall class performance
- Trend indicator

#### Class List View

**Each Class Card Shows:**
- Class name and subject
- Student count
- Active assignments count
- Recent activity timestamp
- Quick action buttons:
  - View Details
  - Create Assignment
  - View Roster

#### What to Check
- ✅ Stats cards display accurate numbers
- ✅ Real-time updates when data changes
- ✅ Class cards load all information
- ✅ Click actions navigate correctly
- ✅ No permission errors in console
- ✅ Ungraded count updates after grading

---

### Reports Page (`/t/reports`)

**Purpose:** Detailed analytics and student performance tracking

#### Available Reports

**1. Class Performance Report**
- Average grade per class
- Completion rates
- Student engagement metrics
- Chart visualizations

**2. Student Performance Report**
- Individual student breakdown
- Grade trends
- Assignment completion
- Needs attention indicators

**3. Assignment Analytics**
- Most/least successful assignments
- Average scores by assignment
- Time-to-completion metrics

**Chart Features:**
- Islamic color palette
- Responsive design
- Export to PNG/PDF
- Interactive tooltips

#### What to Check
- ✅ Reports load all class data
- ✅ Charts render with correct data
- ✅ Filters apply properly
- ✅ Export functionality works
- ✅ Mobile view is readable
- ✅ Date ranges calculate correctly

---

### Gradebook (`/t/gradebook`)

**Purpose:** Grade assignments and provide feedback

#### Features

**Student List:**
- Sortable columns (name, grade, submissions)
- Filter by class
- Search students

**Grading Interface:**
- Assignment submission viewer
- Points entry field
- Feedback text area
- Rubric display (if available)
- Save/Submit buttons

**Bulk Actions:**
- Grade multiple submissions
- Send feedback to multiple students
- Export grades to CSV

#### What to Check
- ✅ Student list loads correctly
- ✅ Submission files open/preview
- ✅ Grade saves immediately
- ✅ Students receive notifications
- ✅ Feedback displays for students
- ✅ Bulk actions complete successfully

---

## Testing Checklist

### Pre-Launch Testing

#### Authentication & Permissions
- [ ] Student can only access student routes
- [ ] Teacher can only access teacher routes
- [ ] Unauthorized access redirects to login
- [ ] Session persists on page refresh
- [ ] Sign out works correctly

#### Student Dashboard
- [ ] Dashboard home loads all widgets
- [ ] Assignments page displays all tabs
- [ ] Progress charts render correctly
- [ ] Calendar shows events on correct dates
- [ ] Archive filters work properly
- [ ] Export functionality downloads files

#### Teacher Dashboard
- [ ] Stats cards show accurate counts
- [ ] Class list displays all classes
- [ ] Reports generate without errors
- [ ] Gradebook loads submissions
- [ ] Grading saves to database
- [ ] Students receive grade notifications

#### Real-Time Sync
- [ ] New assignments appear immediately
- [ ] Grade updates reflect instantly
- [ ] Submission status changes sync
- [ ] Multiple browser tabs stay in sync

#### Responsive Design
- [ ] Desktop view (≥1200px) displays correctly
- [ ] Tablet view (768px-1199px) adapts properly
- [ ] Mobile view (<768px) works smoothly
- [ ] Touch interactions work on mobile
- [ ] Mobile menu opens/closes properly

#### Dark Mode
- [ ] Theme toggle switches modes
- [ ] All components adapt to dark theme
- [ ] Charts update colors correctly
- [ ] Islamic patterns remain visible
- [ ] No white flashes on page load

#### Performance
- [ ] Initial page load < 3 seconds
- [ ] Dashboard data loads < 2 seconds
- [ ] Charts render < 1 second
- [ ] No memory leaks (test for 30 mins)
- [ ] Firebase queries are optimized

#### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## Common Issues & Troubleshooting

### Issue: Dashboard Stuck Loading

**Symptoms:** Loading spinner never stops

**Causes:**
1. Firebase query not completing
2. Missing `firstValueFrom()` conversion
3. Change detection not triggered

**Solutions:**
1. Check browser console for errors
2. Verify Firebase security rules allow access
3. Confirm `ChangeDetectorRef.detectChanges()` is called
4. Check network tab for failed requests

**Code Check:**
```typescript
// ✅ Correct
const data = await firstValueFrom(this.service.getData());
this.loading = false;
this.cdr.detectChanges();

// ❌ Incorrect
const data = await this.service.getData().toPromise(); // Can hang
```

---

### Issue: Dropdowns Don't Appear When Scrolled

**Symptoms:** Academy dropdown works at top but not when scrolled

**Causes:**
1. Z-index stacking issues
2. Overflow clipping

**Solutions:**
1. Verify `.cdk-overlay-container` has `z-index: 1100`
2. Check parent containers don't have `overflow: hidden`
3. Ensure Material menu has `position: fixed`

**CSS Check:**
```scss
::ng-deep .modern-dropdown .mat-mdc-menu-panel {
  z-index: 1100 !important;
  position: fixed !important;
}
```

---

### Issue: Charts Not Displaying

**Symptoms:** Empty chart containers or errors

**Causes:**
1. Chart.js not installed
2. Data format incorrect
3. Canvas element missing

**Solutions:**
1. Run `npm install chart.js`
2. Verify data structure matches Chart.js format
3. Check HTML has `<canvas>` element with correct ID
4. Ensure chart destruction on component destroy

**Code Check:**
```typescript
// ✅ Correct
ngOnDestroy() {
  if (this.chart) {
    this.chart.destroy(); // Prevent memory leak
  }
}
```

---

### Issue: Real-Time Updates Not Working

**Symptoms:** Changes don't appear until refresh

**Causes:**
1. Using `.get()` instead of `.valueChanges()`
2. Not subscribing to observables
3. Subscription cleaned up too early

**Solutions:**
1. Use Firebase `collectionData()` for real-time
2. Store subscriptions and unsubscribe properly
3. Verify Firebase rules allow reads

**Code Check:**
```typescript
// ✅ Correct - Real-time
this.assignments$ = this.firestore
  .collection('assignments')
  .valueChanges();

// ❌ Incorrect - One-time
const assignments = await this.firestore
  .collection('assignments')
  .get();
```

---

### Issue: Permission Denied Errors

**Symptoms:** Firebase permission errors in console

**Causes:**
1. Firestore security rules too restrictive
2. User not authenticated
3. Accessing wrong document

**Solutions:**
1. Check Firestore rules console
2. Verify `auth.currentUser` exists
3. Ensure correct collection paths
4. Check user role in database

**Firestore Rules to Check:**
```javascript
// Student can read own assignments
match /assignments/{assignmentId} {
  allow read: if request.auth != null && 
    (request.auth.uid == resource.data.studentId ||
     request.auth.uid in resource.data.assignedTo);
}

// Teacher can read class assignments
match /assignments/{assignmentId} {
  allow read: if request.auth != null && 
    request.auth.uid == resource.data.teacherId;
}
```

---

### Issue: Mobile Menu Not Closing

**Symptoms:** Menu stays open after navigation

**Causes:**
1. `closeMobileMenu()` not called
2. State not reset properly

**Solutions:**
1. Add `(click)="closeMobileMenu()"` to all menu links
2. Verify `isMobileMenuOpen = false` is set
3. Check overlay click handler

**HTML Check:**
```html
<!-- ✅ Correct -->
<a routerLink="/s/dashboard" 
   class="mobile-nav-item" 
   (click)="closeMobileMenu()">
  Dashboard
</a>
```

---

### Issue: Theme Not Persisting

**Symptoms:** Theme resets on page refresh

**Causes:**
1. Theme not saved to localStorage
2. Theme service not initializing

**Solutions:**
1. Check ThemeService saves preference
2. Verify `ngOnInit` loads saved theme
3. Test localStorage in browser DevTools

**Code Check:**
```typescript
// In ThemeService
setTheme(theme: 'light' | 'dark') {
  localStorage.setItem('theme', theme);
  document.body.classList.toggle('dark', theme === 'dark');
}

// On app init
ngOnInit() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  this.themeService.setTheme(savedTheme as any);
}
```

---

## Technical Architecture

### Services Overview

**Student Services:**
- `AssignmentService`: Assignment CRUD operations
- `SubmissionService`: Handle student submissions
- `StudentProgressService`: Analytics calculations
- `CalendarService`: Event transformation
- `ArchiveService`: Historical data management

**Teacher Services:**
- `ClassService`: Class management
- `GradebookService`: Grading operations
- `ReportService`: Analytics generation

**Shared Services:**
- `FirebaseAuthService`: Authentication
- `ThemeService`: Dark/light mode
- `NotificationService`: User notifications

### Component Structure

```
app/
├── features/
│   ├── student-dashboard/
│   │   ├── dashboard-home.component
│   │   ├── progress-analytics.component
│   │   ├── calendar.component
│   │   ├── assignment-archive.component
│   │   └── student-assignments.component
│   ├── classroom/
│   │   └── teacher-dashboard.component
│   └── reports/
│       └── teacher-reports-home.component
├── services/
│   ├── assignment.service
│   ├── student-progress.service
│   ├── calendar.service
│   └── archive.service
└── components/
    └── header/
        └── header.component (modern redesign)
```

### Data Flow

1. **User Authentication** → Firebase Auth
2. **Role Check** → User document in Firestore
3. **Route Guard** → Redirect to appropriate dashboard
4. **Data Fetch** → Real-time Firebase observables
5. **UI Update** → Angular change detection
6. **User Action** → Service call → Firebase write
7. **Real-time Sync** → All connected clients update

### Firebase Collections

```
users/
  {userId}/
    - role: 'student' | 'teacher'
    - profile data

classes/
  {classId}/
    - name, subject
    - teacherId
    - memberIds: [studentIds]

assignments/
  {assignmentId}/
    - title, description
    - dueAt: Timestamp
    - classId
    - teacherId
    - points

submissions/
  {submissionId}/
    - assignmentId
    - studentId
    - submittedAt: Timestamp
    - status: 'pending' | 'graded'
    - score
```

### Performance Optimizations

1. **Lazy Loading:** Routes loaded on demand
2. **Firebase Indexing:** Composite indexes for queries
3. **Change Detection:** OnPush strategy where possible
4. **Chart Caching:** Reuse chart instances
5. **Image Optimization:** Compressed Islamic patterns
6. **Code Splitting:** Separate student/teacher bundles

---

## Support Contacts

**Technical Issues:** support@nuraacademy.com  
**Bug Reports:** bugs@nuraacademy.com  
**Feature Requests:** features@nuraacademy.com

**Documentation:** https://docs.nuraacademy.com  
**Status Page:** https://status.nuraacademy.com

---

## Appendix: Keyboard Shortcuts

**Global:**
- `Ctrl/Cmd + K`: Search
- `Ctrl/Cmd + ,`: Settings
- `Alt + D`: Toggle dark mode

**Student Dashboard:**
- `G + D`: Go to Dashboard
- `G + A`: Go to Assignments
- `G + P`: Go to Progress
- `G + C`: Go to Calendar

**Teacher Dashboard:**
- `G + C`: Go to Classes
- `G + R`: Go to Reports
- `G + G`: Go to Gradebook

---

**End of Support Guide**

*Last Updated: February 11, 2026*
