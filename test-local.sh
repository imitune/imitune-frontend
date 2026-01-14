#!/bin/bash

# Local Testing Helper Script for ImiTune
# This script starts both backend and frontend for local testing

set -e

echo "🚀 ImiTune Local Testing Setup"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -d "imitune-backend" ] || [ ! -d "web" ]; then
    echo "❌ Error: Please run this script from the imitune-frontend root directory"
    exit 1
fi

# Check if vercel is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Error: Vercel CLI not found. Install it with:"
    echo "   npm install -g vercel"
    exit 1
fi

# Check if backend .env.local exists
if [ ! -f "imitune-backend/.env.local" ]; then
    echo "❌ Error: imitune-backend/.env.local not found"
    echo "   Run 'cd imitune-backend && vercel dev' once to generate it"
    exit 1
fi

# Create .env.local for frontend if it doesn't exist
if [ ! -f "web/.env.local" ]; then
    echo "📝 Creating web/.env.local for local backend testing..."
    echo "VITE_BACKEND_BASE=http://localhost:3000" > web/.env.local
    echo "✅ Created web/.env.local"
else
    # Update existing file
    if ! grep -q "VITE_BACKEND_BASE=http://localhost:3000" web/.env.local; then
        echo "📝 Updating web/.env.local for local backend..."
        sed -i.bak '/VITE_BACKEND_BASE/d' web/.env.local
        echo "VITE_BACKEND_BASE=http://localhost:3000" >> web/.env.local
        rm -f web/.env.local.bak
        echo "✅ Updated web/.env.local"
    fi
fi

echo ""
echo "📋 Setup complete! Starting servers..."
echo ""
echo "🔧 Backend will run at: http://localhost:3000"
echo "🌐 Frontend will run at: http://localhost:5173"
echo ""
echo "📊 Watch the backend console for detailed logs including:"
echo "   - Request types (NEW SUBMISSION vs UPDATE)"
echo "   - Audio upload sizes"
echo "   - Blob storage operations"
echo "   - audioId tracking"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""
echo "Starting in 3 seconds..."
sleep 3

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    # Kill any process on port 3000
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    exit 0
}

trap cleanup EXIT INT TERM

# Check if port 3000 is already in use and kill it
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3000 is in use. Killing existing process..."
    lsof -ti:3000 | xargs kill -9
    sleep 2
fi

# Get absolute path for log files
ROOT_DIR=$(pwd)

# Start backend with output directly to terminal (no log file)
echo "🔧 Starting backend..."
cd imitune-backend
vercel dev --listen 3000 &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
sleep 3
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ Backend ready on port 3000!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend failed to start on port 3000"
        exit 1
    fi
    sleep 1
done

# Start frontend in background (show output directly)
echo "🌐 Starting frontend..."
echo ""
cd web
VITE_BACKEND_BASE=http://localhost:3000 npm run dev &
FRONTEND_PID=$!
cd "$ROOT_DIR"

echo ""
echo "✅ Both servers are running!"
echo ""
echo "📱 Open your browser to: http://localhost:5173"
echo ""
echo "📊 Watch the output above for backend logs when you submit feedback"
echo "   Look for lines starting with [Feedback]"
echo ""
echo "💡 Tip: Use browser DevTools (F12) → Network tab to see request/response details"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for user to press Ctrl+C
wait
