# Public Access - System Architecture

**Visual Guide to Route Guards and Data Flow**

---

## 🏗️ Route Guard Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER TYPES                              │
├─────────────────────────────────────────────────────────────────┤
│  Anonymous    │  Authenticated  │  Premium User  │  Role-Based │
│  (No login)   │   (Free tier)   │  (Subscribed)  │  (T/S/P)   │
└─────────────────────────────────────────────────────────────────┘
        │                 │                │              │
        ▼                 ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         GUARD LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │softAuthGuard │  │authGuardFn   │  │premiumGuard  │         │
│  │              │  │              │  │              │         │
│  │Always allow  │  │Redirect to   │  │Check auth    │         │
│  │              │  │login if not  │  │then check    │         │
│  │              │  │authenticated │  │subscription  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │roleGuardFn   │  │assignmentG.  │  │NoAuthGuard   │         │
│  │              │  │              │  │              │         │
│  │Check user    │  │Check valid   │  │Prevent auth  │         │
│  │has specific  │  │assignment    │  │users from    │         │
│  │role          │  │              │  │auth pages    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │                 │                │              │
        ▼                 ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ROUTE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PUBLIC ROUTES        AUTH ROUTES         PREMIUM ROUTES        │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │ /           │     │ /home       │     │ /learn      │      │
│  │ /quran      │     │ /profile    │     │             │      │
│  │ /dua        │     │ /subscription│    │             │      │
│  │ /about      │     │             │     │             │      │
│  │ /contact    │     │             │     │             │      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                  │
│  CLASSROOM ROUTES                                                │
│  ┌─────────────┬─────────────┬─────────────┐                  │
│  │ /t/classes  │ /s/assignments│ /p/home     │                 │
│  │ /t/gradebook│              │ /p/student/:id│               │
│  │ /t/reports  │              │             │                  │
│  └─────────────┴─────────────┴─────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │                 │                │              │
        ▼                 ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      COMPONENT LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Components handle UI based on auth state:                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ if (isAuthenticated) {                                    │  │
│  │   // Show full features                                   │  │
│  │ } else {                                                  │  │
│  │   // Show limited features + sign-in prompts             │  │
│  │ }                                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │                 │                │              │
        ▼                 ▼                ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Anonymous Users          Authenticated Users                   │
│  ┌─────────────────┐     ┌─────────────────────────────┐      │
│  │ localStorage    │     │ Firestore Database          │      │
│  │ - preferences   │     │ - User profile              │      │
│  │ - deviceId      │     │ - Preferences (synced)      │      │
│  │ - sessionData   │     │ - Bookmarks                 │      │
│  │                 │     │ - Reading history           │      │
│  │ (device-only)   │     │ - Progress tracking         │      │
│  └─────────────────┘     └─────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 User Journey Flow

### Journey 1: Anonymous User → Sign Up

```
┌──────────────┐
│ Landing Page │
│      /       │
└──────┬───────┘
       │ Click "Start Reading"
       ▼
┌──────────────┐
│ Quran Reader │ ◄── softAuthGuard (allows access)
│    /quran    │
└──────┬───────┘
       │ Browse Surahs
       │ Play Audio ✓
       │ Change Settings ✓
       │ (Preferences saved to localStorage)
       │
       │ Try to Bookmark
       ▼
┌──────────────────┐
│ Sign-In Prompt   │
│ "Save bookmarks" │
│ [Sign In]        │
│ [Maybe Later]    │
└──────┬───────────┘
       │ Click "Sign In"
       ▼
┌──────────────────┐
│  Login Page      │ ◄── NoAuthGuard
│  /auth/login     │
│  ?returnUrl=/quran
└──────┬───────────┘
       │ Complete Login
       ▼
┌────────────────────────────┐
│ Back to Quran Reader       │
│ ✓ Preferences migrated     │
│ ✓ Can now bookmark         │
│ ✓ History tracked          │
└────────────────────────────┘
```

### Journey 2: Authenticated User → Premium

```
┌──────────────┐
│  Home Page   │ ◄── User logged in
│    /home     │
└──────┬───────┘
       │ Click "AI Tafsir"
       ▼
┌──────────────────┐
│  /learn          │ ◄── premiumGuard
│                  │     Checks: Auth ✓, Premium ✗
│  Redirecting...  │
└──────┬───────────┘
       │ Redirect to subscription
       ▼
┌──────────────────────┐
│  Subscription Page   │
│  /subscription       │
│  ?feature=AI Tafsir  │
└──────┬───────────────┘
       │ Complete Purchase
       ▼
┌──────────────────────┐
│  Back to /learn      │ ◄── premiumGuard
│  ✓ Premium status    │     Checks: Auth ✓, Premium ✓
│  ✓ Full access       │
└──────────────────────┘
```

