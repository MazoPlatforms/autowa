FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache git openssh-client ca-certificates python3 py3-pip && npm install --no-audit --no-fund
RUN python3 -m pip install --break-system-packages --no-cache-dir telethon==1.42.0
COPY src/server.mjs src/filmgo-bot.mjs src/whatsapp-otp.mjs src/stream-worker.mjs src/telegram_media.py src/telegram_stream.py src/telegram_stream_server.py ./src/
COPY web/ ./web/
COPY tailwind.config.cjs ./tailwind.config.cjs
RUN npm run build:css && npm prune --omit=dev
COPY data/movies.json ./data/movies.json
COPY site/countries.json ./site/countries.json
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
USER node
CMD ["node","src/server.mjs"]
