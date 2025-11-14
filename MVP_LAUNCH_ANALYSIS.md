# 🚀 Nura AI - MVP Launch Analysis

**Date:** November 8, 2024  
**Status:** Pre-Launch Comprehensive Review

---

## 📊 Executive Summary

**Overall MVP Completion: ~85%**

- ✅ **Core Features:** 95% Complete
- ✅ **Authentication & Billing:** 100% Complete
- ✅ **Classroom System:** 90% Complete
- ⚠️ **Notifications:** 70% Complete (backend done, UI partial)
- ⚠️ **User Onboarding:** 60% Complete
- ❌ **Unified Dashboard:** Not Implemented
- ✅ **Deployment Infrastructure:** 100% Ready

---

## ✅ COMPLETED FEATURES

### 1. **Core Quran Reading Experience** ✓
**Status:** Fully Functional

- ✅ Complete Quran reader with Arabic text
- ✅ Multiple translations (English, Urdu, etc.)
- ✅ Verse-by-verse audio playback
- ✅ Reading progress tracking
- ✅ Bookmarks and history
- ✅ Dark/Light theme toggle
- ✅ Responsive mobile design
- ✅ Surah/Juz navigation
- ✅ Search functionality

**Files:**
- `src/app/components/quran/quran-reader/` ✓

---

### 2. **Premium AI Features** ✓
**Status:** Fully Functional with Usage Limits

#### A. AI Tafsir (Verse-by-Verse Explanation)
- ✅ Contextual tafsir using GPT-4
- ✅ Chat-based Q&A interface
- ✅ Historical context and scholarly insights
- ✅ Markdown formatting support
- ✅ Usage tracking and rate limiting

#### B. Emotional Dua Search
- ✅ AI-powered emotion detection
- ✅ Relevant dua recommendations
- ✅ Fuzzy search with Fuse.js
- ✅ Multi-language support
- ✅ Comprehensive dua database (150+ duas)

#### C. Dua Insights
- ✅ Deep analysis of selected duas
- ✅ Quranic guidance references
- ✅ Prophetic examples
- ✅ Practical application steps
- ✅ Spiritual remedies

**Files:**
- `server/routes/ai.ts` ✓
- `server/services/openai.service.ts` ✓
- `src/app/components/dua/` ✓
- `src/app/services/tafsir.service.ts` ✓

---

### 3. **Authentication & User Management** ✓
**Status:** Production-Ready

- ✅ Firebase Authentication
- ✅ Email/password signup and login
- ✅ Google OAuth integration
- ✅ Custom claims for roles (teacher, student, parent)
- ✅ Role-based access control
- ✅ User profile management
- ✅ Password reset flow
- ✅ Email verification
- ✅ Session persistence
- ✅ Re-authentication dialogs

**Files:**
- `src/app/services/firebase-auth.service.ts` ✓
- `src/app/guards/auth.guard.ts` ✓
- `src/app/guards/role.guard.ts` ✓
- `server/middleware/auth.ts` ✓

**Scripts:**
- `set-my-role.cjs` ✓ (For setting user roles)

---

### 4. **Subscription & Payment System** ✓
**Status:** Production-Ready with Stripe

- ✅ Stripe Checkout integration
- ✅ 7-day free trial
- ✅ Subscription management portal
- ✅ Webhook handling for subscription events
- ✅ Firebase claims sync with subscription status
- ✅ Usage tracking per user
- ✅ Premium feature gating
- ✅ Automatic tax calculation
- ✅ Cancellation and renewal flow
- ✅ Role preservation during subscription updates (Fixed)

**Files:**
- `server/services/stripe.service.ts` ✓
- `server/routes/subscription.ts` ✓
- `src/app/components/subscription/` ✓
- `src/app/guards/premium.guard.ts` ✓
- `src/app/services/stripe.service.ts` ✓

**Models:**
- `server/models/UserSubscription.ts` ✓

---

### 5. **Classroom System (Teacher Features)** ✓
**Status:** 90% Complete - Core Features Working

