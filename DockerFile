# Use Node.js
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Build frontend
RUN npm run build

# Install serve
RUN npm install -g serve

# Expose port
EXPOSE 8080

# Start app
CMD ["serve", "-s", "dist", "-l", "8080"]