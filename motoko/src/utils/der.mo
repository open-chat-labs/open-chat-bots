import Text "mo:base/Text";
import Nat8 "mo:base/Nat8";
import Iter "mo:base/Iter";
import Nat "mo:base/Nat";
import Base64 "mo:base64";
import Buffer "mo:base/Buffer";
import Debug "mo:base/Debug";
import IterTools "mo:itertools/Iter";

module {
    public type AlgorithmIdentifier = {
        oid : Text; // Main algorithm OID (e.g. "1.3.132.0.10")
        parameters : ?Text; // Optional parameters OID
    };

    public type PublicKey = {
        key : [Nat8]; // The actual public key bytes
        algorithm : AlgorithmIdentifier;
    };

    public func parsePublicKeyOrTrap(key : Text) : PublicKey {
        let ?derPublicKey = parsePublicKey(key) else Debug.trap("Failed to parse public key");

        if (derPublicKey.algorithm.oid != "1.2.840.10045.2.1") {
            Debug.trap("Invalid public key algorithm OID");
        };

        if (derPublicKey.algorithm.parameters != ?"1.2.840.10045.3.1.7") {
            Debug.trap("Invalid public key algorithm parameters OID");
        };

        return derPublicKey;
    };

    public func parsePublicKey(key : Text) : ?PublicKey {

        // First normalize line endings
        let normalizedKey = Text.replace(key, #text("\r\n"), "\n");

        // Split and clean more carefully
        let lines = Iter.toArray(
            Iter.filter(
                Text.split(normalizedKey, #text("\n")),
                func(line : Text) : Bool {
                    let trimmed = Text.trim(line, #char(' '));
                    trimmed.size() > 0 and not Text.startsWith(trimmed, #text("-----"));
                },
            )
        );

        let derText = Text.join("", lines.vals());

        // Add debug output to check base64 content
        if (derText.size() == 0) {
            return null;
        };

        // Continue with DER parsing...
        return parseDERPublicKey(derText);
    };

    /// Parse DER length field, returns (length, number of bytes used)
    private func parseDerLength(bytes : Iter.Iter<Nat8>) : ?Nat {

        let ?first = bytes.next() else return null;

        if (first < 0x80) {
            // Short form
            return ?Nat8.toNat(first);
        };

        // Long form
        let numBytes = Nat8.toNat(first & 0x7F);

        var length = 0;
        for (i in Iter.range(0, numBytes - 1)) {
            let ?byte = bytes.next() else return null;
            length := length * 256 + Nat8.toNat(byte);
        };

        return ?length;
    };

    private func decodeOid(bytes : Iter.Iter<Nat8>, checkType : Bool) : ?Text {
        if (checkType) {
            // Parse algorithm OID
            let ?oidTag = bytes.next() else return null;
            if (oidTag != 0x06) {
                return null;
            };
        };

        let ?oidLength = parseDerLength(bytes) else return null;

        let ?first = bytes.next() else return null;
        let components = Buffer.Buffer<Text>(6);
        // First two components are derived from the first byte
        components.add(Nat.toText(Nat8.toNat(first) / 40));
        components.add(Nat.toText(Nat8.toNat(first) % 40));

        var value : Nat = 0;
        var bytesRead = 1;

        while (bytesRead < oidLength) {
            let ?byte = bytes.next() else return null;
            bytesRead += 1;

            if (byte >= 0x80) {
                // This is a continuation byte
                value := value * 128 + Nat8.toNat(byte & 0x7F);
            } else {
                // This is the last byte of this component
                value := value * 128 + Nat8.toNat(byte);
                components.add(Nat.toText(value));
                value := 0;
            };
        };

        return ?Text.join(".", components.vals());
    };

    /// Helper function to parse DER encoded public key
    private func parseDERPublicKey(derText : Text) : ?PublicKey {

        let base64Engine = Base64.Base64(#v(Base64.V2), ?true);
        let bytesArray = base64Engine.decode(derText);
        let bytes = bytesArray.vals();

        // Parse outer SEQUENCE
        let ?outerSeqTag = bytes.next() else return null;
        if (outerSeqTag != 0x30) return null;
        let ?_outerSeqLength = parseDerLength(bytes) else return null;
        let ?innerSeqTag = bytes.next() else return null;
        if (innerSeqTag != 0x30) return null;
        let ?_innerSeqLength = parseDerLength(bytes) else return null;
        let ?oid = decodeOid(bytes, true) else return null;
        let ?nextType = bytes.next() else return null;
        let (parametersOid, nextTypeOrNull) = switch (nextType) {
            case (0x06) {

                let ?pOid = decodeOid(bytes, false) else return null;
                (?pOid, bytes.next());
            };
            case (_) (null, ?nextType);
        };

        // Parse BIT STRING
        let ?pkTag = nextTypeOrNull else return null;
        if (pkTag != 0x03) return null;
        let ?_pkLength = parseDerLength(bytes) else return null;

        let keyBytes = bytes |> IterTools.skipWhile(_, func(byte : Nat8) : Bool = byte == 0) |> Iter.toArray(_); // Get rest of the bytes

        return ?{
            key = keyBytes;
            algorithm = {
                oid = oid;
                parameters = parametersOid;
            };
        };
    };
};
