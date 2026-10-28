FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src/server.mjs ./src/server.mjs
COPY web/ ./web/
COPY site/countries.json ./site/countries.json
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
USER node
CMD ["node","src/server.mjs"]
