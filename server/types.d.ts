declare module 'express-session';
declare module 'cors';
declare module 'stripe' {
    interface StripeConfig {
        apiVersion: '2022-11-15' | '2023-10-16';
    }
} 