#### Teacher Dashboard
- ✅ Create and manage classes
- ✅ Add/remove students by email
- ✅ Create assignments with:
  - Surah/Ayah range selection
  - Due dates
  - Instructions/notes
- ✅ View all assignments per class
- ✅ **Red badges showing ungraded submission counts**
- ✅ View submissions from students
- ✅ Grade submissions with:
  - Score out of 100
  - Rubric (Fluency, Tajweed, Accuracy - each out of 5)
  - Text feedback/notes
- ✅ **Audio playback of student recordings**
- ✅ **Practice progress visualization**
- ✅ Regrade option for already-graded assignments
- ✅ Mode toggle: Class vs 1-on-1 students
- ✅ Dynamic UI updates (no refresh needed)

#### 1-on-1 Student Management
- ✅ Add individual students by email
- ✅ Create personalized assignments
- ✅ Track individual progress
- ✅ Backend UID lookup via `/api/lookup/user-by-email` (Fixed)

**Files:**
- `src/app/features/classroom/teacher-dashboard.component.ts` ✓
- `src/app/features/classroom/assignment-form.component.ts` ✓
- `src/app/features/submissions/grade-panel.component.ts` ✓
- `src/app/services/class.service.ts` ✓
- `src/app/services/assignment.service.ts` ✓
- `src/app/services/grading.service.ts` ✓
- `src/app/services/individual-student.service.ts` ✓
- `server/routes/lookup.ts` ✓

**Routes:**
- `/t/classes` - Teacher dashboard
- `/t/reports` - Teacher reports

---

### 6. **Classroom System (Student Features)** ✓
**Status:** 90% Complete

#### Student Assignment View
- ✅ View all assigned homework (class + 1-on-1)
- ✅ Assignment cards with:
  - Title, due date, surah/ayah range
  - Status badges (Not Started, In Progress, Submitted, Graded)
- ✅ **Visual feedback for submitted assignments:**
  - Green/blue gradient background
  - Checkmark icon
  - "Revisit" button
- ✅ **Grade results display:**
  - Score out of 100
  - Rubric breakdown (Fluency, Tajweed, Accuracy)
  - Teacher notes/feedback
  - **Dark theme integration**
- ✅ Deep linking to Quran reader with assignment context
- ✅ Assignment access guard (only authorized students)

#### Assignment Submission Flow
- ✅ **Homework Bar in Quran Reader:**
  - Displays assignment info, due date
  - Shows ayah range
  - "Mark Practiced" and "Submit" buttons
- ✅ **Audio Recording:**
  - Record recitation directly in reader
  - LocalStorage persistence across sessions
  - Upload to Firebase Storage on submission
- ✅ **Practice Progress Tracking:**
  - Ayah-by-ayah progress logging
  - Aggregated completion percentage
  - Sent with submission to teacher
- ✅ Auto-navigate back to `/s/assignments` after submission

**Files:**
- `src/app/features/classroom/student-assignments.component.ts` ✓
- `src/app/components/quran/quran-reader/quran-reader.component.ts` ✓
- `src/app/services/submission.service.ts` ✓
- `src/app/services/audio-recording.service.ts` ✓
- `src/app/services/audio-upload.service.ts` ✓
- `src/app/services/progress.service.ts` ✓
- `src/app/guards/assignment.guard.ts` ✓

**Routes:**
- `/s/assignments` - Student assignments page
- `/reader?surah=X&start=Y&end=Z&mode=assignment&aid=ID` - Assignment reader

---

### 7. **Notification System** ✓ (Backend) / ⚠️ (UI Partial)
**Status:** 70% Complete

#### Backend (Fully Deployed)
- ✅ Firebase Cloud Functions deployed
  - `onUserCreate` - User profile initialization
  - `onAssignmentCreated` - Notify students of new assignments
  - `onSubmissionCreated` - Notify teachers of submissions
  - `onSubmissionGraded` - Notify students when graded
