# Public Access Testing Checklist
## Comprehensive Testing Guide for Public Route Implementation

**Last Updated:** January 4, 2026  
**Testing Phase:** Pre-Implementation  
**Tester:** ________________

---

## 🎯 Testing Phases

- [ ] **Phase 1:** Unit Tests (Guards & Services)
- [ ] **Phase 2:** Integration Tests (Components & Routes)
- [ ] **Phase 3:** E2E Tests (User Journeys)
- [ ] **Phase 4:** Manual QA (Full App)
- [ ] **Phase 5:** Performance & SEO Tests
- [ ] **Phase 6:** Production Smoke Tests

---

## Phase 1: Unit Tests

### Guard Tests

#### ✅ `optionalAuthGuard`
- [ ] Allows anonymous users to access routes
- [ ] Allows authenticated users to access routes
- [ ] Does not redirect in any case
- [ ] Sets correct route data flags

#### ✅ `softAuthGuard`
- [ ] Always returns `true`
- [ ] Does not block navigation
- [ ] Allows components to handle auth logic

#### ✅ Updated `premiumGuard`
- [ ] Redirects anonymous users to `/auth/login`
- [ ] Includes `returnUrl` in query params
- [ ] Redirects non-premium users to `/subscription`
- [ ] Allows premium users to proceed
- [ ] Includes feature name in redirect

### Service Tests

#### ✅ `AnonymousUserService`
- [ ] Generates unique device IDs
- [ ] Saves preferences to localStorage
- [ ] Retrieves preferences correctly
- [ ] Tracks session history (max 50 entries)
- [ ] Migrates data on user signup
- [ ] Clears anonymous data after migration
- [ ] Prompts sign up with correct messaging

#### ✅ `SeoService`
- [ ] Sets title correctly
- [ ] Updates meta description
- [ ] Updates Open Graph tags
- [ ] Updates Twitter Card tags
- [ ] Creates/updates canonical URLs
- [ ] Adds structured data (JSON-LD)
- [ ] Handles surah-specific SEO

---

## Phase 2: Integration Tests

### Route Access Tests

#### ✅ Public Routes (No Auth Required)
- [ ] `/` - Landing page loads
- [ ] `/quran` - Quran reader loads
- [ ] `/dua` - Dua collection loads
- [ ] `/about` - About page loads
- [ ] `/contact` - Contact page loads
- [ ] All load without authentication
- [ ] No redirects to login
- [ ] Content fully visible

#### ✅ Protected Routes (Auth Required)
- [ ] `/profile` - Redirects to login if anonymous
- [ ] `/subscription` - Redirects to login if anonymous
- [ ] `/reader?aid=X` - Redirects to login if anonymous

#### ✅ Premium Routes (Auth + Subscription Required)
- [ ] `/learn` - Redirects anonymous to login
- [ ] `/learn` - Redirects non-premium to subscription
- [ ] `/learn` - Loads for premium users

#### ✅ Role-Based Routes
- [ ] `/t/classes` - Teacher only
- [ ] `/t/gradebook` - Teacher only
- [ ] `/s/assignments` - Student only
- [ ] `/p/home` - Parent only
- [ ] Correct role redirects work

### Component Integration Tests

#### ✅ Quran Reader Component
```
Test: Anonymous User Experience
```
- [ ] Component loads without auth
- [ ] Surahs list displays
- [ ] Verses render correctly
- [ ] Audio player works
- [ ] Translation selector works
- [ ] Mushaf view works
- [ ] Font size controls work
- [ ] Theme toggle works
- [ ] Bookmark button shows sign-in prompt
- [ ] History not tracked for anonymous
- [ ] Preferences saved to localStorage
- [ ] No console errors

```
Test: Authenticated User Experience
```
- [ ] All anonymous features work
- [ ] Bookmarks save to Firestore
- [ ] History tracked
- [ ] Progress synced
- [ ] Preferences synced across devices

```
Test: Navigation & Routing
```
- [ ] Direct URL access works: `/quran`
- [ ] Surah parameter works: `/quran?surah=2`
- [ ] Browser back/forward works
- [ ] Bookmarked URLs work

