# Public Access Implementation - Quick Reference Guide

**📘 Quick lookup for developers implementing public access feature**

---

## 🚦 Route Access Levels

### ✅ PUBLIC (No auth required)
```typescript
/ -------------------- Landing page
/quran --------------- Quran Reader (full access)
/dua ----------------- Dua Collection (view only, premium features locked)
/about --------------- About page
/contact ------------- Contact page
```

### 🔐 OPTIONAL AUTH (Better with login)
```typescript
/home ---------------- Home dashboard (public but personalized when logged in)
/profile ------------- User profile (redirects to login if anonymous)
```

### ⭐ PREMIUM (Login + Subscription required)
```typescript
/learn --------------- AI Tafsir Chat
/dua ----------------- Emotional Search & Insights (locked in component)
```

### 🎓 TEACHER (Login + Role: teacher)
```typescript
/t/classes ----------- Teacher Dashboard
/t/gradebook --------- Gradebook
/t/reports ----------- Reports
```

### 📚 STUDENT (Login + Role: student)
```typescript
/s/assignments ------- Student Assignments
/reader?aid=X -------- Assignment Reader (with assignmentGuard)
```

### 👨‍👩‍👧 PARENT (Login + Role: parent)
```typescript
/p/home -------------- Parent Dashboard
/p/student/:id ------- Student Detail
```

---

## 🛡️ Guard Reference

### Use Cases

| Guard | When to Use | Example |
|-------|-------------|---------|
| `optionalAuthGuard` | Route accessible to all, component handles auth UI | `/home` |
| `softAuthGuard` | Always allow access, no blocking | `/quran`, `/dua` |
| `authGuardFn` | Requires authentication | `/profile`, `/subscription` |
| `premiumGuard` | Requires auth + premium subscription | `/learn` |
| `roleGuardFn` | Requires auth + specific role | `/t/classes` (teacher) |
| `assignmentGuard` | Requires auth + valid assignment | `/reader?aid=X` |
| `NoAuthGuard` | Only for logged-out users | `/auth/login` |

### Implementation Examples

**Public route (Quran):**
```typescript
{
  path: 'quran',
  loadComponent: () => import('./components/quran/...').then(m => m.QuranReaderComponent),
  canActivate: [softAuthGuard] // No blocking
}
```

**Premium route (AI Tafsir):**
```typescript
{
  path: 'learn',
  loadComponent: () => import('./components/learn/...').then(m => m.LearnComponent),
  canActivate: [premiumGuard], // Redirects non-premium to /subscription
  data: { feature: 'AI Tafsir Chat' }
}
```

**Role-based route (Teacher Dashboard):**
```typescript
{
  path: 't/classes',
  component: TeacherDashboardComponent,
  canActivate: [roleGuardFn],
  data: { role: 'teacher' }
}
```

---

## 📝 Component Patterns

### Pattern 1: Show Sign-In Prompt (Bookmarks)

```typescript
export class QuranReaderComponent {
  isAuthenticated: boolean = false;
  showBookmarkPrompt: boolean = false;

  constructor(private authService: FirebaseAuthService) {
    this.authService.isLoggedIn$.subscribe(isLoggedIn => {
      this.isAuthenticated = isLoggedIn;
    });
  }

  toggleBookmark(): void {
    if (!this.isAuthenticated) {
      this.showBookmarkPrompt = true;
      return;
    }
    
    // Save bookmark to Firestore
    this.saveBookmark();
  }
}
```

**Template:**
```html
<button (click)="toggleBookmark()" 
        [matTooltip]="isAuthenticated ? 'Bookmark' : 'Sign in to bookmark'">
  <mat-icon>bookmark</mat-icon>
</button>

<div *ngIf="showBookmarkPrompt" class="sign-in-prompt">
  <p>Sign in to save bookmarks</p>
  <button routerLink="/auth/login">Sign In</button>
  <button (click)="showBookmarkPrompt = false">Later</button>
</div>
```

### Pattern 2: Lock Premium Features (Dua Insights)