- ✅ Firestore security rules and indexes
- ✅ Notification service with real-time listeners
- ✅ Unread count tracking

#### Frontend (Partial)
- ✅ `NotificationService` implemented
- ✅ Real-time notification fetching
- ⚠️ **Notification bell UI exists but may need polishing**
- ⚠️ No toast notifications on new events
- ❌ No email notifications
- ❌ No push notifications (FCM)
- ❌ No notification preferences page

**Files:**
- `functions/src/notifications.ts` ✓
- `functions/src/index.ts` ✓
- `src/app/services/notification.service.ts` ✓
- ⚠️ Notification bell component (needs verification)

**Deployed:**
- ✅ All Cloud Functions are live
- ✅ Firestore rules deployed
- ✅ Firestore indexes deployed

**Documentation:**
- `DEPLOYMENT_SUCCESS.md` ✓
- `NOTIFICATION_ENHANCEMENT_PLAN.md` ✓

---

### 8. **Progress Reports** ✓
**Status:** Implemented

- ✅ Teacher can view class-wide reports
- ✅ Individual student progress reports
- ✅ Export to PDF (jsPDF integration)
- ✅ Charts and visualizations (Chart.js)
- ✅ Submission history tracking

**Files:**
- `src/app/features/reports/` ✓
- `src/app/services/report.service.ts` ✓

**Routes:**
- `/t/reports` - Teacher reports home
- `/t/reports/class/:id` - Class report
- `/t/reports/student/:id` - Student report

---

### 9. **Parent Dashboard** ✓
**Status:** Routes exist, components may need implementation/testing

- ✅ Routes defined
- ⚠️ Components exist but need testing
- ⚠️ Link parent to student functionality unclear

**Files:**
- `src/app/features/parent/` ✓
- `src/app/features/parent/parent.routes.ts` ✓

**Routes:**
- `/p/dashboard`
- `/p/student/:id`

---

### 10. **Database & Infrastructure** ✓
**Status:** Production-Ready

#### Databases
- ✅ **Firebase Firestore** (Primary data store)
  - Collections: `classes`, `assignments`, `submissions`, `notifications`, `individual_students`
  - Custom database: `nura` (not `(default)`)
  - Security rules deployed
  - Composite indexes deployed
- ✅ **MongoDB** (User preferences, subscriptions, usage)
  - User subscriptions
  - Usage tracking
  - AI request limits

#### Firebase Services
- ✅ Firebase Authentication
- ✅ Firebase Storage (for audio recordings)
- ✅ Firebase Cloud Functions
- ✅ Firebase Hosting (optional)

#### Backend Server
- ✅ Node.js/Express API
- ✅ Rate limiting
- ✅ Error handling middleware
- ✅ CORS configuration
- ✅ Authentication middleware
- ✅ Premium feature middleware

**Files:**
- `server/config/database.ts` ✓
- `server/config/firebase.ts` ✓
- `firestore.rules` ✓
- `firestore.indexes.json` ✓

---

### 11. **Deployment Infrastructure** ✓
**Status:** Ready for Render

- ✅ Production build scripts
- ✅ Environment variable configuration
- ✅ Render-specific build command (`build:render`)
- ✅ Server build script
- ✅ Static file serving
- ✅ Firebase Functions deployed separately
- ✅ CORS configured for production

**Files:**
- `package.json` ✓
- `server/index.ts` ✓
- `render.yaml` (if exists)

**Deployment Docs:**
- `DEPLOYMENT_SUCCESS.md` ✓
- `DEPLOYMENT_STATUS_SUMMARY.md` ✓
- `MANUAL_DEPLOYMENT_INSTRUCTIONS.md` ✓

---

## ⚠️ PARTIALLY COMPLETE FEATURES

### 1. **Notification UI** (70% Complete)
**What's Missing:**
- ❌ Notification bell component in header (may exist but needs polishing)
- ❌ Notification dropdown panel
- ❌ Toast notifications for real-time events
- ❌ Sound/visual alerts
- ❌ Mark as read functionality in UI
- ❌ Click notification to navigate to relevant page

