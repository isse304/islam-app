export interface SubscriptionStatus {
  status: 'active' | 'canceled' | 'inactive';
  plan: 'free' | 'premium';
  features?: {
    emotionalDuaSearch: boolean;
    aiTafsirChat: boolean;
    duaInsights: boolean;
    aiChat: boolean;
    tafsirAccess: boolean;
    wordByWord: boolean;
  };
  currentPeriodEnd?: Date | null;
} 