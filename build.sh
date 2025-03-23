#!/bin/bash

# Install dependencies for both frontend and backend
echo "Installing dependencies..."
npm install
cd server && npm install && cd ..

# Build the frontend
echo "Building frontend..."
npm run build

# Build the backend
echo "Building backend..."
cd server && npm run build

echo "Build completed!" 