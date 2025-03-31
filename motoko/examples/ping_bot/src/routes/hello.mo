import Http "../sdk/http";
import HttpResponse "../sdk/http/response";

module {
    public func handler(_request : Http.Request) : Http.Response {
        HttpResponse.Builder()
            .withAllowHeaders()
            .with_body("Hello, world!", "text/plain")
            .build();
    };    
}