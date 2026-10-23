# Build from rs/, as the bridge is part of its workspace:
#   docker build -f offchain/bridges/twitch/Dockerfile -t oc-twitch-bridge .
FROM rust:1.99.0-bookworm AS build
WORKDIR /src
COPY . .
# The workspace's release profile is tuned for small canister wasms rather than speed
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=3 \
    CARGO_PROFILE_RELEASE_LTO=thin \
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
RUN cargo build --release --locked -p oc_twitch_bridge

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/oc_twitch_bridge /usr/local/bin/oc_twitch_bridge
ENV PORT=8080
EXPOSE 8080
USER nobody
ENTRYPOINT ["oc_twitch_bridge"]
