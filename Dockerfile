# 1. Usamos la imagen oficial de Puppeteer (ya trae Node + Chrome instalados)
FROM ghcr.io/puppeteer/puppeteer:21.5.0

# 2. Cambiamos a usuario root para tener permisos de escritura al instalar
USER root

# 3. Directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# 4. Copiamos los archivos de configuración primero (para aprovechar la caché de Docker)
COPY package*.json ./
COPY tsconfig.json ./

# 5. Instalamos dependencias
# IMPORTANTE: Usamos 'npm install' en lugar de 'npm ci' para evitar tus errores de lockfile
RUN npm install

# 6. Copiamos el resto del código fuente
COPY . .

# 7. Compilamos TypeScript a JavaScript (crea la carpeta dist/)
RUN npm run build

# 8. Configuración de entorno para Puppeteer
# - No descargar Chrome otra vez (ya lo tiene la imagen)
# - Decirle dónde está el Chrome instalado (/usr/bin/google-chrome-stable)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 9. Exponemos el puerto
EXPOSE 3000

# 10. Comando para arrancar la app compilada
CMD ["node", "dist/server.js"]