#!/bin/bash

# Setup Backend
echo "Setting up backend..."
cd backend
if [ ! -f .env ]; then
  echo "Creating .env template for backend..."
  echo "MONGO_URL=mongodb://db:27017" > .env
  echo "DB_NAME=taskflow" >> .env
  echo "GOOGLE_CLIENT_ID=your_id" >> .env
  echo "GOOGLE_CLIENT_SECRET=your_secret" >> .env
fi
python -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..

# Setup Frontend
echo "Setting up frontend..."
cd frontend
if [ ! -f .env ]; then
  echo "Creating .env template for frontend..."
  echo "REACT_APP_BACKEND_URL=https://\${CODESPACE_NAME}-8001.\${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}" > .env
fi
yarn install
cd ..

echo "Done! To start: "
echo "1. Run backend: cd backend && source venv/bin/activate && uvicorn server:app --reload --port 8001"
echo "2. Run frontend: cd frontend && yarn start"
