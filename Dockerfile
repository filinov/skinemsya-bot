# Production image for the Telegram bot
FROM node:20-alpine

# Create app user and directory
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

ENV NODE_ENV=production

# Install dependencies
COPY --chown=app:app package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

# Copy source code
COPY --chown=app:app src ./src

USER app
EXPOSE 3000

CMD ["node", "src/index.js"]
