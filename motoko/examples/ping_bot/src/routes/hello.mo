import Http "../sdk/http";
import ResponseBuilder "../sdk/http/responseBuilder";

module {
    public func handler(_request : Http.Request) : Http.Response {
        ResponseBuilder.Builder()
            .withAllowHeaders()
            .with_body("Hello, world!", "text/plain")
            .build();
    };    
}