```typescript
export class DuaComponent {
  isPremiumUser: boolean = false;

  constructor(
    private authService: FirebaseAuthService,
    private subscriptionService: SubscriptionService,
    private dialog: MatDialog
  ) {
    this.subscriptionService.isPremium$.subscribe(isPremium => {
      this.isPremiumUser = isPremium;
    });
  }

  showDuaInsights(dua: any): void {
    if (!this.isPremiumUser) {
      this.dialog.open(PremiumPromptComponent, {
        data: { feature: 'Dua Insights' }
      });
      return;
    }
    
    // Show insights
    this.loadInsights(dua);
  }
}
```

**Template:**
```html
<button (click)="showDuaInsights(dua)"
        [disabled]="!isPremiumUser">
  {{ isPremiumUser ? 'View Insights' : 'Unlock with Premium' }}
  <span *ngIf="!isPremiumUser" class="premium-badge">⭐</span>
</button>
```

### Pattern 3: Anonymous User Preferences

```typescript
export class QuranReaderComponent {
  constructor(private anonymousUserService: AnonymousUserService) {}

  saveFontSize(size: number): void {
    if (this.isAuthenticated) {
      // Save to Firestore
      this.authService.updatePreferences({ fontSize: size });
    } else {
      // Save to localStorage
      this.anonymousUserService.savePreferences({ fontSize: size });
    }
  }

  loadPreferences(): void {
    if (this.isAuthenticated) {
      // Load from Firestore
      this.preferences = await this.authService.getUserPreferences();
    } else {
      // Load from localStorage
      this.preferences = this.anonymousUserService.getPreferences();
    }
  }
}
```

---

## 🔍 SEO Checklist

### In Every Public Component

```typescript
export class QuranReaderComponent implements OnInit {
  constructor(private seoService: SeoService) {}

  ngOnInit() {
    this.updateSEO();
  }

  private updateSEO(): void {
    this.seoService.setPageMeta({
      title: 'Read Quran Online | Nura AI',
      description: 'Read the Holy Quran with translations...',
      keywords: 'quran, read quran online, quran translation',
      canonicalUrl: 'https://nura-ai.app/quran'
    });
  }
}
```

### Required Files
- ✅ `robots.txt` - Allow/disallow crawling
- ✅ `sitemap.xml` - List all public URLs
- ✅ Meta tags in components
- ✅ Canonical URLs
- ✅ Open Graph tags
- ✅ Twitter Card tags
- ✅ Structured Data (JSON-LD)

---

## 🧪 Testing Commands

### Run Unit Tests
```bash
npm run test
# or specific file
npm run test -- --include='**/auth.guard.spec.ts'
```

### Run E2E Tests
```bash
npm run e2e
# or specific suite
npm run e2e -- --spec='public-access.e2e.ts'
```

### Run Lighthouse
```bash
npm install -g lighthouse
lighthouse http://localhost:4200/quran --view
```

### Check Build
```bash
npm run build
# Verify output in dist/
```

### Local Testing
```bash
# Start dev server
npm start

# In another terminal, test as anonymous user
# Open incognito window: http://localhost:4200
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Infinite Redirect Loop
**Symptom:** Browser keeps redirecting between routes  
**Cause:** Guard logic conflicting  
**Solution:**
```typescript
// Make sure guards don't redirect to each other
// Check guard order in canActivate array
canActivate: [authGuardFn, premiumGuard] // Order matters!
```

### Issue 2: localStorage Not Working
**Symptom:** Preferences not persisting  
**Cause:** Browser privacy mode or quota exceeded  
**Solution:**
```typescript
try {
  localStorage.setItem('key', 'value');
} catch (e) {
  // Fallback to sessionStorage or in-memory
  sessionStorage.setItem('key', 'value');
}
```

### Issue 3: SEO Meta Tags Not Updating
**Symptom:** Same meta tags on all pages  
**Cause:** Not calling `setPageMeta()` in components  
**Solution:**
```typescript
// In every public component's ngOnInit
ngOnInit() {
  this.seoService.setPageMeta({
    title: 'Unique Title',
    description: 'Unique description',
    // ...
  });
}
```

### Issue 4: Anonymous User Data Lost on Signup
**Symptom:** Preferences reset after signup  
**Cause:** Not calling migration method  
**Solution:**
```typescript
// In signup success handler
async onSignupSuccess() {
  await this.anonymousUserService.migrateToAuthenticatedUser();
  this.router.navigate(['/home']);
}
```

### Issue 5: Rate Limiting Too Strict
**Symptom:** Anonymous users getting blocked quickly  
**Cause:** Rate limit threshold too low  
**Solution:**
```typescript
// Adjust in rate-limit.ts
max: 100, // Increase if needed
windowMs: 15 * 60 * 1000, // Or increase time window
```

---

## 📊 Analytics Events to Track

### Sign-Up Funnel
```typescript
// Anonymous user views feature
gtag('event', 'feature_view', {
  feature_name: 'quran_reader',
  user_type: 'anonymous'
});

