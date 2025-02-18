use candid::Principal;
use serde::Serializer;

pub fn serialize_u128<T: Into<u128> + Copy, S>(value: &T, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let value_u128 = (*value).into();
    if value_u128 > u32::MAX as u128 && serializer.is_human_readable() {
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