### Journey 3: Anonymous User → Premium (Full Funnel)

```
Anonymous → Sign Up → Premium

Step 1: Explore           Step 2: Convert        Step 3: Upgrade
┌──────────────┐         ┌──────────────┐       ┌──────────────┐
│ Browse Quran │         │ Create       │       │ Subscribe    │
│ View Duas    │    ──►  │ Account      │  ──►  │ to Premium   │
│ Try features │         │              │       │              │
└──────────────┘         └──────────────┘       └──────────────┘
localStorage             Firestore sync         Stripe + Firebase
preferences              + migration            premium flag
```

---

## 🗄️ Data Storage Strategy

### Anonymous Users (localStorage)

```javascript
{
  "nura_anonymous_user": {
    "preferences": {
      "theme": "dark",
      "fontSize": 24,
      "translation": "20",
      "reciter": "ar.alafasy"
    },
    "sessionHistory": [
      { "surah": 1, "verse": 1, "timestamp": 1704398400000 },
      { "surah": 2, "verse": 255, "timestamp": 1704398460000 }
    ],
    "deviceId": "device_1704398400_abc123"
  }
}
```

**Limitations:**
- ❌ No cross-device sync
- ❌ No bookmarks (feature locked)
- ❌ Session-only history (cleared on logout)
- ✅ Fast local access
- ✅ Works offline

### Authenticated Users (Firestore)

```
users/{userId}
├── profile
│   ├── name: "Ahmed Khan"
│   ├── email: "ahmed@example.com"
│   ├── role: "student"
│   └── isPremium: false
│
├── preferences
│   ├── theme: "dark"
│   ├── fontSize: 24
│   ├── translation: "20"
│   └── reciter: "ar.alafasy"
│
├── bookmarks
│   ├── bookmark_1
│   │   ├── surah: 2
│   │   ├── verse: 255
│   │   └── createdAt: timestamp
│   └── bookmark_2
│       └── ...
│
├── history
│   ├── entry_1
│   │   ├── surah: 1
│   │   ├── verse: 7
│   │   ├── timestamp: timestamp
│   │   └── duration: 120
│   └── entry_2
│       └── ...
│
└── progress
    ├── lastRead: { surah: 2, verse: 100 }
    ├── totalReadTime: 7200
    └── completedSurahs: [1, 36, 67, 112, 113, 114]
```

**Benefits:**
- ✅ Cross-device sync
- ✅ Persistent bookmarks
- ✅ Long-term history
- ✅ Progress tracking
- ✅ Analytics possible

---

## 🛡️ Security Layers

### Layer 1: Route Guards (Frontend)

```typescript
// Example: Premium route protection
/learn → premiumGuard → checks Auth → checks Premium → Allow/Redirect
```

**Purpose:** User experience (smooth redirects, no flashing)  
**NOT for security** (can be bypassed in browser)

### Layer 2: Firestore Rules (Backend)

```javascript
// Premium content
match /tafsir_chats/{chatId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow create: if isPremiumUser(); // ✓ Server-side check
}
```

**Purpose:** Actual security (enforced by Firebase)  
**Cannot be bypassed**

### Layer 3: API Rate Limiting (Backend)

```typescript
// Anonymous: 100 req / 15 min
// Authenticated: 500 req / 15 min
// Premium: 2000 req / 15 min
```

**Purpose:** Prevent abuse, ensure fair usage  
**Enforced on server**

### Layer 4: API Authentication (Backend)

```typescript
// Protected endpoints require Firebase auth token
router.post('/api/ai/tafsir', 
  authenticateUser, // Verify token
  checkPremiumStatus, // Verify subscription
  handleRequest
);
```

**Purpose:** Ensure only authorized requests  
**Token validation on every request**

---

## 🔍 SEO Architecture

### Public Page Optimization

