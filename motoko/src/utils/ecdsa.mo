import Debug "mo:base/Debug";
import ECDSA "mo:ecdsa";
import PublicKey "mo:ecdsa/PublicKey";

module {
    public func parsePublicKeyOrTrap(key : Text) : ECDSA.PublicKey {
        switch (PublicKey.fromText(key # "\n", #pem { byteEncoding = #spki })) {
            case (#ok(publicKey)) {
                publicKey;
            };
            case (#err(err)) {
                Debug.trap("Failed to parse public key: " #err);
            };
        };
    };
};
