import { Environment } from './environment.interface';

declare const process: any;

export const environment: Environment = {
  production: false,
  openaiApiKey: '',
  elevenLabsApiKey: '',
  sttApiKey: '',
  awsConfig: {
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1'
  },
  clerkFrontendApi: 'https://robust-crawdad-47.clerk.accounts.dev',
  clerkPublishableKey: 'pk_test_cm9idXN0LWNyYXdkYWQtNDcuY2xlcmsuYWNjb3VudHMuZGV2JA',
  apiUrl: 'http://localhost:3000/api'
}; 