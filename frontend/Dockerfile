# Build stage
FROM node:18-alpine as build

WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Set API URL for production (relative path)
ENV REACT_APP_BACKEND_URL=

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets to Nginx html directory
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