// Anonymous user sees sign-up prompt
gtag('event', 'signup_prompt_shown', {
  prompt_type: 'bookmark',
  page: '/quran'
});

// User clicks "Sign In"
gtag('event', 'signup_prompt_clicked', {
  prompt_type: 'bookmark'
});

// User completes signup
gtag('event', 'signup_completed', {
  method: 'email',
  referrer: 'bookmark_prompt'
});
```

### Premium Conversion
```typescript
// Non-premium user sees premium feature
gtag('event', 'premium_feature_view', {
  feature_name: 'ai_tafsir',
  user_authenticated: true
});

// Upgrade prompt shown
gtag('event', 'upgrade_prompt_shown', {
  feature: 'ai_tafsir',
  location: 'component'
});

// User clicks upgrade
gtag('event', 'upgrade_clicked', {
  feature: 'ai_tafsir'
});

// User completes subscription
gtag('event', 'purchase', {
  transaction_id: 'sub_xxxxx',
  value: 4.99,
  currency: 'USD',
  items: [{ id: 'premium', name: 'Premium Subscription' }]
});
```

---

## 🔐 Security Considerations

### Firestore Rules
```javascript
// Public read for Quran data
match /surahs/{surah} {
  allow read: if true;
  allow write: if false;
}

// Private user data
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId;
}

// Premium features
match /tafsir_chats/{chatId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow create: if isPremiumUser();
}
```

### API Rate Limiting
- Anonymous: 100 requests / 15 min
- Authenticated: 500 requests / 15 min
- Premium: 2000 requests / 15 min

### Content Security Policy
```html
<!-- Already in index.html -->
<meta http-equiv="Content-Security-Policy" content="...">
```

---

## 📞 Support & Resources

### Documentation
- [Full Implementation Plan](./PUBLIC_ACCESS_IMPLEMENTATION_PLAN.md)
- [Testing Checklist](./PUBLIC_ACCESS_TESTING_CHECKLIST.md)
- [Gradebook Roadmap](./GRADEBOOK_IMPLEMENTATION_ROADMAP.md)

### External Resources
- [Angular Guards](https://angular.io/guide/router#preventing-unauthorized-access)
- [Firebase Auth](https://firebase.google.com/docs/auth)
- [SEO Best Practices](https://developers.google.com/search/docs/beginner/seo-starter-guide)
- [Open Graph Protocol](https://ogp.me/)
- [Structured Data](https://developers.google.com/search/docs/advanced/structured-data/intro-structured-data)

### Need Help?
- Check the [Common Issues](#common-issues--solutions) section
- Review test cases in [Testing Checklist](./PUBLIC_ACCESS_TESTING_CHECKLIST.md)
- Search Firebase documentation
- Check Angular documentation

---

## ✅ Pre-Deployment Checklist

**Before pushing to production:**

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual QA completed
- [ ] Lighthouse scores > 90
- [ ] robots.txt correct
- [ ] sitemap.xml updated
- [ ] Meta tags on all pages
- [ ] Rate limiting tested
- [ ] Firestore rules updated
- [ ] Analytics events tracked
- [ ] Rollback plan ready
- [ ] Team notified
- [ ] Staging tested
- [ ] Performance acceptable
- [ ] No console errors

---

**Last Updated:** January 4, 2026  
**Version:** 1.0  
**Status:** Ready for Implementation

