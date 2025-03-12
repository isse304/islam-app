interface Environment {
  production: boolean;
  apiUrl: string;
  openaiApiKey: string | undefined;
  elevenLabsApiKey: string | undefined;
  sttApiKey: string | undefined;
  clerkPublishableKey: string;
  clerkFrontendApi: string;
  aws: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    region: string;
  };
  stripeConfig: {
    publishableKey: string;
    priceId: string;
  };
}

declare const process: any;

export const environment: Environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  openaiApiKey: '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',
  elevenLabsApiKey: undefined,
  sttApiKey: undefined,
  clerkPublishableKey: 'pk_test_cm9idXN0LWNyYXdkYWQtNDcuY2xlcmsuYWNjb3VudHMuZGV2JA',
  clerkFrontendApi: 'https://robust-crawdad-47.clerk.accounts.dev',
  aws: {
    accessKeyId: undefined,
    secretAccessKey: undefined,
    region: 'us-east-1'
  },
  stripeConfig: {
    publishableKey: 'pk_test_51R1RShGYeNehzlUZBgXi4s6sf5u4BvRkXP7YNb07aNwpYnaPl7VL9GJ4rnGdkLvWDYtd7Jg2w6NPmeXgifPCwd220010zxsvdj',
    priceId: 'price_1R1TPjGYeNehzlUZi71dNilr'
  }
}; 