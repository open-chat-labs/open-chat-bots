import Result "mo:base/Result";
import Json "mo:json";
import Text "mo:base/Text";
import Iter "mo:base/Iter";
import Blob "mo:base/Blob";
import Debug "mo:base/Debug";
import Nat64 "mo:base/Nat64";
import ECDSA "mo:ecdsa";
import Curve "mo:ecdsa/curve";
import Base64 "mo:base64";
import DER "der";
import Base "../api/common/base";

module {
    public type JWT = {
        claimType : Text;
        expiry : Base.TimestampMillis;
        data : Json.Json;
    };

    public type VerifyError = {
        #parseError : Text;
        #expired : Base.TimestampMillis;
        #invalidSignature;
        #invalidClaims;
    };

    public func verify(jwt : Text, derPublicKey : DER.PublicKey, now : Base.TimestampMillis) : Result.Result<JWT, VerifyError> {
        let base64Engine = Base64.Base64(#v(Base64.V2), ?true);

        // Split JWT into parts
        let parts = Text.split(jwt, #char('.')) |> Iter.toArray(_);

        if (parts.size() != 3) {
            return #err(#parseError("Invalid JWT format"));
        };

        let headerJson = parts[0];
        let claimsJson = parts[1];
        let signatureStr = parts[2];

        // Decode base64url signature to bytes
        let signatureBytes = Blob.fromArray(base64Engine.decode(signatureStr)); // TODO handle error

        // Create message to verify (header + "." + claims)
        let message = Text.concat(headerJson, Text.concat(".", claimsJson));
        let messageBytes = Blob.toArray(Text.encodeUtf8(message));

        let curve = Curve.Curve(#prime256v1);
        let ?publicKey = ECDSA.deserializePublicKeyUncompressed(curve, Blob.fromArray(derPublicKey.key)) else {
            Debug.print("Failed to deserialize public key: " # debug_show (derPublicKey.key));
            Debug.trap("Failed to deserialize public key");
        };
        let ?signature = ECDSA.deserializeSignatureRaw(signatureBytes) else return #err(#invalidSignature);
        let normalizedSig = ECDSA.normalizeSignature(curve, signature);
        let true = ECDSA.verify(curve, publicKey, messageBytes.vals(), normalizedSig) else return #err(#invalidSignature);

        // Decode and parse claims
        let claimsBytes = base64Engine.decode(claimsJson); // TODO handle error
        let ?claimsText = Text.decodeUtf8(Blob.fromArray(claimsBytes)) else return #err(#parseError("Unable to parse claims"));

        switch (Json.parse(claimsText)) {
            case (#err(e)) return #err(#parseError("Invalid claims JSON: " # debug_show (e)));
            case (#ok(claims)) {
                let expiryTimestamp = switch (Json.getAsInt(claims, "exp")) {
                    case (#ok(expInt)) Nat64.fromIntWrap(expInt * 1_000); // seconds to milliseconds
                    case (#err(e)) return #err(#parseError("Invalid 'exp' field in claims: " # debug_show (e)));
                };
                if (expiryTimestamp < now) {
                    return #err(#expired(expiryTimestamp));
                };

                let claimType = switch (Json.getAsText(claims, "claim_type")) {
                    case (#ok(claimTypeText)) claimTypeText;
                    case (#err(e)) return #err(#parseError("Invalid 'claim_type' field in claims: " # debug_show (e)));
                };
                #ok({
                    claimType = claimType;
                    expiry = expiryTimestamp;
                    data = claims;
                })
            };
        };
    };
}