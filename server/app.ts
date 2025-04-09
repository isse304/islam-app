import express, { Request as ExpressRequest } from 'express';
import bodyParser from 'body-parser';
import tafsirRoutes from './routes/tafsir';
import userRoutes from './routes/user';
import dotenv from 'dotenv';
import path from 'path';
import aiRoutes from './routes/ai';
import quranRoutes from './routes/quran';
import subscriptionRoutes from './routes/subscription';
import usageRoutes from './routes/usage';

dotenv.config();

const app = express();

// Log ALL incoming requests BEFORE any other middleware
app.use((req, res, next) => {
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

// --- IMPORTANT: Define the Stripe webhook route BEFORE global body parsers ---
// The raw body parser is handled within the subscription route itself.
app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // We need to import the service here or pass it down
  // For simplicity, let's assume the subscriptionRoutes handles its own service instance
  // and the actual logic is inside stripeService.handleWebhookEvent
  // We are essentially re-routing this specific path before the subscriptionRoutes router gets it.
  // This avoids the global bodyParser.json() interfering.
  // Note: This requires the `stripeService` instance to be accessible or re-instantiated.
  // A better long-term solution might involve refactoring how routes/middleware are applied.
  try {
    // Temporarily import or get the service instance. Refactor needed for cleaner approach.
    const { StripeService } = await import('./services/stripe.service');
    const { EmailService } = await import('./services/email.service');
    const emailServiceInstance = new EmailService();
    const stripeServiceInstance = new StripeService(emailServiceInstance);
    await stripeServiceInstance.handleWebhookEvent(req, res);
  } catch (error) {
    console.error('[Webhook Route Override] Error during webhook processing:', error);
    if (!res.headersSent) {
        next(error);
    }
  }
});
// ------------------------------------------------------------------------

// Parse JSON bodies for OTHER routes
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Add other routes
app.use('/api/tafsir', tafsirRoutes);
app.use('/api/user', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/quran', quranRoutes);
// Mount the subscription router for OTHER routes like /create-checkout, /status etc.
// The webhook route defined above will catch '/api/subscription/webhook' before this router does.
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/usage', usageRoutes);

// Serve static files
const clientBuildPath = path.join(process.cwd(), 'dist/islam-app/browser');
app.use(express.static(clientBuildPath));

// Serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) {
    return next();
  }
  
  if (req.accepts('html')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
      if (err) {
        res.status(500).send(err);
      }
    });
  } else {
    res.status(404).send('Not Found');
  }
});

export default app;