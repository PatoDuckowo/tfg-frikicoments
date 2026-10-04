FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# La app solo escribe en storage/; el resto del código queda en solo lectura para el usuario node.
RUN mkdir -p storage/usuarios && chown -R node:node storage
USER node
EXPOSE 3000
CMD ["node", "server.js"]
