import Http "../sdk/http";
import HttpResponse "../sdk/http/response";
import Router "state";

module {
    public func handler(_request : Http.Request, _state : ?Router.State) : Http.Response {
        HttpResponse.Builder()
            .withAllowHeaders()
            .with_body("Hello, world!", "text/plain")
            .build();
    };    
}