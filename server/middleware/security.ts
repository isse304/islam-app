import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { Request, Response, NextFunction } from 'express';

const isDevelopment = process.env['NODE_ENV'] === 'development';

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Custom security headers
const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
    // Only apply HSTS in production
    if (!isDevelopment) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Disable MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
};

// Production security configuration
const securityConfig = {
    helmet: helmet({
        // Provide empty directives to effectively disable Helmet's default restrictive CSP 
        // while satisfying TypeScript types. The actual CSP will come from the meta tag.
        contentSecurityPolicy: {
            directives: {},
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
        // Disable HSTS in development
        hsts: !isDevelopment
    }),
    compression: compression(),
    rateLimiter: limiter,
    securityHeaders: securityHeaders
};

export default securityConfig; 