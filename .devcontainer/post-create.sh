#!/bin/bash

# Setup Backend
echo "Setting up backend..."
cd backend
python -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..

# Setup Frontend
echo "Setting up frontend..."
cd frontend
yarn install
cd ..

echo "Done! To start: "
echo "1. Run backend: cd backend && source venv/bin/activate && uvicorn server:app --reload --port 8001"
echo "2. Run frontend: cd frontend && yarn start"
