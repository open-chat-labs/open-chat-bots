dfx canister create greet_bot --no-wallet
dfx build --check
dfx canister install --mode upgrade greet_bot --argument '(record { oc_public_key = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+ZxdaxdcwII5/ZGNdXLoT85/YdHR\nNfGMDX+7MpEHd6mkhZ2mL3aqapJedhCtoh51mM00ZEXnW+iIMsgKmF832w==\n-----END PUBLIC KEY-----\n"; administrator = principal "tu45y-p4p3d-b4gg4-gmyy3-rgweo-whsrq-fephi-vshrn-cipca-xdkri-pae" })'



dfx build --ic --check
dfx canister install --ic --mode upgrade reminder_bot --argument '(record { oc_public_key = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+ZxdaxdcwII5/ZGNdXLoT85/YdHR\nNfGMDX+7MpEHd6mkhZ2mL3aqapJedhCtoh51mM00ZEXnW+iIMsgKmF832w==\n-----END PUBLIC KEY-----\n"; })'

dfx canister install --mode reinstall reminder_bot --argument '(record { oc_public_key = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9xYDbJlftR8f3b5r343xzFJV3BRl\nyGu1AMSlPAXm5KR4nzSiegu9MjxV5i4XuY7FkRkkNhTeDwNSUVYGrmf5Jw==\n-----END PUBLIC KEY-----\n"; })'


