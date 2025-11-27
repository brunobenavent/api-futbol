# Usamos una imagen base que ya tiene Chrome y Puppeteer configurados
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# Pasamos a usuario root para poder mover archivos y configurar permisos
USER root

# Directorio de trabajo
WORKDIR /usr/src/app

# Copiamos archivos de configuración
COPY package*.json ./
COPY tsconfig.json ./

# Instalamos dependencias (incluyendo typescript para poder compilar)
RUN npm ci

# Copiamos todo el código fuente
COPY . .

# Compilamos TypeScript a JavaScript (creará la carpeta /dist)
RUN npm run build

# Variables de entorno para que Puppeteer use el Chrome del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Exponemos el puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "dist/server.js"]