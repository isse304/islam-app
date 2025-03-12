# Render Deployment Guide for IslamApp

## Configuration Changes

### Content Security Policy (CSP)

For Clerk authentication to work properly, the following CSP directives need to be enabled:

```js
res.setHeader('Content-Security-Policy', 
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://cdn.clerk.dev https://js.stripe.com https://cdnjs.cloudflare.com https://*.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.accounts.dev https://*.clerk.com https://cdnjs.cloudflare.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; " +
  "img-src 'self' data: https: blob:; " +
  "worker-src 'self' blob:; " +
  "child-src 'self' blob:; " +
  "frame-src https://js.stripe.com https://clerk.nura-ai.app https://*.clerk.accounts.dev https://*.clerk.com https://*.cloudflare.com; " +
  "connect-src 'self' https://clerk.nura-ai.app https://*.clerk.accounts.dev https://api.clerk.com https://*.clerk.com https://cdn.clerk.dev https://*.cloudflare.com https://nura-ai-backend.onrender.com https://nura-y6uq.onrender.com;"
);
```

The key additions are:
- `worker-src 'self' blob:` - Required for Clerk's web workers
- `child-src 'self' blob:` - Required for Clerk's blob URLs
- Adding Cloudflare domains for CAPTCHA functionality

### CORS Configuration

In your backend server, ensure CORS is configured to allow your frontend domain:

```
CORS_ORIGIN=https://www.nura-ai.app,https://nura-ai-frontend.onrender.com,http://localhost:4200
```

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

1. Check browser console for specific errors
2. Verify CSP headers using browser developer tools
3. Check CORS headers in Network requests
4. Ensure Clerk domains are properly configured

## Deployment Steps

1. Build the application: `npm run build`
2. Push changes to Git repository
3. Deploy to Render
4. Check logs for any deployment issues 