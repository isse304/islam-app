export interface Environment {
  production: boolean;
  apiUrl: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  sttApiKey?: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region: string;
  };
  stripeConfig: {
    publishableKey: string;
    priceId: string;
  };
  // List of admin user IDs
  adminUsers: string[];
  mushafImageBaseUrl: string;
} 