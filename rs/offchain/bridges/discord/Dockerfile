# Build from rs/, as the bridge is part of its workspace:
#   docker build -f offchain/bridges/discord/Dockerfile -t oc-discord-bridge .
FROM rust:1.99-bookworm AS build
WORKDIR /src
COPY . .
# The workspace's release profile is tuned for small canister wasms rather than speed
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=3 \
    CARGO_PROFILE_RELEASE_LTO=thin \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
RUN cargo build --release -p oc_discord_bridge

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/oc_discord_bridge /usr/local/bin/oc_discord_bridge
ENV PORT=8080
EXPOSE 8080
USER nobody
ENTRYPOINT ["oc_discord_bridge"]