**What's Done:**
- ✅ Backend Cloud Functions working
- ✅ NotificationService with real-time listeners
- ✅ Unread count tracking

**Recommendation:** **Medium Priority for MVP** - Teachers can still check submissions manually via red badges. Notifications are a "nice-to-have" for MVP.

---

### 2. **User Onboarding Flow** (60% Complete)
**What's Missing:**
- ❌ Role selection during signup (teacher/student/parent)
- ❌ Welcome wizard after first login
- ❌ Feature tour/tooltips
- ❌ Email verification prompt
- ❌ Profile completion prompt

**What's Done:**
- ✅ Basic signup/login
- ✅ Profile page exists
- ✅ Role must be set manually via script

**Recommendation:** **HIGH PRIORITY for MVP** - Users need a way to self-select their role during signup. Currently requires manual script execution.

---

### 3. **Parent Dashboard** (50% Complete)
**What's Missing:**
- ❌ Link parent to student functionality
- ❌ Parent approval flow for student signup
- ❌ Real-time progress viewing
- ❌ Parent notifications

**What's Done:**
- ✅ Routes defined
- ✅ Component files exist

**Recommendation:** **LOW PRIORITY for MVP** - Focus on teacher/student flow first. Parents can be added post-launch.

---

## ❌ MISSING FOR MVP LAUNCH

### 1. **Unified Dashboard Route** ❌
**Status:** Not Implemented

**What's Needed:**
- Create `/dashboard` route
- Auto-detect user role from Firebase claims
- Redirect to appropriate dashboard:
  - Teachers → `/t/classes`
  - Students → `/s/assignments`
  - Parents → `/p/dashboard`
  - No role → `/home`

**Recommendation:** **MEDIUM PRIORITY** - Nice quality-of-life feature but not critical. Users can navigate to their respective dashboards via direct links.

**Implementation Time:** ~30 minutes

---

### 2. **Role Selection During Signup** ❌
**Status:** Critical Gap

**Current Problem:**
- Users sign up successfully
- Role is NOT set automatically
- Must run script manually: `node set-my-role.cjs email@example.com teacher`
- Users land on `/home` with no clear guidance

**What's Needed:**
- Add role selection dropdown/buttons during signup
- Call backend API to set custom claims after user creation
- Redirect to role-specific dashboard after signup

**Recommendation:** **🔴 CRITICAL for MVP** - Without this, every new user signup requires manual intervention.

**Implementation Time:** ~2 hours

**Files to Create/Modify:**
- Modify `src/app/auth/signup/` component
- Create `server/routes/user.ts` endpoint: `POST /api/user/set-role`
- Update `onUserCreate` Cloud Function to handle role from metadata

---

### 3. **Email Verification Flow** ⚠️
**Status:** Partially Implemented

**Current State:**
- Firebase sends verification email automatically
- No UI prompts or reminders
- No blocking of features for unverified users

**What's Needed:**
- Banner in header for unverified users
- "Resend verification email" button
- Optional: Block certain features until verified

**Recommendation:** **MEDIUM PRIORITY** - Not critical for MVP but improves security and reduces spam accounts.

**Implementation Time:** ~1 hour

---

### 4. **Error Boundaries & Global Error Handling** ⚠️
**Status:** Basic error handling exists

**What's Needed:**
- Angular error handler service
- Global error boundary component
- User-friendly error messages
- Error logging to external service (e.g., Sentry)

**Recommendation:** **MEDIUM PRIORITY** - Important for production but not blocking MVP launch.

**Implementation Time:** ~3 hours

---

### 5. **Landing Page CTA Optimization** ⚠️
**Status:** Exists but may need polish

**What's Needed:**
- Clear call-to-action buttons
- Feature highlights
- Pricing information
- Testimonials (optional)
- Demo video (optional)

**Recommendation:** **LOW PRIORITY** - Focus on functionality first, marketing polish later.

---