```
┌─────────────────────────────────────────┐
│         index.html (Base)               │
│  • Primary meta tags                    │
│  • Open Graph tags                      │
│  • Twitter Card tags                    │
│  • Structured data (WebApplication)     │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      Component (Dynamic Meta)           │
│  SeoService.setPageMeta({               │
│    title: "Surah Al-Fatihah | Nura"    │
│    description: "Read Surah..."        │
│    keywords: "quran, surah, fatihah"   │
│    canonicalUrl: "https://..."         │
│  })                                     │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Final HTML (Rendered)           │
│  <title>Surah Al-Fatihah...</title>    │
│  <meta name="description" content="..." │
│  <meta property="og:title" content="..." │
│  <link rel="canonical" href="..." />    │
│  <script type="application/ld+json">    │
│    { "@context": "schema.org", ... }   │
│  </script>                              │
└─────────────────────────────────────────┘
```

### Sitemap Structure

```
sitemap.xml
├── https://nura-ai.app/                    (Priority: 1.0)
├── https://nura-ai.app/quran               (Priority: 0.9)
├── https://nura-ai.app/quran?surah=1       (Priority: 0.8)
├── https://nura-ai.app/quran?surah=2       (Priority: 0.8)
│   ... (all 114 surahs)
├── https://nura-ai.app/dua                 (Priority: 0.8)
├── https://nura-ai.app/about               (Priority: 0.5)
└── https://nura-ai.app/contact             (Priority: 0.4)
```

### robots.txt Rules

```
User-agent: *
Allow: /
Allow: /quran
Allow: /dua
Allow: /about
Allow: /contact

Disallow: /auth/*
Disallow: /t/*
Disallow: /s/*
Disallow: /p/*
Disallow: /profile
Disallow: /subscription

Sitemap: https://nura-ai.app/sitemap.xml
```

---

## 📊 Analytics & Tracking

### Event Tracking Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERACTIONS                        │
├─────────────────────────────────────────────────────────────┤
│  • Page views                                               │
│  • Feature usage                                            │
│  • Button clicks                                            │
│  • Form submissions                                         │
│  • Errors                                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  ANALYTICS SERVICES                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Google       │  │ Firebase     │  │ Custom       │    │
│  │ Analytics    │  │ Analytics    │  │ Events       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     DASHBOARDS                              │
├─────────────────────────────────────────────────────────────┤
│  • Real-time user behavior                                  │
│  • Conversion funnels                                       │
│  • Feature adoption                                         │
│  • Error tracking                                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Events

```typescript
// Anonymous user journey
'page_view' → 'feature_interaction' → 'signup_prompt_shown' 
  → 'signup_clicked' → 'signup_completed'

// Premium conversion
'premium_feature_viewed' → 'upgrade_prompt_shown' 
  → 'upgrade_clicked' → 'checkout_started' → 'purchase_completed'

// Engagement
'bookmark_attempted' → 'audio_played' → 'translation_changed' 
  → 'search_performed'
```

---

## 🔄 State Management Flow

### Component State Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                      App Component                          │
│  • Global auth state (FirebaseAuthService)                  │
│  • Theme service                                            │
│  • Router events                                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           │                         │
           ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│ Header Component │      │  Page Components │
│  • Auth state    │      │   • QuranReader  │
│  • User role     │      │   • DuaComponent │
│  • Premium status│      │   • HomeComponent│
└──────────────────┘      └──────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
          ┌──────────────────┐          ┌──────────────────┐
          │ Auth Services    │          │  Data Services   │
          │ • AuthService    │          │  • QuranService  │
          │ • SubService     │          │  • DuaService    │
          │ • AnonymousService│         │  • AssignmentSvc │
          └──────────────────┘          └──────────────────┘
```

### Observable Data Flow

```typescript
// Firebase Auth state
FirebaseAuthService.user$ 
  └─► (BehaviorSubject<AppUser | null>)
      ├─► Header component (show/hide nav items)
      ├─► Page components (feature access)
      └─► Guards (route protection)

// Premium status
SubscriptionService.isPremium$
  └─► (BehaviorSubject<boolean>)
      ├─► Header component (show/hide upgrade)
      ├─► Premium guards (allow/redirect)
      └─► Components (lock/unlock features)

// Anonymous user data
AnonymousUserService
  └─► localStorage ← read/write
      ├─► Preferences
      ├─► Session history
      └─► Device ID
