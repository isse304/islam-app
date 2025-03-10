interface Environment {
  production: boolean;
  apiUrl: string;
  openaiApiKey: string | undefined;
  elevenLabsApiKey: string | undefined;
  sttApiKey: string | undefined;
  clerkPublishableKey: string | undefined;
  clerkFrontendApi: string | undefined;
  aws: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    region: string;
  };
}

declare const process: any;

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  openaiApiKey: process.env['OPENAI_API_KEY'],
  elevenLabsApiKey: process.env['ELEVEN_LABS_KEY'],
  sttApiKey: process.env['STT_API_KEY'],
  clerkPublishableKey: process.env['CLERK_PUBLISHABLE_KEY'],
  clerkFrontendApi: process.env['CLERK_FRONTEND_API'],
  aws: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    region: 'us-east-1'
  }
}; 