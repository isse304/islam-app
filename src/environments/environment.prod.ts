import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: 'https://your-production-api.com',
  openaiApiKey: undefined,
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  clerkPublishableKey: 'pk_test_cm9idXN0LWNyYXdkYWQtNDcuY2xlcmsuYWNjb3VudHMuZGV2JA',
  clerkFrontendApi: 'https://robust-crawdad-47.clerk.accounts.dev',
  aws: {
    accessKeyId: undefined,
    secretAccessKey: undefined,
    region: 'us-east-1'
  },
  stripeConfig: {
    publishableKey: process.env['STRIPE_PUBLISHABLE_KEY'] || '',
    priceId: process.env['STRIPE_PRICE_ID'] || ''
  }
}; 