#### ✅ Dua Component
```
Test: Public Access (Anonymous)
```
- [ ] Component loads without auth
- [ ] All duas visible
- [ ] Arabic text displays correctly
- [ ] Translations display
- [ ] Virtues/occasions display
- [ ] Basic search works
- [ ] Category filtering works
- [ ] "Premium" badges visible on locked features
- [ ] Emotional Search button disabled or shows prompt
- [ ] Dua Insights button disabled or shows prompt

```
Test: Premium Features Gating
```
- [ ] Anonymous user: Premium features show upgrade prompt
- [ ] Authenticated non-premium: Show upgrade modal
- [ ] Authenticated premium: All features work
- [ ] Premium modal has correct messaging
- [ ] "Upgrade" button navigates to `/subscription`

```
Test: Premium User Experience
```
- [ ] Emotional search works fully
- [ ] Dua insights generate correctly
- [ ] AI features respond
- [ ] Usage tracking works

#### ✅ Header/Navigation Component
```
Test: Anonymous User Nav
```
- [ ] Logo visible and links to `/`
- [ ] "Quran Reader" link visible
- [ ] "Duas" link visible
- [ ] "About" link visible
- [ ] "Sign In" button visible
- [ ] "Get Started" button visible
- [ ] No "Home" link (or shows as public)
- [ ] No role-specific links
- [ ] No profile menu
- [ ] Mobile menu works

```
Test: Authenticated User Nav
```
- [ ] Logo visible
- [ ] "Home" link visible
- [ ] "Quran Reader" link visible
- [ ] "Duas" link visible
- [ ] "AI Tafsir" link visible (with ⭐ if not premium)
- [ ] Role-specific links visible (teacher/student)
- [ ] "Upgrade" button visible (if not premium)
- [ ] Profile menu visible
- [ ] "Sign Out" option works
- [ ] Mobile menu has all options

```
Test: Premium User Nav
```
- [ ] No "Upgrade" button
- [ ] No ⭐ badges on premium features
- [ ] All nav items accessible

---

## Phase 3: E2E User Journey Tests

### Journey 1: Anonymous Exploration
```
Scenario: First-time visitor explores app
```
1. [ ] Land on homepage (/)
2. [ ] Click "Quran Reader" from landing page
3. [ ] Browse different surahs
4. [ ] Play audio for a verse
5. [ ] Change translation
6. [ ] Try to bookmark (see prompt)
7. [ ] Click "Sign In" from prompt
8. [ ] See login page with returnUrl
9. [ ] Click back, continue browsing
10. [ ] Navigate to "Duas"
11. [ ] Browse duas collection
12. [ ] Try emotional search (see premium prompt)
13. [ ] Navigate to "About"
14. [ ] Navigate to "Contact"
15. [ ] All works without errors

**Expected Result:** Smooth browsing, clear upgrade prompts, no blocking

### Journey 2: Anonymous to Sign Up
```
Scenario: User decides to create account
```
1. [ ] Browse as anonymous user
2. [ ] Adjust preferences (theme, font size)
3. [ ] View multiple surahs (session history tracked)
4. [ ] Click "Get Started" button
5. [ ] Fill signup form
6. [ ] Submit signup
7. [ ] Email verification sent
8. [ ] Verify email
9. [ ] Redirected back to origin page
10. [ ] Preferences migrated (theme still applied)
11. [ ] Can now bookmark
12. [ ] History tracked to Firestore
13. [ ] Anonymous data cleared from localStorage

**Expected Result:** Seamless conversion, data preserved

### Journey 3: Sign In and Premium Upgrade
```
Scenario: Returning user upgrades to premium
```
1. [ ] Visit any public page
2. [ ] Click "Sign In"
3. [ ] Enter credentials
4. [ ] Successfully logged in
5. [ ] Redirected to returnUrl or /home
6. [ ] See "Upgrade" button in header
7. [ ] Navigate to AI Tafsir (/learn)
8. [ ] Redirected to /subscription
9. [ ] See subscription plans
10. [ ] Click "Subscribe"
11. [ ] Complete Stripe checkout (test mode)
12. [ ] Redirected back to app
13. [ ] Premium status detected
14. [ ] Navigate to /learn
15. [ ] AI Tafsir loads successfully
16. [ ] No more "Upgrade" prompts

**Expected Result:** Clear upgrade path, immediate access

