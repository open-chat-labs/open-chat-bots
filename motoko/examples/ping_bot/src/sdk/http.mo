import Array "mo:base/Array";
import Blob "mo:base/Blob";
import HttpTypes "mo:http-types";
import HttpParser "mo:http-parser";
import Response "http/response";
import Text "mo:base/Text";

module {
    public type Request = {
        url: Text;
        body: Blob;
        headers: [(Text, Text)];
    };

    public type Response = {
        status_code : Nat16;
        headers : [(Text, Text)];
        body: Blob;
    };
    
    public class Router<S>(state: S) = this {
        var queryRoutes : [QueryRoute<S>] = [];
        var updateRoutes : [UpdateRoute<S>] = [];

        public func get(
            pathExpr : Text,
            handler: QueryHandler<S>
        ) : Router<S> {
            let route: QueryRoute<S> = {
                pathExpr = pathExpr;
                handler = handler;
            };
            queryRoutes := Array.append(queryRoutes, [route]);
            this;
        };

        public func post(
            pathExpr : Text,
            handler: UpdateHandler<S>
        ) : Router<S> {
            let route: UpdateRoute<S> = {
                pathExpr = pathExpr;
                handler = handler;
            };
            updateRoutes := Array.append(updateRoutes, [route]);
            this;
        };

        public func handleQuery(request: HttpTypes.UpdateRequest) : HttpTypes.Response {
            switch (request.method) {
                case ("POST") {
                    upgrade();
                };
                case ("GET") {
                    mapResponse(handleInnerQuery(request));
                };
                case (_) {
                    Response.methodNotAllowed();
                };
            };            
        };

        public func handleUpdate(request: HttpTypes.UpdateRequest) : async HttpTypes.Response {
            switch (request.method) {
                case ("POST") {
                    mapResponse(await handleInnerUpdate(request));
                };
                case (_) {
                    Response.methodNotAllowed();
                };
            };            
        };

        func handleInnerQuery(request: HttpTypes.UpdateRequest) : Response {
            let matchingRoute = findMatchingRoute(request, queryRoutes);
            
            switch (matchingRoute) {
                case (?route) {
                    route.handler(request, state);
                };
                case _ {
                    Response.notFound();
                };
            };
        };

        func handleInnerUpdate(request: HttpTypes.UpdateRequest) : async Response {
            let matchingRoute = findMatchingRoute(request, updateRoutes);
            
            switch (matchingRoute) {
                case (?route) {
                    await route.handler(request, state);
                };
                case _ {
                    Response.notFound();
                };
            };
        };

        func findMatchingRoute<R <: Route>(request: HttpTypes.UpdateRequest, routes: [R]) : ?R {
            let lower_path = HttpParser.parse(request) |> _.url.path.original |> Text.toLowercase _;

            Array.find(routes, func(route : R) : Bool  {
                doesPathMatch(route.pathExpr, lower_path);
            });
        };

        func doesPathMatch(pathExpr: Text, path: Text) : Bool {
            switch (Text.stripEnd(pathExpr, #char '*')) {
                case null path == pathExpr;
                case (?prefix) Text.startsWith(path, #text prefix);
            };
        };

        func upgrade(): HttpTypes.Response {
            Response.Builder()
                .withStatus(200)
                .withAllowHeaders()
                .withUpgrade()
                .build();
        };

        func mapResponse(response: Response) : HttpTypes.Response {
            {
                status_code = response.status_code;
                headers = response.headers;
                body = response.body;
                upgrade = null;
                streaming_strategy = null;
            };
        };        
    };

    public type UpdateHandler<S> = (Request, S) -> async Response;
    public type QueryHandler<S> = (Request, S) -> Response;

    type Route = {
        pathExpr : Text;
    };

    public type UpdateRoute<S> = Route and {
        handler : UpdateHandler<S>;
    };

    public type QueryRoute<S> = Route and {
        handler : QueryHandler<S>;
    };
};