# SDK for bots built in Rust

Here you can find the base rust SDK for building OpenChat bots with concrete SDKs for canister and offchain bots in their respective folders.

## Contents

This folder contains:

- an [sdk](./sdk/) folder with an abstract SDK for building bots in Rust
- a [canister](./canister/) folder with a concrete SDK for building _canister_ bots in Rust with several example bots
- an [offchain](./offchain/) folder with a concrete SDK for building _offchain_ bots in Rust with several example bots
- a [workspace Cargo.toml](./Cargo.toml) file and a [rust-toolchain.toml](./rust-toolchain.toml) file for the Rust SDKs and example bots
- a [dfx.json](./dfx.json) file config to let dfx know about the example Rust canister bots
