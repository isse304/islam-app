import { Schema, model, Document } from 'mongoose';

export interface INewsletterUnsubscribe extends Document {
  email: string;
  unsubscribedAt: Date;
}

const newsletterUnsubscribeSchema = new Schema<INewsletterUnsubscribe>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  unsubscribedAt: {
    type: Date,
    default: Date.now
  }
});

export const NewsletterUnsubscribe = model<INewsletterUnsubscribe>(
  'NewsletterUnsubscribe',
  newsletterUnsubscribeSchema
);
