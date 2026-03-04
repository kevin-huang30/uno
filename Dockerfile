FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "server.js"]
