import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
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
    publishableKey: 'pk_test_51R1nqsGYeNehzlUZBgXi4s6sf5u4BvRkXP7YNb07aNwpYnaPl7VL9GJ4rnGdkLvWDYtd7Jg2w6NPmeXgifPCwd220010zxsvdj',
    priceId: 'price_1R1TPjGYeNehzlUZi71dNilr'
  }
}; 