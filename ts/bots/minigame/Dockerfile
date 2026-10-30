# Builds MiniGameBot with the SDK beside it. Build from the `ts` directory:
#   docker build -f bots/minigame/Dockerfile -t minigame-bot .
FROM node:22-alpine AS build
WORKDIR /src

# The SDK first, so that its install and build are cached while the bot changes
COPY library/package.json library/package-lock.json library/
RUN cd library && npm ci --no-audit --no-fund --ignore-scripts
COPY library/ library/
RUN cd library && npm run build && npm prune --omit=dev --ignore-scripts

COPY bots/minigame/package.json bots/minigame/package-lock.json bots/minigame/
RUN cd bots/minigame && npm ci --no-audit --no-fund
COPY bots/minigame/ bots/minigame/
RUN cd bots/minigame && npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
ENV NODE_ENV=production PORT=3100 DATA_FILE=/data/games.json APP_DIR=/app/bots/minigame/dist/app
WORKDIR /app
# The SDK, which the bot's node_modules link to as ../../library
COPY --from=build /src/library/package.json library/
COPY --from=build /src/library/lib/ library/lib/
COPY --from=build /src/library/node_modules/ library/node_modules/
COPY --from=build /src/bots/minigame/package.json bots/minigame/
COPY --from=build /src/bots/minigame/node_modules/ bots/minigame/node_modules/
COPY --from=build /src/bots/minigame/dist/ bots/minigame/dist/
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3100
WORKDIR /app/bots/minigame
CMD ["node", "dist/server/server.js"]
