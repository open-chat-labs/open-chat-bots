import Array "mo:base/Array";
import Text "mo:base/Text";
import HttpParser "mo:http-parser";
import HttpTypes "mo:http-types";

import Http "lib";
import ResponseBuilder "responseBuilder";

module {
    public class Router() = this {
        var queryRoutes : [QueryRoute] = [];
        var updateRoutes : [UpdateRoute] = [];

        public func get(
            pathExpr : Text,
            handler : QueryHandler,
        ) : Router {
            let route : QueryRoute = {
                pathExpr = pathExpr;
                handler = handler;
            };
            queryRoutes := Array.append(queryRoutes, [route]);
            this;
        };

        public func post(
            pathExpr : Text,
            handler : UpdateHandler,
        ) : Router {
            let route : UpdateRoute = {
                pathExpr = pathExpr;
                handler = handler;
            };
            updateRoutes := Array.append(updateRoutes, [route]);
            this;
        };

        public func handleQuery(request : HttpTypes.UpdateRequest) : HttpTypes.Response {
            switch (request.method) {
                case "POST" upgrade();
                case "GET" mapResponse(handleInnerQuery(request));
                case _ ResponseBuilder.methodNotAllowed();
            };
        };

        public func handleUpdate(request : HttpTypes.UpdateRequest) : async HttpTypes.Response {
            switch (request.method) {
                case "POST" mapResponse(await handleInnerUpdate(request));
                case _ ResponseBuilder.methodNotAllowed();
            };
        };

        func handleInnerQuery(request : HttpTypes.UpdateRequest) : Http.Response {
            let matchingRoute = findMatchingRoute(request, queryRoutes);

            switch (matchingRoute) {
                case (?route) route.handler(request);
                case _ ResponseBuilder.notFound();
            };
        };

        func handleInnerUpdate(request : HttpTypes.UpdateRequest) : async Http.Response {
            let matchingRoute = findMatchingRoute(request, updateRoutes);

            switch (matchingRoute) {
                case (?route) await route.handler(request);
                case _ ResponseBuilder.notFound();
            };
        };

        func findMatchingRoute<R <: Route>(request : HttpTypes.UpdateRequest, routes : [R]) : ?R {
            let lowerPath = HttpParser.parse(request) |> _.url.path.original |> Text.toLowercase _;

            Array.find(
                routes,
                func(route : R) : Bool {
                    doesPathMatch(route.pathExpr, lowerPath);
                },
            );
        };

        func doesPathMatch(pathExpr : Text, path : Text) : Bool {
            switch (Text.stripEnd(pathExpr, #char '*')) {
                case null path == pathExpr;
                case (?prefix) Text.startsWith(path, #text prefix);
            };
        };

        func upgrade() : HttpTypes.Response {
            ResponseBuilder.Builder()
                .withStatus(200)
                .withAllowHeaders()
                .withUpgrade()
                .build();
        };

        func mapResponse(response : Http.Response) : HttpTypes.Response {
            {
                status_code = response.status_code;
                headers = response.headers;
                body = response.body;
                upgrade = null;
                streaming_strategy = null;
            };
        };
    };

    public type UpdateHandler = Http.Request -> async Http.Response;
    public type QueryHandler = Http.Request -> Http.Response;

    type Route = {
        pathExpr : Text;
    };

    public type UpdateRoute = Route and {
        handler : UpdateHandler;
    };

    public type QueryRoute = Route and {
        handler : QueryHandler;
    };
};
