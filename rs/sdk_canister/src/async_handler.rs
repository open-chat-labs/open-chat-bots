use std::future::Future;
use std::ops::Deref;
use std::pin::Pin;

pub(crate) struct BoxedHandler<Req, Res>(Box<dyn ErasedHandler<Req, Res>>);

impl<Req, Res> BoxedHandler<Req, Res> {
    pub(crate) fn new<H: AsyncHandler<Req, Res>>(handler: H) -> Self {
        Self(Box::new(MakeErasedHandler::new(handler)))
    }
}

pub(crate) trait ErasedHandler<Req, Res>: Send + Sync {
    fn call(&self, request: Req) -> Pin<Box<dyn Future<Output = Res>>>;
}

struct MakeErasedHandler<H> {
    handler: H,
}

impl<H> MakeErasedHandler<H> {
    fn new(handler: H) -> Self {
        Self { handler }
    }
}

impl<H: AsyncHandler<Req, Res>, Req, Res> ErasedHandler<Req, Res> for MakeErasedHandler<H> {
    fn call(&self, request: Req) -> Pin<Box<dyn Future<Output = Res>>> {
        Box::pin(self.handler.clone().call(request))
    }
}

pub trait AsyncHandler<Req, Res>: Clone + Send + Sync + Sized + 'static {
    type Future: Future<Output = Res> + Send + 'static;

    fn call(self, request: Req) -> Self::Future;
}

impl<F, Fut, Req, Res> AsyncHandler<Req, Res> for F
where
    F: Fn(Req) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Res> + Send,
    Req: Send + 'static,
    Res: 'static,
{
    type Future = Pin<Box<dyn Future<Output = Res> + Send>>;

    fn call(self, request: Req) -> Self::Future {
        Box::pin(async move { self.clone()(request).await })
    }
}

impl<Req, Res> Deref for BoxedHandler<Req, Res> {
    type Target = dyn ErasedHandler<Req, Res>;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}
