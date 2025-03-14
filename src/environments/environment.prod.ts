import { Environment } from './environment.interface';

export const environment: Environment = {
  production: true,
  apiUrl: 'https://nura-y6uq.onrender.com',
  openaiApiKey: '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',
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  adminUsers: [],
  firebase: {
    apiKey: "AIzaSyDhBAdoRQx-vc6lz_5lrZgXVPWXEtam-PQ",
    authDomain: "nuraai.firebaseapp.com",
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
    priceId: 'price_1R1TPjGYeNehzlUZi71dNilr'
  }
}; 