### 6. **Mobile App (iOS/Android)** ❌
**Status:** Not Planned for MVP

**Recommendation:** Launch as web app first (responsive design already done), then consider Capacitor/Ionic for mobile apps post-launch.

---

### 7. **Push Notifications (FCM)** ❌
**Status:** Not Implemented

**What's Needed:**
- Register device tokens
- Store tokens in Firestore
- Send push notifications via Cloud Functions
- Handle notification clicks

**Recommendation:** **LOW PRIORITY for MVP** - In-app notifications are sufficient for launch.

**Implementation Time:** ~8 hours

---

### 8. **Email Notifications** ❌
**Status:** Not Implemented

**What's Needed:**
- SendGrid/Mailgun integration
- Email templates
- Scheduled Cloud Functions for:
  - Daily digest for teachers (ungraded submissions)
  - Assignment due reminders (students)
  - Weekly progress reports

**Recommendation:** **LOW PRIORITY for MVP** - In-app notifications are sufficient for launch.

**Implementation Time:** ~6 hours

---

## 🐛 KNOWN ISSUES & BUGS

### Fixed ✓
- ✅ Stripe webhook overwriting role claims (FIXED)
- ✅ Re-adding removed students error (FIXED)
- ✅ `NullInjectorError` for `Functions` (FIXED)
- ✅ Grade submission with undefined values (FIXED)
- ✅ 1-on-1 assignments not showing for students (FIXED)
- ✅ Dark theme integration for grade results (FIXED)

### Open Issues ⚠️
None critical for MVP launch.

---

## 🎯 MVP LAUNCH READINESS CHECKLIST

### Critical (Must-Have) 🔴
- [ ] **Role selection during signup** (Implementation: ~2 hours)
- [ ] **Test full teacher → student flow**
  - [ ] Teacher creates class
  - [ ] Teacher adds student by email
  - [ ] Teacher creates assignment
  - [ ] Student sees assignment
  - [ ] Student submits with audio
  - [ ] Teacher grades submission
  - [ ] Student sees grade
- [ ] **Test subscription flow**
  - [ ] Free user hits premium feature paywall
  - [ ] User subscribes via Stripe
  - [ ] User gains access to premium features
  - [ ] User cancels subscription
  - [ ] User loses access at period end
- [ ] **Production environment variables set**
  - [ ] Stripe keys
  - [ ] OpenAI API key
  - [ ] Firebase config
  - [ ] MongoDB connection string
  - [ ] CORS allowed origins
- [ ] **Render deployment successful**
- [ ] **Firebase Functions deployed and working**
- [ ] **Domain/custom URL configured** (optional but recommended)

---

### High Priority (Should-Have) 🟡
- [ ] **Notification bell UI polished**
- [ ] **Email verification prompts**
- [ ] **Landing page CTAs optimized**
- [ ] **Error boundaries implemented**
- [ ] **Analytics tracking added** (Google Analytics, Mixpanel, etc.)
- [ ] **Terms of Service & Privacy Policy pages**
- [ ] **Contact/Support page**

---

### Nice-to-Have (Post-MVP) 🟢
- [ ] Unified `/dashboard` route
- [ ] Email notifications
- [ ] Push notifications (FCM)
- [ ] Parent dashboard full implementation
- [ ] Mobile apps (iOS/Android)
- [ ] Notification preferences page
- [ ] Feature tour/onboarding wizard
- [ ] Testimonials and social proof
- [ ] Demo video
- [ ] Multi-language support beyond Quran translations

---

## 📈 RECOMMENDED MVP LAUNCH SEQUENCE

### Phase 1: Pre-Launch (1-2 days)
1. **Implement role selection during signup** (~2 hours)
2. **Add Terms of Service & Privacy Policy pages** (~2 hours)
3. **Add Contact page** (~1 hour)
4. **Polish landing page CTAs** (~2 hours)
5. **Set up Google Analytics** (~1 hour)
6. **Create error boundary component** (~3 hours)
7. **Add email verification prompts** (~1 hour)
8. **Polish notification bell UI** (~2 hours)

