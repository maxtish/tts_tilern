FROM node:20-slim

# 1. Устанавливаем системные зависимости
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    bzip2 \
    && rm -rf /var/lib/apt/lists/*

# 2. Устанавливаем Piper (Исправленная ссылка)
# Файл для Linux x86_64 в релизе 1.2.0 называется piper_amd64.tar.gz
RUN curl -fsSL https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz > /tmp/piper.tar.gz \
    && mkdir -p /opt/piper \
    && tar -xzf /tmp/piper.tar.gz -C /opt \
    && rm /tmp/piper.tar.gz \
    && ln -s /opt/piper/piper /usr/bin/piper

WORKDIR /app

# 3. Устанавливаем зависимости Node.js
COPY package*.json ./
RUN npm install

# 4. Копируем проект (не забудьте про .dockerignore, чтобы не копировать лишнее)
COPY . .

# Создаем структуру папок
RUN mkdir -p models/de public

EXPOSE 8400

# Используем npx для запуска ts-node
CMD ["npx", "ts-node", "src/index.ts"]