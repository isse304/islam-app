import { Request, Response, NextFunction } from 'express';
import { HttpError } from 'http-errors'; // Using http-errors for standard HTTP error objects

// Define a standard error response structure
interface ErrorResponse {
  status: number;
  message: string;
  error?: string; // Original error type or code
  details?: any; // Additional details (e.g., validation errors)
  stack?: string; // Only in development
}

export const errorHandler = (
  err: Error | HttpError, // Accept standard Error or HttpError
  req: Request,
  res: Response,
  next: NextFunction // Although it's the last middleware, include next for type correctness
): void => {
  // Log the error internally (consider using a more robust logger like Winston in production)
  console.error(`[ErrorHandler] ${new Date().toISOString()} - Path: ${req.path}`);
  console.error(err);

  // Determine HTTP status code
  let statusCode = 500; // Default to Internal Server Error
  let message = 'An unexpected error occurred on the server.';
  let errorType = 'InternalServerError';
  let details: any = null;

  if (err instanceof HttpError) {
    statusCode = err.status;
    message = err.message;
    errorType = err.name || 'HttpError';
  } else if (err.name === 'ValidationError') { // Example: Mongoose validation error
    statusCode = 400;
    message = 'Validation failed. Please check your input.';
    errorType = err.name;
    // Cast to any to access errors property if needed, or use a more specific type check
    details = (err as any).errors || 'Invalid data provided.';
  } else if (err.name === 'CastError') { // Example: Mongoose CastError (e.g., invalid ObjectId)
    statusCode = 400;
    message = 'Invalid ID format provided.';
    errorType = err.name;
  } else if (err.message.includes('Authentication token')) { // Catch specific auth errors
     statusCode = 401;
     message = 'Authentication failed. Please log in again.';
     errorType = 'AuthenticationError';
  }
  // Add more specific error type checks as needed (e.g., database errors, external API errors)

  // Prepare the response body
  const errorResponse: ErrorResponse = {
    status: statusCode,
    message: message,
    error: errorType,
    details: details,
  };

  // Include stack trace only in development environment
  // Use bracket notation for process.env access
  if (process.env['NODE_ENV'] === 'development') {
    errorResponse.stack = err.stack;
  }

  // Send the error response
  // Ensure headers aren't already sent (e.g., by a streaming response that failed)
  if (!res.headersSent) {
    res.status(statusCode).json(errorResponse);
  } else {
    console.error("[ErrorHandler] Headers already sent. Could not send error response.");
    // If headers are sent, we might just need to terminate the response if possible
    // or rely on the underlying mechanism to handle the broken stream.
  }
}; 