import express, { Request, Response, NextFunction } from 'express';
import { EmailService } from '../services/email.service';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const emailService = new EmailService();

// Basic rate limiting for the contact form endpoint
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many contact requests from this IP, please try again after 15 minutes'
});

// Validation middleware
const validateContactForm = [
  body('name').trim().notEmpty().withMessage('Name is required.').escape(),
  body('email').isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('message').trim().notEmpty().withMessage('Message is required.').escape(),
];

router.post('/', contactLimiter, validateContactForm, async (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, message } = req.body;

  try {
    // Call the new public method in EmailService
    await emailService.sendContactSubmission(name, email, message);
    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Error sending contact form email:', error);
    // Check if the error is due to missing recipient configuration
    if (error instanceof Error && error.message.includes("No contact email recipient set")) {
        res.status(500).json({ error: 'Server configuration error. Cannot process contact request.' });
    } else {
        // Pass the error to the centralized handler
        next(error);
    }
  }
});

export default router; 