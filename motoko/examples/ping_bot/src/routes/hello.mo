import Http "../sdk/http";
import ResponseBuilder "../sdk/http/response_builder";

module {
    public func handler(_request : Http.Request) : Http.Response {
        ResponseBuilder.Builder()
            .withAllowHeaders()
            .with_body("Hello, world!", "text/plain")
            .build();
    };    
}