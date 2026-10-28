FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache git openssh-client ca-certificates python3 py3-pip && npm install --omit=dev --no-audit --no-fund
RUN python3 -m pip install --break-system-packages --no-cache-dir telethon==1.42.0
COPY src/server.mjs src/whatsapp-otp.mjs src/telegram_media.py ./src/
COPY web/ ./web/
COPY site/countries.json ./site/countries.json
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
USER node
CMD ["node","src/server.mjs"]
