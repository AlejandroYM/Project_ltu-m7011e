# Etapa 1: Construcción (Build)
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Etapa 2: Servidor de Producción (Nginx)
FROM nginx:alpine
# Copiamos los archivos construidos por Vite a la carpeta de Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Añadimos una configuración básica para que React Router funcione
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]