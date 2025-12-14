FROM node:20-alpine

RUN addgroup -g 1001 -S app && \
    adduser -u 1001 -S app -G app

WORKDIR /app

ENV NODE_ENV=production

COPY --chown=app:app package*.json ./

RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

COPY --chown=app:app src ./src

RUN mkdir -p /app/logs && \
    chown -R app:app /app && \
    chmod -R 755 /app/logs

USER app

EXPOSE 3000

CMD ["node", "src/index.js"]