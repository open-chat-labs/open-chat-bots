use rand::distributions::Standard;
use rand::prelude::Distribution;
use rand::rngs::StdRng;
use rand::Rng;
use rand::SeedableRng;
use std::cell::RefCell;

thread_local! {
    static RNG: RefCell<Option<StdRng>> = RefCell::default();
}

const RNG_NOT_INITIALIZED: &str = "RNG has not been initialized";

pub fn set(seed: [u8; 32]) {
    RNG.with_borrow_mut(|s| {
        *s = Some(StdRng::from_seed(seed));
    })
}

pub fn gen<T>() -> T
where
    Standard: Distribution<T>,
{
    RNG.with_borrow_mut(|s| s.as_mut().expect(RNG_NOT_INITIALIZED).gen::<T>())
}

pub fn mutate<F: FnOnce(&mut StdRng) -> R, R>(f: F) -> R {
    RNG.with_borrow_mut(|s| f(s.as_mut().expect(RNG_NOT_INITIALIZED)))
}
