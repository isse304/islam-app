#!/bin/bash

# Exit on error
set -e

echo "Starting deployment process..."

# Frontend build
echo "Building frontend..."
npm install
npm run build

# Server build
echo "Building server..."
cd server
npm install
npm run build

# Copy environment files
echo "Setting up environment..."
if [ ! -f .env ]; then
    echo "Error: Server .env file not found!"
    exit 1
fi

# Create production logs directory
mkdir -p logs

# Run database migrations if they exist
if [ -f "migrations/migrate.js" ]; then
    echo "Running database migrations..."
    node migrations/migrate.js
fi

# Start the application
echo "Starting the application..."
NODE_ENV=production npm start

echo "Deployment complete!" 