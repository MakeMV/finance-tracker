FROM node:26-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first: this layer is cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

# The SQLite file lives in /app/data; mount a volume there to keep data between restarts.
RUN mkdir -p data && chown node:node data
ENV PORT=3000 DB_FILE=/app/data/finance.db
EXPOSE 3000

# Don't run as root inside the container.
USER node
CMD ["node", "src/server.js"]
