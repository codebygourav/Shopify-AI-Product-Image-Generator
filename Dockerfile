# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
  npm ci --prefer-offline --no-audit --fund=false

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
  npm prune --omit=dev --no-audit --fund=false

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
EXPOSE 3000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public

CMD ["npm", "run", "start"]
