FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3002
# Asegúrate de cambiar el puerto a 3003 para el recommendation-service
CMD ["node", "server.js"]