### Journey 4: Teacher Workflow
```
Scenario: Teacher manages classroom
```
1. [ ] Sign in as teacher account
2. [ ] See "Classes" in navigation
3. [ ] Navigate to /t/classes
4. [ ] Create new class
5. [ ] Add students
6. [ ] Create assignment
7. [ ] Assignment visible to students
8. [ ] Navigate to /t/gradebook
9. [ ] See all student submissions
10. [ ] Grade submissions
11. [ ] Navigate to /t/reports
12. [ ] View class analytics
13. [ ] All features work correctly

**Expected Result:** Teacher features fully functional

### Journey 5: Student Workflow
```
Scenario: Student completes assignment
```
1. [ ] Sign in as student account
2. [ ] See "Assignments" in navigation
3. [ ] Navigate to /s/assignments
4. [ ] View pending assignments
5. [ ] Click on assignment
6. [ ] Redirected to /reader?aid=X
7. [ ] Assignment mode active
8. [ ] Homework bar visible
9. [ ] Complete reading
10. [ ] Mark as practiced
11. [ ] Record audio submission
12. [ ] Submit assignment
13. [ ] See confirmation
14. [ ] Assignment status updated

**Expected Result:** Student workflow smooth

### Journey 6: SEO Bot Crawl
```
Scenario: Googlebot crawls public pages
```
1. [ ] Set user agent to Googlebot
2. [ ] Access `/quran`
3. [ ] Page loads (no redirect)
4. [ ] Content visible in HTML
5. [ ] Meta tags present
6. [ ] Access `/quran?surah=1`
7. [ ] Surah content visible
8. [ ] Access `/dua`
9. [ ] Duas visible
10. [ ] Access `/robots.txt`
11. [ ] Correct rules present
12. [ ] Access `/sitemap.xml`
13. [ ] All public URLs listed
14. [ ] Try accessing /t/classes (should be blocked in robots.txt)

**Expected Result:** Public pages fully crawlable

---

## Phase 4: Manual QA - Full App Testing

### Device Matrix

Test on these devices/browsers:

#### Desktop
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Safari (macOS)
- [ ] Edge (Windows)

#### Mobile
- [ ] Chrome (Android)
- [ ] Safari (iOS)
- [ ] Samsung Internet (Android)

#### Tablet
- [ ] Safari (iPad)
- [ ] Chrome (Android tablet)

### Feature Checklist

For EACH device combination, test:

#### ✅ Public Quran Reader
- [ ] Page loads
- [ ] No authentication required
- [ ] Surahs list loads
- [ ] Verses display correctly
- [ ] Arabic font renders correctly
- [ ] Translation loads
- [ ] Audio plays
- [ ] Audio controls work (play, pause, seek)
- [ ] Mushaf view works
- [ ] Page navigation works (in Mushaf)
- [ ] Font size controls work
- [ ] Theme toggle works
- [ ] Search works (if public)
- [ ] Bookmark button shows prompt
- [ ] Sign-in prompt appears correctly
- [ ] "Maybe Later" dismisses prompt
- [ ] "Sign In" navigates to login
- [ ] Preferences saved in localStorage
- [ ] Page refresh preserves preferences
- [ ] Browser back/forward works
- [ ] No console errors
- [ ] No visual glitches

#### ✅ Public Dua Collection
- [ ] Page loads without auth
- [ ] All duas visible
- [ ] Arabic renders correctly
- [ ] Translations display
- [ ] Search/filter works
- [ ] Category tabs work
- [ ] Premium badge visible on locked features
- [ ] Clicking emotional search shows prompt
- [ ] Clicking insights shows prompt
- [ ] Premium prompt modal displays correctly
- [ ] "Upgrade" button in modal works
- [ ] "Maybe Later" dismisses modal
- [ ] No console errors

#### ✅ Authentication Flow
- [ ] Sign in form loads
- [ ] Can type in email/password
- [ ] Form validation works
- [ ] Submit button enables/disables correctly
- [ ] Sign in succeeds
- [ ] Redirected to returnUrl or /home
- [ ] Sign up form loads
- [ ] Can fill all fields
- [ ] Password strength indicator works
- [ ] Email verification sent
- [ ] Verification link works
- [ ] Sign out works
- [ ] Session persists on refresh (if "Remember Me")

