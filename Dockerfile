FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN node scripts/build-pilot.mjs

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 HOKSE_STATIC_DIR=/app/dist-pilot HOKSE_DATABASE=/app/.data/pilot.sqlite HOKSE_ALLOW_SETUP=false
COPY --from=build /app/dist-pilot ./dist-pilot
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
VOLUME ["/app/.data"]
EXPOSE 3001
CMD ["node", "server/main.ts"]
