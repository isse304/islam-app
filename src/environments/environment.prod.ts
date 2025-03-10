export const environment = {
  production: true,
  apiUrl: 'https://nura-ai-backend.onrender.com',
  openaiApiKey: '%OPENAI_API_KEY%',
  elevenLabsApiKey: '%ELEVEN_LABS_KEY%',
  sttApiKey: '%STT_API_KEY%',
  clerkPublishableKey: process.env['CLERK_PUBLISHABLE_KEY'] || process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
  clerkFrontendApi: 'https://clerk.com',
  aws: {
    accessKeyId: '%AWS_ACCESS_KEY_ID%',
    secretAccessKey: '%AWS_SECRET_ACCESS_KEY%',
    region: 'us-east-1'
  }
}; 