#### ✅ Premium Features
- [ ] /learn redirects correctly based on auth state
- [ ] Subscription page loads
- [ ] Stripe checkout works (test mode)
- [ ] Webhook processes correctly
- [ ] Premium status detected immediately
- [ ] Premium features unlock

#### ✅ Navigation
- [ ] Logo always links to /
- [ ] All nav links work
- [ ] Active link highlighted
- [ ] Mobile menu opens/closes
- [ ] Mobile menu links work
- [ ] Profile menu opens/closes
- [ ] Profile menu items work
- [ ] Breadcrumbs correct (if applicable)

#### ✅ Responsive Design
- [ ] Mobile: All content accessible
- [ ] Mobile: Touch targets adequate size
- [ ] Mobile: No horizontal scroll
- [ ] Mobile: Text readable without zoom
- [ ] Tablet: Layout adapts correctly
- [ ] Desktop: Layout looks professional
- [ ] Transitions smooth on all devices

#### ✅ Performance
- [ ] Initial load < 3 seconds
- [ ] Page transitions smooth
- [ ] No lag during interaction
- [ ] Images load progressively
- [ ] Audio loads without blocking UI
- [ ] No memory leaks (check DevTools)

---

## Phase 5: Performance & SEO Tests

### Performance Tests

#### ✅ Lighthouse Scores
Run Lighthouse on each page:

**Public Pages:**
- [ ] `/` (Landing)
  - [ ] Performance > 90
  - [ ] Accessibility > 90
  - [ ] Best Practices > 90
  - [ ] SEO > 90
  
- [ ] `/quran`
  - [ ] Performance > 80 (audio/images heavy)
  - [ ] Accessibility > 90
  - [ ] Best Practices > 90
  - [ ] SEO > 90

- [ ] `/dua`
  - [ ] Performance > 85
  - [ ] Accessibility > 90
  - [ ] Best Practices > 90
  - [ ] SEO > 90

#### ✅ Core Web Vitals
- [ ] LCP (Largest Contentful Paint) < 2.5s
- [ ] FID (First Input Delay) < 100ms
- [ ] CLS (Cumulative Layout Shift) < 0.1

#### ✅ Load Testing
- [ ] 100 concurrent anonymous users browsing Quran
- [ ] 50 concurrent sign-ups
- [ ] Rate limiting kicks in at threshold
- [ ] Server remains stable
- [ ] No errors in logs

### SEO Tests

#### ✅ Meta Tags Validation
For each public page, verify:
- [ ] `<title>` unique and descriptive
- [ ] `<meta name="description">` present (50-160 chars)
- [ ] `<meta name="keywords">` relevant
- [ ] `<meta property="og:title">` present
- [ ] `<meta property="og:description">` present
- [ ] `<meta property="og:image">` present and valid URL
- [ ] `<meta property="og:url">` present and correct
- [ ] `<meta name="twitter:card">` present
- [ ] `<link rel="canonical">` present and correct
- [ ] `<meta name="robots">` allows indexing

