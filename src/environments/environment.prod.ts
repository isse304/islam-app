export const environment = {
  production: true,
  apiUrl: 'https://islam-app-server.onrender.com', // Updated to your Render backend URL
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