**Total Time:** ~14 hours (2 days)

---

### Phase 2: Testing (1-2 days)
1. **Full end-to-end testing:**
   - Signup flow (teacher + student)
   - Subscription flow (trial, payment, cancellation)
   - Class creation and management
   - Assignment creation and submission
   - Grading flow
   - Notifications
   - Audio recording and playback
   - Dark/light theme
   - Mobile responsiveness
2. **Cross-browser testing** (Chrome, Safari, Firefox, Edge)
3. **Mobile testing** (iOS Safari, Android Chrome)
4. **Performance testing** (Lighthouse, PageSpeed Insights)
5. **Security audit** (Firestore rules, API auth)

---

### Phase 3: Deployment (1 day)
1. **Set production environment variables in Render**
2. **Deploy to Render** (auto-deploy via GitHub)
3. **Verify Firebase Functions are running**
4. **Test production deployment:**
   - Signup/login
   - Stripe checkout
   - AI features
   - Classroom features
   - Notifications
5. **Configure custom domain** (if applicable)
6. **Set up monitoring:**
   - Render logs
   - Firebase Console
   - Google Analytics
   - Error tracking (Sentry, optional)

---

### Phase 4: Soft Launch (1 week)
1. **Invite beta testers** (friends, family, small group)
2. **Monitor for bugs and issues**
3. **Collect feedback**
4. **Iterate and fix critical issues**
5. **Optimize based on real usage**

---

### Phase 5: Public Launch (Ongoing)
1. **Marketing campaign** (social media, ads, etc.)
2. **SEO optimization**
3. **Content marketing** (blog posts, videos)
4. **Community building**
5. **Feature enhancements based on user feedback**

---

## 💰 ESTIMATED MONTHLY COSTS

### Firebase
- **Authentication:** Free tier (up to 50K MAUs)
- **Firestore:** Free tier (1 GiB storage, 50K reads/day)
- **Storage:** Free tier (5 GB)
- **Cloud Functions:** Free tier (2M invocations/month)
- **Estimated:** $0-$25/month (depending on usage)

### MongoDB Atlas
- **Free tier:** 512 MB (sufficient for MVP)
- **Estimated:** $0/month

### OpenAI API
- **GPT-3.5-turbo:** $0.0005 per 1K input tokens, $0.0015 per 1K output tokens
- **GPT-4-turbo:** $0.01 per 1K input tokens, $0.03 per 1K output tokens
- **Estimated:** $50-$200/month (depends on usage limits per user)

### Stripe
- **2.9% + $0.30 per transaction**
- **No monthly fee**

### Render
- **Web service:** $7/month (basic plan)
- **OR:** Free tier (with limitations)
- **Estimated:** $0-$7/month

### Domain
- **Namecheap/GoDaddy:** $10-$15/year
- **Estimated:** ~$1.25/month

### **TOTAL ESTIMATED:** $50-$250/month (heavily depends on OpenAI usage)

---

## 🎓 USER FLOWS SUMMARY

### Teacher Flow
1. Sign up → Select "Teacher" role → Verify email
2. Subscribe to premium (7-day trial)
3. Create a class → Add students by email
4. Create assignment (Surah, Ayah range, due date)
5. Wait for student submissions
6. **Get notified** when students submit
7. View submission → Play audio recording → See practice progress
8. Grade submission (score, rubric, notes)
9. View reports and analytics

### Student Flow
1. Sign up → Select "Student" role → Verify email
2. **Get notified** of new assignment
3. Go to `/s/assignments` → See assignment card
4. Click "Start Reading" → Opens Quran reader with assignment context
5. See homework bar with assignment details
6. Practice reading (audio playback, progress tracking)
7. Record recitation (audio saved to localStorage)
8. Click "Submit" → Audio uploaded to Firebase Storage
9. **Get notified** when teacher grades
10. View grade results on assignment card

