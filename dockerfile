FROM node:20-alpine

WORKDIR /app

# Instala dependencias primero para cache eficiente
COPY package*.json ./
RUN npm ci --only=production

# Copia código
COPY . .

# Seguridad menor: no corras como root
RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Usa el puerto que Cloud Run/VPS exponga
CMD ["node", "src/app.js"]
