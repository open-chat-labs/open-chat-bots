pub const IC_URL: &str = "https://icp0.io";
pub const OC_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEquEHzJr9605Oy796e4z7LKow46DV\nNUnDOQWavi86vEhRAAfdbVh/Lgmxfi44LPb6S0wnCRm9kI/XdK1DYw2Eaw==\n-----END PUBLIC KEY-----\n";

pub fn mainnet_ic_url() -> String {
    IC_URL.to_string()
}

pub fn mainnet_oc_public_key() -> String {
    OC_PUBLIC_KEY.to_string()
}
