export interface Environment {
  production: boolean;
  apiUrl: string;
  openaiApiKey?: string;
  elevenLabsApiKey?: string;
  sttApiKey?: string;
  clerkPublishableKey: string;
  clerkFrontendApi: string;
  aws: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region: string;
  };
  stripeConfig: {
    publishableKey: string;
    priceId: string;
  };
} 