#### ✅ Structured Data
- [ ] JSON-LD schema present
- [ ] Valid schema (use Google's Structured Data Testing Tool)
- [ ] Relevant schema for content (Article, WebPage, etc.)

#### ✅ Crawlability
- [ ] robots.txt accessible
- [ ] robots.txt allows public pages
- [ ] robots.txt disallows auth pages
- [ ] sitemap.xml accessible
- [ ] sitemap.xml includes all public URLs
- [ ] sitemap.xml valid format
- [ ] No noindex tags on public pages
- [ ] Internal links work (no 404s)

#### ✅ Social Sharing
- [ ] Share on Facebook shows correct preview
- [ ] Share on Twitter shows correct card
- [ ] Share on LinkedIn shows correct preview
- [ ] Share on WhatsApp shows correct preview
- [ ] Images display in previews

#### ✅ URL Structure
- [ ] Clean URLs (no unnecessary params)
- [ ] Readable URLs (`/quran?surah=1` not `/quran?id=abc123`)
- [ ] Consistent casing (lowercase recommended)
- [ ] No trailing slashes (or consistent handling)

---

## Phase 6: Production Smoke Tests

**Run IMMEDIATELY after production deployment**

### Critical Path Tests (15 minutes)

#### ✅ Anonymous User - Happy Path
1. [ ] Visit https://nura-ai.app
2. [ ] Landing page loads
3. [ ] Click "Quran Reader"
4. [ ] Quran reader loads
5. [ ] Play audio
6. [ ] Audio plays successfully
7. [ ] Try to bookmark
8. [ ] Sign-in prompt appears
9. [ ] Click "Sign In"
10. [ ] Login page loads
11. [ ] **STOP** (don't complete login in prod)

**Expected: No errors, all loads correctly**

#### ✅ Authenticated User - Happy Path
1. [ ] Sign in with test account
2. [ ] Redirected to /home
3. [ ] Navigate to /quran
4. [ ] Toggle bookmark
5. [ ] Bookmark saves
6. [ ] Navigate to /dua
7. [ ] Browse duas
8. [ ] Try emotional search
9. [ ] Upgrade prompt appears (if not premium)
10. [ ] Sign out

**Expected: All features work for authenticated user**

#### ✅ Premium User - Happy Path
1. [ ] Sign in with premium test account
2. [ ] Navigate to /learn
3. [ ] AI Tafsir loads
4. [ ] Ask a question
5. [ ] Get AI response
6. [ ] Navigate to /dua
7. [ ] Use emotional search
8. [ ] Get results
9. [ ] All premium features work

**Expected: Premium features accessible**

#### ✅ Teacher - Happy Path
1. [ ] Sign in as teacher
2. [ ] Navigate to /t/classes
3. [ ] Classes dashboard loads
4. [ ] Create test class
5. [ ] Class created successfully
6. [ ] Navigate to /t/gradebook
7. [ ] Gradebook loads
8. [ ] All teacher features work

**Expected: Classroom features functional**

### Production Monitoring (First 24 Hours)

#### ✅ Error Monitoring
- [ ] Check Firebase Analytics for errors
- [ ] Check server logs for 500 errors
- [ ] Check Sentry (if configured) for exceptions
- [ ] Check Firestore usage (not exceeding quotas)
- [ ] Check Firebase Auth usage

#### ✅ User Behavior
- [ ] Anonymous users visiting public pages?
- [ ] Sign-up conversion rate normal?
- [ ] Bounce rate acceptable?
- [ ] Session duration reasonable?
- [ ] No unusual drop-offs?

#### ✅ Performance
- [ ] Server response times < 500ms
- [ ] CDN cache hit rate > 80%
- [ ] Page load times acceptable
- [ ] No memory leaks (monitor server RAM)

---

## 🐛 Bug Report Template

If you find issues during testing:

```markdown
### Bug Report #___

**Date:** ___________  
**Tester:** ___________  
**Severity:** [ ] Critical [ ] High [ ] Medium [ ] Low

**Environment:**
- Device: ___________
- OS: ___________
- Browser: ___________
- Network: ___________

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Result:**


**Actual Result:**


**Screenshots/Video:**
(attach or link)

**Console Errors:**
```
(paste errors)
```

**Additional Notes:**


**Status:** [ ] Open [ ] In Progress [ ] Fixed [ ] Won't Fix
```

---

## ✅ Sign-Off

### Development Team
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code reviewed
- [ ] Merged to main branch

**Signed:** ___________________ **Date:** ___________

### QA Team
- [ ] Manual QA completed
- [ ] All critical bugs fixed
- [ ] All high-priority bugs fixed
- [ ] Performance acceptable
- [ ] SEO validated

**Signed:** ___________________ **Date:** ___________

### Product Owner
- [ ] User journeys validated
- [ ] Business requirements met
- [ ] Ready for production

**Signed:** ___________________ **Date:** ___________

---

## 📊 Test Results Summary

**Total Tests:** _______  
**Passed:** _______  
**Failed:** _______  
**Blocked:** _______  
**Skipped:** _______  

**Pass Rate:** _______% (Target: > 95%)

**Critical Bugs:** _______  (Target: 0)  
**High Priority Bugs:** _______ (Target: 0)  
**Medium Priority Bugs:** _______ (Target: < 5)  
**Low Priority Bugs:** _______ (Acceptable)

---

**Testing Complete:** [ ] YES [ ] NO  
**Ready for Production:** [ ] YES [ ] NO  

**Final Approval:** ___________________ **Date:** ___________

