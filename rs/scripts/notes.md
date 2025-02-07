// Run this in openchat repo to find public key
dfx canister call user_index public_key '(record { })'

dfx build --check

// Deploy for this first time (will create and install the bot)
// Use the OC public key from above and the principal used to run this dfx command
dfx deploy greet_bot --argument '(record { oc_public_key = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0jezZ9Fp975p3OP2ulLzJMxWbXQW\nLJzAYsXMfVynjpHxbyqwfcUS1UENszA0j9NaokOy974lhkgf2+ZHAY1pEg==\n-----END PUBLIC KEY-----\n"; administrator = principal "tu45y-p4p3d-b4gg4-gmyy3-rgweo-whsrq-fephi-vshrn-cipca-xdkri-pae" })'

// Upgrade the bot
dfx canister install --mode upgrade greet_bot --argument '(record { oc_public_key = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0jezZ9Fp975p3OP2ulLzJMxWbXQW\nLJzAYsXMfVynjpHxbyqwfcUS1UENszA0j9NaokOy974lhkgf2+ZHAY1pEg==\n-----END PUBLIC KEY-----\n"; administrator = principal "tu45y-p4p3d-b4gg4-gmyy3-rgweo-whsrq-fephi-vshrn-cipca-xdkri-pae" })'

// Bot endpoint looks like this (replace with your canister id)
http://gc5gl-leaaa-aaaaa-qaara-cai.localhost:8080/
