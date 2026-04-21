FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
ENV NODE_ENV=production
ENV PORT=3070
EXPOSE 3070
CMD ["node", "dist/server.js"]
