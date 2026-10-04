FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# La app solo escribe en storage/; el resto del código queda en solo lectura para el usuario node.
RUN mkdir -p storage/usuarios && chown -R node:node storage
USER node
EXPOSE 3000
# Tope de memoria de Node: si algo se dispara, el proceso se reinicia en vez de llenar la RAM de la Pi.
CMD ["node", "--max-old-space-size=256", "src/server.js"]
