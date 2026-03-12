#!/bin/bash
set -e
echo "Running post-merge setup..."
echo "Installing dependencies..."
npm install --prefer-offline --no-audit --no-fund 2>&1
echo "Pushing database schema..."
npx drizzle-kit push --force 2>&1 || true
echo "Post-merge setup complete."
