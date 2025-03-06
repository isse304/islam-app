export interface Environment {
  production: boolean;
  openaiApiKey: string;
  elevenLabsApiKey: string;
  sttApiKey: string;
  awsConfig: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  };
  clerkFrontendApi: string;
  clerkPublishableKey: string;
  apiUrl: string;
} 