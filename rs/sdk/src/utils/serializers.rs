use candid::Principal;
use serde::Serializer;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: u128 = 9007199254740991u128;

pub fn serialize_large_uint<T: Into<u128> + Copy, S>(
    value: &T,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let value_u128 = (*value).into();
    if value_u128 > MAX_SAFE_INTEGER && serializer.is_human_readable() {
        serializer.serialize_str(&value_u128.to_string())
    } else {
        serializer.serialize_u128(value_u128)
    }
}

pub fn serialize_principal_as_bytes<S>(value: &Principal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_bytes(value.as_slice())
}
