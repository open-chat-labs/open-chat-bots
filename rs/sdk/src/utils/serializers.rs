use candid::Principal;
use serde::Serializer;

pub fn serialize_u64<S>(value: &u64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if serializer.is_human_readable() {
        serializer.serialize_str(&value.to_string())
    } else {
        serializer.serialize_u64(*value)
    }
}

pub fn serialize_u128<S>(value: &u128, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    if serializer.is_human_readable() {
        serializer.serialize_str(&value.to_string())
    } else {
        serializer.serialize_u128(*value)
    }
}

pub fn serialize_principal_as_bytes<S>(value: &Principal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_bytes(value.as_slice())
}
