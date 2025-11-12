# formWeBack/Dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
# usa ci para reproducibilidad; si no tienes package-lock.json, cambia a `npm install --omit=dev`
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
