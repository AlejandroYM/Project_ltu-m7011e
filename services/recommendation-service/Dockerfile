FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8000
# Make sure to change the port to 3003 for the recommendation-service
CMD ["node", "server.js"]