// Run this in openchat repo to find public key
dfx canister call user_index public_key '(record { })'

// Run this to create a canister
dfx canister create greet_bot --no-wallet

// Bot endpoint looks like this (replace with your canister id)
http://gc5gl-leaaa-aaaaa-qaara-cai.raw.localhost:8080
