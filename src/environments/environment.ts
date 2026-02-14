import { Environment } from './environment.interface';

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  openaiApiKey: undefined,
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  quranFoundationClientId: '093c7428-3167-4b5d-9409-5d3ebb713487', // Production key
  quranFoundationApiKey: '0GU4xDZeCiMYMrd_6uh_1jy9Rm', // Production secret
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
    publishableKey: 'pk_test_51R1RShGYeNehzlUZnehEoAkNzTKRO29KrBhHVlrJZVliO8MBrI9gHgbeSPL1ns7QOlO8vQ99afIl2EfAZ4HSoBFX00J8wRZMur',
    priceId: 'price_1RH7QQGYeNehzlUZUYuUPr8n'
  },
  mushafImageBaseUrl: 'https://storage.googleapis.com/nura_ai_quran_pages/',
  adminUsers: ['test-admin-user']
}; 