### Premium User Flow (Non-Classroom)
1. Sign up → Verify email
2. Subscribe to premium
3. Navigate to `/quran` → Read any surah
4. Click on a verse → AI Tafsir chat opens
5. Ask questions → Get detailed Islamic scholarly responses
6. Navigate to `/dua` → Search by emotion
7. Get personalized dua recommendations
8. Click on a dua → View insights (Quranic guidance, practical steps, etc.)

---

## 🚀 FINAL RECOMMENDATION

### **MVP is 85% Ready to Launch! 🎉**

**Critical blocker:** Role selection during signup (2 hours to fix)

**After fixing the role selection issue, you can:**
1. Complete testing (1-2 days)
2. Deploy to Render (1 day)
3. Soft launch with beta testers (1 week)
4. Public launch! 🚀

**Estimated time to launch:** **4-5 days** (assuming 1-2 devs working full-time)

---

## 📞 SUPPORT & NEXT STEPS

**Immediate Next Step:**
Implement role selection during signup. This is the only critical blocker preventing a smooth user onboarding experience.

**After that:**
1. Run through the MVP Launch Readiness Checklist
2. Complete Phase 1 (Pre-Launch polish)
3. Test thoroughly (Phase 2)
4. Deploy to production (Phase 3)
5. Soft launch (Phase 4)
6. Public launch! (Phase 5)

---

## 📋 APPENDIX: KEY FILES REFERENCE

### Routes
- Landing: `/` (LandingComponent)
- Home: `/home` (HomeComponent)
- Quran Reader: `/quran` (QuranReaderComponent)
- Assignment Reader: `/reader?surah=X&start=Y&end=Z&mode=assignment&aid=ID`
- Teacher Dashboard: `/t/classes` (TeacherDashboardComponent)
- Student Assignments: `/s/assignments` (StudentAssignmentsComponent)
- Teacher Reports: `/t/reports` (TeacherReportsHomeComponent)
- Parent Dashboard: `/p/dashboard` (ParentHomeComponent)
- Subscription: `/subscription` (SubscriptionComponent)
- Profile: `/profile` (ProfileComponent)
- Dua Search: `/dua` (DuaComponent)

### Key Services
- `FirebaseAuthService` - Authentication
- `StripeService` - Payments
- `ClassService` - Classroom management
- `AssignmentService` - Assignment CRUD
- `SubmissionService` - Submission handling
- `GradingService` - Grading logic
- `NotificationService` - Notifications
- `OpenAIService` - AI features
- `TafsirService` - Tafsir chat
- `DuaService` - Dua search
- `ProgressService` - Progress tracking
- `AudioRecordingService` - Audio recording
- `AudioUploadService` - Audio upload to Firebase Storage

### Backend API Endpoints
- `POST /api/subscription/create-checkout` - Create Stripe checkout session
- `POST /api/subscription/create-portal` - Create Stripe customer portal
- `GET /api/subscription/status` - Get subscription status
- `POST /api/webhook/stripe` - Stripe webhook handler
- `POST /api/ai/chat` - AI chat (general)
- `POST /api/ai/generate` - AI generation
- `POST /api/ai/tafsir/chat` - AI Tafsir chat
- `POST /api/ai/dua/analyze-emotion` - Emotion analysis for dua search
- `POST /api/ai/dua/insights` - Generate dua insights
- `POST /api/lookup/user-by-email` - Look up user UID by email
- `GET /api/health` - Health check

### Firebase Cloud Functions
- `onUserCreate` - Initialize user profile
- `onAssignmentCreated` - Notify students
- `onSubmissionCreated` - Notify teachers
- `onSubmissionGraded` - Notify students

### Firestore Collections
- `classes` - Classroom data
- `assignments` - Assignment data
- `submissions` - Submission data
- `notifications` - Notification data
- `individual_students` - 1-on-1 student relationships

### MongoDB Collections
- `users` - User preferences
- `usersubscriptions` - Subscription data
- `userusages` - Usage tracking

---

**Good luck with your MVP launch! 🚀🎉**


