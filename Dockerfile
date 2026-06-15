FROM node:24-alpine

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY src ./src

# SQLite database lives on a mounted volume in production.
ENV DATABASE_PATH=/data/ffxi-jarvis.db
VOLUME ["/data"]

# Register slash commands on boot (idempotent), then start the bot.
CMD ["sh", "-c", "node src/deploy-commands.js && node src/index.js"]
