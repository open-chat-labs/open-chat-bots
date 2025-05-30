const fs = require("fs");
const path = require("path");
const { Secp256k1KeyIdentity } = require("@dfinity/identity-secp256k1");

const pemFilePath = process.argv[2];

if (!pemFilePath) {
    console.error("Usage: node report_principal.js <path-to-pem-file>");
    process.exit(1);
}

try {
    const pemContent = fs.readFileSync(path.resolve(pemFilePath), "utf8");
    const principal = extractPrincipal(pemContent);
    console.log("Principal:", principal);
} catch (error) {
    console.error("Error:", error.message);
}

function extractPrincipal(pem) {
    const privateKeyMatch = pem.match(
        /-----BEGIN EC PRIVATE KEY-----[\s\S]+?-----END EC PRIVATE KEY-----/,
    );
    if (privateKeyMatch) {
        const key = privateKeyMatch[0];
        return Secp256k1KeyIdentity.fromPem(key).getPrincipal().toText();
    }
    throw new Error("Private key not found in PEM file.");
}
