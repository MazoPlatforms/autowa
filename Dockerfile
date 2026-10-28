FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN apk add --no-cache git openssh-client ca-certificates && npm install --omit=dev --no-audit --no-fund
COPY src/server.mjs src/whatsapp-otp.mjs ./src/
COPY web/ ./web/
COPY site/countries.json ./site/countries.json
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
USER node
CMD ["node","src/server.mjs"]
