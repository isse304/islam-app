import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: 'https://nura-ai-backend.onrender.com',
  openaiApiKey: undefined,
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  clerkPublishableKey: 'pk_live_Y2xlcmsubnVyYS1haS5hcHAk',
  clerkFrontendApi: 'https://clerk.nura-ai.app',
  aws: {
    accessKeyId: undefined,
    secretAccessKey: undefined,
    region: 'us-east-1'
  },
  stripeConfig: {
    publishableKey: 'pk_live_51R1RShGYeNehzlUZnehEoAkNzTKRO29KrBhHVlrJZVliO8MBrI9gHgbeSPL1ns7QOlO8vQ99afIl2EfAZ4HSoBFX00J8wRZMur',
    priceId: 'price_1R1SKuGYeNehzlUZPlVwt392'
  }
}; 