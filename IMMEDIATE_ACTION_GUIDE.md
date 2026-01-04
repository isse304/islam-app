# ⚠️ IMMEDIATE ACTION GUIDE - Memory & Subscription Issues

## 🚨 Critical Actions (Do These NOW)

### 1. Deploy Memory Fixes (5 minutes)

The code has been updated with memory optimizations. Deploy immediately:

```bash
# From project root
git add .
git commit -m "fix: reduce memory usage and improve subscription logging"
git push origin main
```

**What this fixes:**
- Reduces MongoDB connection pool from 50 to 10 (saves ~400MB memory)
- Adds 10MB request size limit
- Fixes SSE connection leaks
- Adds comprehensive webhook logging

### 2. Check Your Render Instance (2 minutes)

1. Go to https://dashboard.render.com
2. Find your "nura-ai-backend" service
3. Check the **Instance Type**:
   - If showing "Free" or "Starter" (512MB): **UPGRADE to 1GB minimum**
   - Click "Settings" → "Instance Type" → Choose "Starter Plus" (1GB) or higher
4. Monitor memory usage in the "Metrics" tab

**Why:** Your current pool configuration needed 500MB-1GB just for database connections. With fixes, you need 200-400MB total.

### 3. Verify Stripe Webhook Configuration (3 minutes)

1. Go to https://dashboard.stripe.com/webhooks
2. Find your webhook endpoint (should be: `https://nura-y6uq.onrender.com/api/subscription/webhook`)
3. **If webhook doesn't exist or is disabled:**
   - Click "Add endpoint"
   - URL: `https://nura-y6uq.onrender.com/api/subscription/webhook`
   - Events to send:
     - ✅ `checkout.session.completed`
     - ✅ `customer.subscription.created`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
   - Click "Add endpoint"
   - **Copy the Signing Secret** → Add to Render env vars as `STRIPE_WEBHOOK_SECRET`

4. **If webhook exists:**
   - Click on it
   - Scroll down to "Signing secret" → Click "Reveal"
   - **Verify this matches** the `STRIPE_WEBHOOK_SECRET` in your Render environment variables
   - If they don't match, update Render with the correct secret

### 4. Check Premium User's Subscription Status (5 minutes)

Run the verification script:

```bash
cd scripts
node verify-and-fix-subscription.js <premium-user-email>
```

This will:
- ✅ Check Stripe subscription status
- ✅ Check MongoDB UserSubscription
- ✅ Check Firebase custom claims
- ⚠️  Show any discrepancies
- 🔧 Offer to fix automatically (uses Stripe as source of truth)

**Example output:**
```
🔍 Checking subscription for: user@example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Checking MongoDB...
   ✓ Found in MongoDB: { status: 'inactive', plan: 'free' }

🔐 Checking Firebase Custom Claims...
   ✓ Claims: { premium: false, subscriptionStatus: 'inactive' }

💳 Checking Stripe...
   ✓ Found in Stripe: { status: 'active', currentPeriodEnd: '2025-12-07' }

🔎 Analyzing Discrepancies...
   ⚠️  DISCREPANCIES FOUND:
      - Stripe shows active, MongoDB shows inactive
      - Stripe shows active, Firebase claims show premium=false

🔧 FIXING SUBSCRIPTION...
   ✅ MongoDB updated
   ✅ Firebase claims updated

✅ SUBSCRIPTION FIXED!
   Status: active
   Premium: true
```

---

## 📊 Monitor After Deployment (15 minutes)

### A. Check Server Logs

1. In Render dashboard, go to your backend service
2. Click "Logs" tab
3. Look for:
   - ✅ `MongoDB connection established successfully`
   - ✅ `Server running on port 3000`
   - ⚠️  Any memory warnings

### B. Test Memory Endpoint

```bash
curl https://nura-y6uq.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "memory": {
    "rss": 250,
    "heapUsed": 120,
    "heapUsedPercent": 45,
    "warning": null
  },
  "database": {
    "mongodb": "connected"
  }
}
```

**Warning signs:**
- `heapUsedPercent` > 80% → Still too high, consider upgrading instance
- `status: "warning"` → Memory usage critical

