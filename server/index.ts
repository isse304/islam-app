import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import aiRoutes from './routes/ai';
import userRoutes from './routes/users';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Log environment variables (remove in production)
console.log('Environment loaded from:', path.resolve(__dirname, '../.env'));
console.log('OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for development
app.use(cors());

// Parse JSON bodies
app.use(bodyParser.json());

// Mount routes
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'IslamApp API is running' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error details:', {
    name: err.name,
    message: err.message,
    stack: err.stack
  });
  res.status(500).json({ 
    error: 'Something broke!',
    details: err.message
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 