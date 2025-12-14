# Базовый образ
FROM node:20-alpine

# Установка рабочей директории
WORKDIR /app

# Установка переменных окружения
ENV NODE_ENV=production

# Создание пользователя и группы для запуска приложения
RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S bot -G nodejs

# Копирование файлов package.json
COPY --chown=bot:nodejs package*.json ./

# Установка зависимостей
RUN npm ci && \
    npm prune --omit=dev && \
    npm cache clean --force

# Копирование исходного кода приложения
COPY --chown=bot:nodejs src ./src

# Создание необходимых директорий и установка прав
RUN mkdir -p /app/logs /app/tmp && \
    chown -R bot:nodejs /app/logs /app/tmp && \
    chmod -R 755 /app/logs

# node_modules должен быть доступен для чтения
RUN chown -R bot:nodejs /app/node_modules 2>/dev/null || true

# Переключение на пользователя bot
USER bot

# Открытие порта
EXPOSE 3000

# Команда для запуска приложения
CMD ["node", "src/index.js"]