### C. Test Premium Subscription

Have your premium user:
1. Log out completely
2. Log back in
3. Try accessing a premium feature (AI Tafsir Chat, Dua Insights, etc.)
4. If still not working:
   - Check Render logs for webhook activity
   - Run verification script again
   - Contact Stripe support to resend webhook

---

## 🔍 Troubleshooting

### Premium Still Not Working?

**Check Webhook Logs in Stripe:**
1. Stripe Dashboard → Webhooks → Click your endpoint
2. Scroll down to "Recent webhook deliveries"
3. Look for recent events
4. Check if any failed (red X)
5. Click on failed events to see error details

**Common issues:**
- ❌ `401 Unauthorized` → Webhook secret mismatch
- ❌ `500 Internal Server Error` → Check Render logs for errors
- ❌ No recent events → Webhook not configured or disabled
- ❌ Events show "Success" but status not updated → Database connection issue

**Manual Fix:**
```bash
# Force token refresh on client side
# User needs to log out and log back in

# OR run this script to manually sync
node scripts/verify-and-fix-subscription.js <user-email>
```

### Memory Still High?

1. **Check for other issues:**
   ```bash
   curl https://nura-y6uq.onrender.com/api/health/metrics
   ```

2. **Restart the server:**
   - Render dashboard → Service → "Manual Deploy" → "Clear build cache & deploy"

3. **Upgrade instance:**
   - Settings → Instance Type → Choose 2GB or higher

4. **Check for memory leaks:**
   - Monitor `/api/health` every 5 minutes
   - If memory keeps growing → possible leak in application code

### Still Getting Memory Errors?

**Additional optimizations needed:**

1. **Add Redis for caching** (instead of MongoDB):
   ```bash
   # In Render, add Redis instance
   # Update cache service to use Redis
   # Frees up ~100MB
   ```

2. **Optimize MongoDB queries:**
   - Add indexes
   - Use projections (only fetch needed fields)
   - Implement pagination

3. **Limit concurrent requests:**
   - Current rate limit: 1000 per 15 min
   - Reduce to 500 or lower

---

## 📞 Next Steps After Immediate Fixes

### Within 24 Hours:
- [ ] Monitor memory usage trends
- [ ] Check webhook delivery success rate
- [ ] Verify premium features working for all users
- [ ] Review Render logs for any errors

### Within 1 Week:
- [ ] Set up proper monitoring (Sentry, DataDog, etc.)
- [ ] Implement Redis caching
- [ ] Add database indexes
- [ ] Set up alerts for memory usage > 80%
- [ ] Load test with 100 concurrent users

### Long Term:
- [ ] Migrate to production-grade instance (2GB+ RAM)
- [ ] Implement proper error tracking
- [ ] Add performance monitoring
- [ ] Optimize database queries
- [ ] Consider microservices architecture if scaling further

---

## 📝 Files Changed

1. `server/config/database.ts` - Reduced connection pool sizes
2. `server/index.ts` - Added request size limits, health endpoint
3. `server/routes/ai.ts` - Added SSE timeout and cleanup
4. `server/routes/health.ts` - New health check endpoint
5. `server/services/stripe.service.ts` - Enhanced logging
6. `scripts/verify-and-fix-subscription.js` - New diagnostic tool
7. `MEMORY_AND_SUBSCRIPTION_FIX.md` - Detailed analysis
8. This file - Action guide

---

## ✅ Success Criteria

You'll know everything is working when:

- ✅ No more "exceeded memory limit" emails from Render
- ✅ Memory usage stays below 70% consistently
- ✅ Premium users have immediate access after payment
- ✅ Webhook delivery success rate > 99%
- ✅ Server stays up without restarts
- ✅ Response times < 500ms for most endpoints

---

## 🆘 Emergency Contacts

If you need urgent help:

1. **Render Support:** https://render.com/support
2. **Stripe Support:** https://support.stripe.com
3. **MongoDB Atlas Support:** https://www.mongodb.com/support

---

**Questions? Check the detailed analysis in `MEMORY_AND_SUBSCRIPTION_FIX.md`**