```

---

## 🚀 Performance Optimizations

### Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    CACHE LAYERS                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Browser Cache (Static Assets)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Quran audio files (immutable, cache 1 year)       │  │
│  │ • Images (1 year)                                    │  │
│  │ • JavaScript bundles (versioned, 1 year)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 2: CDN Cache (Content Delivery)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • API responses (5 minutes)                          │  │
│  │ • Page HTML (1 minute for anonymous users)          │  │
│  │ • Static assets (pass-through from browser cache)   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 3: Application Cache (In-memory)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • User preferences (BehaviorSubject)                 │  │
│  │ • Surah list (singleton, load once)                 │  │
│  │ • Recent verses (LRU cache, 100 items)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Layer 4: localStorage Cache (Persistent)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Anonymous user preferences                         │  │
│  │ • Device ID                                          │  │
│  │ • Session data (expires 24h)                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Load Time Optimization

```
Target: First Contentful Paint < 1.5s

1. Code Splitting
   ┌──────────────────────────────────────┐
   │ main.js (100 KB)                     │
   │ ├─ app-core (30 KB)                 │
   │ ├─ quran-reader.lazy (40 KB)       │
   │ ├─ dua-component.lazy (20 KB)      │
   │ └─ vendor (Angular, Material) (10 KB)│
   └──────────────────────────────────────┘

2. Lazy Loading
   • Route-based (automatic with loadComponent)
   • Image lazy loading (loading="lazy")
   • Below-the-fold content

3. Preloading
   • Critical routes (Quran Reader)
   • Link prefetching (<link rel="prefetch">)
   • Service worker for offline

4. Compression
   • Gzip for text (HTML, CSS, JS)
   • WebP for images
   • Minification
```

---

## 🔐 Firestore Security Architecture

### Rule Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                 FIRESTORE SECURITY RULES                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Public Read (No Auth Required)                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /surahs/{surah}           → allow read: if true      │  │
│  │ /verses/{verse}           → allow read: if true      │  │
│  │ /duas/{dua}               → allow read: if true      │  │
│  │ /translations/{trans}     → allow read: if true      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Private Read/Write (Owner Only)                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /users/{userId}           → allow if isOwner()       │  │
│  │ /users/{uid}/preferences  → allow if isOwner()       │  │
│  │ /users/{uid}/bookmarks    → allow if isOwner()       │  │
│  │ /users/{uid}/history      → allow if isOwner()       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Premium Content (Auth + Premium)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /tafsir_chats/{chatId}    → allow if isPremium()    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Role-Based (Auth + Role)                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ /classes/{classId}        → allow if hasRole('...')  │  │
│  │ /assignments/{aid}        → allow if hasRole('...')  │  │
│  │ /submissions/{sid}        → allow if hasRole('...')  │  │
│  │ /grades/{gid}             → allow if hasRole('...')  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📱 Responsive Design Strategy

### Breakpoints

```
┌─────────────────────────────────────────────────────────────┐
│                    DEVICE BREAKPOINTS                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mobile (< 768px)                                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Card-based layouts                                  │  │
│  │ • Stacked navigation                                  │  │
│  │ • Mobile menu (hamburger)                            │  │
│  │ • Single column                                       │  │
│  │ • Large touch targets (44px min)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Tablet (768px - 1024px)                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Hybrid layouts (cards + grids)                     │  │
│  │ • Collapsible sidebars                               │  │
│  │ • Two-column layouts                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Desktop (> 1024px)                                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • Grid-based layouts                                  │  │
│  │ • Persistent sidebars                                 │  │
│  │ • Multi-column layouts                                │  │
│  │ • Hover states                                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  DEPLOYMENT PIPELINE                        │
└─────────────────────────────────────────────────────────────┘

Development
┌──────────────┐
│ Local Dev    │  npm start
│ localhost    │  → http://localhost:4200
│              │  → Auto-reload on changes
└──────┬───────┘
       │ git push
       ▼
┌──────────────┐
│ GitHub       │  Main branch
│ Repository   │  → Triggers CI/CD
└──────┬───────┘
       │ Build & Test
       ▼
┌──────────────┐
│ Staging      │  firebase hosting:staging
│ Environment  │  → Test with real data
│              │  → QA validation
└──────┬───────┘
       │ Manual approval
       ▼
┌──────────────┐
│ Production   │  firebase deploy
│ Environment  │  → Live at nura-ai.app
│              │  → Monitor metrics
└──────────────┘
```

---

**Last Updated:** January 4, 2026  
**Version:** 1.0  
**For:** Public Access Implementation

