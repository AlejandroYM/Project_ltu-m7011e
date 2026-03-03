# We use a lightweight Node.js image
FROM node:18-slim

# Work directory inside the container
WORKDIR /usr/src/app

# We copy only the dependency files first to leverage caching
COPY package*.json ./

# Install dependencies (only production to keep it lightweight)
RUN npm install --only=production

# Copy the rest of the application code to the container
COPY . .

# Expose the port defined in your server.js
EXPOSE 8000

# Command to start the service with debugging enabled for keycloak-connect
CMD ["sh", "-c", "DEBUG=keycloak-connect:* node server.js"]