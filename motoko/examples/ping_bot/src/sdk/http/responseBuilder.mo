import Blob "mo:base/Blob";
import HttpTypes "mo:http-types";
import Json "mo:json";
import List "mo:base/List";
import Nat "mo:base/Nat";
import Text "mo:base/Text";

module {
    public class Builder() = this {
        var statusCode: Nat16 = 200;
        var headers = List.nil<(Text, Text)>();
        var body: Blob = Blob.fromArray([]);
        var upgrade: ?Bool = ?false;

        public func withStatus(code: Nat16) : Builder {
            statusCode := code;
            this;
        };

        public func addHeader(key: Text, value: Text) : Builder {
            headers := List.push((key, value), headers);
            this;
        };

        public func withAllowHeaders() : Builder {
            headers := List.push(("Access-Control-Allow-Origin", "*"), headers);
            headers := List.push(("Access-Control-Allow-Headers", "*"), headers);
            this;
        };

        public func withJson(json: Json.Json) : Builder {
            Json.stringify(json, null) |> Text.encodeUtf8(_) |> withBody(_, "application/json");
        };

        public func withBody(blob: Blob, mime_type: Text) : Builder {
            body := blob;
            headers := List.push(("content-Type", mime_type), headers);
            headers := List.push(("content-length", Nat.toText(body.size())), headers);
            this;
        };

        public func withUpgrade() : Builder {
            upgrade := ?true;
            this;
        };

        public func build() : HttpTypes.Response {
            {
                status_code = statusCode;
                headers = List.toArray(headers);
                body = body;
                upgrade = upgrade;
                streaming_strategy = null;
            };
        };
    };

    public func json(status: Nat16, json: Json.Json) : HttpTypes.Response {
        Builder()
            .withStatus(status)
            .withAllowHeaders()
            .withJson(json)
            .build();
    };

    public func notFound() : HttpTypes.Response {
        Builder()
            .withStatus(404)
            .build();
    };

    public func methodNotAllowed() : HttpTypes.Response {
        Builder()
            .withStatus(405)
            .build();
    };
}