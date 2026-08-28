# Render Deployment Guide for IslamApp

## Configuration Changes

### Content Security Policy (CSP)

For authentication, Quran API, and payment functionality to work properly, the following CSP directives need to be enabled:

```js
res.setHeader('Content-Security-Policy', 
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://cdn.clerk.dev https://js.stripe.com https://cdnjs.cloudflare.com https://*.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.accounts.dev https://*.clerk.com https://cdnjs.cloudflare.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; " +
  "img-src 'self' data: https: blob:; " +
  "worker-src 'self' blob:; " +
  "child-src 'self' blob:; " +
  "media-src 'self' https://*.everyayah.com https://everyayah.com https://*.quranicaudio.com https://download.quranicaudio.com; " +
  "frame-src https://js.stripe.com https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://*.cloudflare.com https://checkout.stripe.com https://billing.stripe.com https://*.stripe.com; " +
  "connect-src 'self' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://api.clerk.com https://*.clerk.com https://cdn.clerk.dev https://*.cloudflare.com https://nura-ai-backend.onrender.com https://nura-y6uq.onrender.com https://*.alquran.cloud https://api.alquran.cloud https://api.alquran.cloud/v1/ https://*.quran.com https://api.quran.com https://api.quran.com/api/v4 https://*.qurancdn.com https://api.qurancdn.com https://everyayah.com https://*.everyayah.com https://download.quranicaudio.com https://*.quranicaudio.com https://api.stripe.com https://*.stripe.com;"
);
```

The key additions are:

#### Authentication (Clerk)
- `worker-src 'self' blob:` - Required for Clerk's web workers
- `child-src 'self' blob:` - Required for Clerk's blob URLs
- Adding Cloudflare domains for CAPTCHA functionality

#### Quran Functionality
- Added specific URLs for Quran APIs:
  - `https://*.alquran.cloud` and `https://api.alquran.cloud/v1/` for AlQuran.cloud API
  - `https://*.quran.com` and `https://api.quran.com/api/v4` for Quran.com API
  - `https://*.qurancdn.com` and `https://api.qurancdn.com` for QuranCDN API
  - `https://*.everyayah.com` and `https://everyayah.com` for verse audio
  - `https://*.quranicaudio.com` and `https://download.quranicaudio.com` for recitation audio

#### Payment Processing (Stripe)
- Added specific domains for Stripe:
  - `https://*.stripe.com` for API access
  - Added `https://checkout.stripe.com` and `https://billing.stripe.com` to frame-src for checkout forms and billing portal

### CORS Configuration

In your backend server, ensure CORS is configured to allow your frontend domain:

```
CORS_ORIGIN=https://www.nura-ai.app,https://nura-ai-frontend.onrender.com,http://localhost:4200
```

### Stripe Configuration

For Stripe to work properly, ensure the following:

1. Your Stripe publishable key is correctly set in the frontend environment:
   ```typescript
   // environment.prod.ts
   stripeConfig: {
     publishableKey: 'pk_live_51R1RShGYeNehzlUZnehEoAkNzTKRO29KrBhHVlrJZVliO8MBrI9gHgbeSPL1ns7QOlO8vQ99afIl2EfAZ4HSoBFX00J8wRZMur',
     priceId: 'price_1R1SKuGYeNehzlUZPlVwt392'
   }
   ```

2. Your Stripe secret key is set in your backend `.env` file:
   ```
   STRIPE_SECRET_KEY=<your_stripe_secret_key>
   STRIPE_PUBLISHABLE_KEY=<your_stripe_publishable_key>
   STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_secret>
   STRIPE_PRICE_ID=<your_stripe_price_id>
   ```

3. Make sure your backend API is properly configured to handle Stripe requests.

### Clerk Configuration

1. Make sure your Clerk dashboard has your production domains added:
   - Go to Clerk Dashboard -> Your Instance -> Domains
   - Add `nura-ai-frontend.onrender.com` and `www.nura-ai.app`

2. Ensure the script tag in index.html uses the correct format:
   ```html
   <script
     async
     crossorigin="anonymous"
     data-clerk-publishable-key="pk_live_Y2xlcmsubnVyYS1haS5hcHAk"
     src="https://clerk.nura-ai.app/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
     type="text/javascript">
   </script>
   ```

### API URL Configuration

Make sure there are no trailing slashes in your API URL to prevent double-slash issues:

```typescript
// in environment.prod.ts
apiUrl: 'https://nura-y6uq.onrender.com', // NO trailing slash
```

## Troubleshooting

If you encounter any issues:

1. **Quran Reader Not Loading**:
   - Check browser console for specific API errors
   - Verify that API domains are properly included in the CSP
   - Test direct API calls to ensure the endpoints are accessible

2. **Audio Not Playing**:
   - Verify `media-src` directive includes all necessary audio domains
   - Check network tab for any blocked media requests

3. **Stripe Payment Issues**:
   - Ensure frame-src includes all Stripe domains
   - Check that backend API routes are properly handling Stripe requests
   - Verify Stripe keys are correctly set in both frontend and backend

4. **General Issues**:
   - Use browser developer tools to identify specific CSP violations
   - Check network tab for blocked requests
   - Verify that all needed domains are included in CSP

## Deployment Steps

1. Build the application: `npm run build`
2. Push changes to Git repository
3. Deploy to Render
4. Check logs for any deployment issues 