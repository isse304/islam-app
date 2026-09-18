import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: 'https://nura-y6uq.onrender.com',
  openaiApiKey: undefined,
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  adminUsers: [],
  firebase: {
    apiKey: "AIzaSyDhBAdoRQx-vc6lz_5lrZgXVPWXEtam-PQ",
    // Must match the origin serving the app so signInWithRedirect stays
    // first-party. The /__/auth helpers are reverse-proxied to
    // nuraai.firebaseapp.com by server/index.ts.
    authDomain: "www.nura-ai.app",
    projectId: "nuraai",
    storageBucket: "nuraai.firebasestorage.app",
    messagingSenderId: "883232352111",
    appId: "1:883232352111:web:bf1b4d95807e614604ea9a",
    measurementId: "G-KJ4V3QTMT3"
  },
  aws: {
    accessKeyId: undefined,
    secretAccessKey: undefined,
    region: 'us-east-1'
  },
  stripeConfig: {
    publishableKey: 'pk_live_51R1nqsGYeNehzlUZyzM90JMO86nwlXP7YNb07aNwpYnaPl7VL9GJ4rnGdkLvWDYtd7Jg2w6NPmeXgifPCwd220010zxsvdj',
    priceId: 'price_1R1SKuGYeNehzlUZPlVwt392r'
  },
  mushafImageBaseUrl: 'https://storage.googleapis.com/nura_ai_quran_pages/',
}; 