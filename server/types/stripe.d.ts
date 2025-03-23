import { Stripe } from 'stripe';

declare module 'stripe' {
    export interface StripeConfig {
        apiVersion: '2023-10-16' | '2022-11-15';
    }
} 