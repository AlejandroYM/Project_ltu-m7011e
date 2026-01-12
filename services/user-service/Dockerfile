# Usamos una imagen ligera de Node.js
FROM node:18-slim

# Directorio de trabajo
WORKDIR /usr/src/app

# Copiamos solo los archivos de dependencias primero para aprovechar el cache
COPY package*.json ./

# Instalamos dependencias (solo producción para que sea ligero)
RUN npm install --only=production

# Copiamos el resto del código
COPY . .

# Exponemos el puerto definido en tu server.js
EXPOSE 8000

# Comando para arrancar el servicio
CMD ["sh", "-c", "DEBUG=keycloak-connect:* node server.js"]