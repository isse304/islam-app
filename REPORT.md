# Nura AI Auth + Quran Reader Stability Update

This report details the diagnosis and resolution of a critical issue causing unexpected user logouts and API failures in the Nura AI application.

## 1. Root Cause Analysis

The investigation identified two primary issues that combined to create a poor user experience:

**A. Improper Auth Interceptor Error Handling:**
- **File:** `src/app/interceptors/auth.interceptor.ts`
- **Problem:** A top-level `catchError` block in the RxJS pipe was overly broad. It incorrectly interpreted *any* HTTP error (including `404 Not Found` from the Tafsir API) as an authentication token failure.
- **Impact:** When a user navigated to the Quran Reader and the app requested a Tafsir, the resulting 404 error was caught by this interceptor, which then triggered a global `signOut()` action, logging the user out immediately.

**B. Inconsistent Tafsir API Usage:**
- **File:** `src/app/components/quran/quran-reader/quran-reader.component.ts`
- **Problem:** The Quran Reader was using `QuranService` to fetch Tafsir data. This service was configured to call an external API (`api.qurancdn.com`), which was not the intended backend for this feature. The correct service, `TafsirDatabaseService`, which calls the application's own `/api/tafsir/...` backend, was not being used.
- **Impact:** This led to the `404 Not Found` errors that initiated the logout sequence. It also represented a bug where the wrong data source was being queried.

**C. Lack of Explicit Auth Persistence:**
- **File:** `src/app/services/firebase-auth.service.ts`
- **Problem:** The Firebase Auth initialization did not explicitly set the persistence level. While most modern browsers default to `localPersistence`, not setting it explicitly can lead to inconsistent behavior where user sessions are not maintained after a browser is closed.

There was **no evidence of runaway polling** (`setInterval` or RxJS `interval`). The high volume of network requests was a symptom of the above issues, where user actions would repeatedly trigger the failing API calls.

## 2. Summary of Changes

To resolve these issues and improve stability, the following changes were made:

### Client-Side Fixes:

1.  **Auth Interceptor Corrected (`src/app/interceptors/auth.interceptor.ts`):**
    *   **Before:** A broad `catchError` would sign out the user on any API request failure.
    *   **After:** The interceptor now **only** triggers the token refresh or sign-out logic for `401 Unauthorized` or `403 Forbidden` errors that originate from our own backend API. All other errors (like 404s) are now correctly propagated without affecting the user's authentication state.

2.  **Standardized Tafsir API Calls (`src/app/components/quran/quran-reader/quran-reader.component.ts`):**
    *   **Before:** The component used `QuranService`, which called an incorrect, external API endpoint for Tafsir.
    *   **After:** The component now uses `TafsirDatabaseService`, ensuring all Tafsir requests are routed through the application's backend API (`/api/tafsir/...`). This resolves the 404 errors and ensures the correct data is fetched.

3.  **Hardened Firebase Authentication (`src/app/services/firebase-auth.service.ts`):**
    *   **Before:** Auth persistence was implicit.
    *   **After:** Firebase Auth is now explicitly configured to use `browserLocalPersistence`. This guarantees that user sessions are stored locally and maintained across browser restarts, providing a more stable login experience.

### Server-Side Fixes:

1.  **Auth Middleware Created (`server/middleware/auth.ts`):**
    *   **Before:** No dedicated, reusable authentication middleware.
    *   **After:** A new `auth.ts` middleware was created. It provides `withAuth` and `withPremium` guards to protect routes by verifying Firebase ID tokens. This middleware is not applied to the public Tafsir endpoints but is available for securing other parts of the API.

## 3. How to Roll Back

The changes were made in a few key files. To roll back, you can revert the commits associated with these changes.

-   **Commit for Interceptor and Quran Reader Fixes:**
    -   `git revert <commit_hash_for_interceptor_and_reader_changes>`
-   **Commit for Auth Hardening:**
    -   `git revert <commit_hash_for_auth_service_changes>`
-   **Commit for Server Middleware:**
    -   `git revert <commit_hash_for_server_middleware_changes>`

Reverting these changes will restore the previous, unstable behavior. It is not recommended unless a severe regression is discovered.
