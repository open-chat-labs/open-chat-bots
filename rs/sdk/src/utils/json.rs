use serde::Serialize;
use std::io::Write;

pub fn serialize_to_json<T: Serialize>(value: T) -> Result<String, serde_json::Error> {
    let bytes = serialize_to_json_bytes(value)?;
    unsafe { Ok(String::from_utf8_unchecked(bytes)) }
}

pub fn serialize_to_json_bytes<T: Serialize>(value: T) -> Result<Vec<u8>, serde_json::Error> {
    let mut buf = Vec::new();
    let mut serializer =
        serde_json::Serializer::with_formatter(&mut buf, LargeNumbersAsStringsFormatter);
    value.serialize(&mut serializer)?;
    Ok(buf)
}

struct LargeNumbersAsStringsFormatter;

const MAX_SAFE_INT: u64 = 9007199254740991;

impl LargeNumbersAsStringsFormatter {
    fn write_str<W: ?Sized + Write>(&mut self, writer: &mut W, value: &str) -> std::io::Result<()> {
        use serde_json::ser::Formatter;

        self.begin_string(writer)?;
        self.write_string_fragment(writer, value)?;
        self.end_string(writer)
    }
}

impl serde_json::ser::Formatter for LargeNumbersAsStringsFormatter {
    fn write_i64<W: ?Sized + Write>(&mut self, writer: &mut W, value: i64) -> std::io::Result<()> {
        if value.unsigned_abs() > MAX_SAFE_INT {
            self.write_str(writer, &value.to_string())
        } else {
            let mut buffer = itoa::Buffer::new();
            let s = buffer.format(value);
            writer.write_all(s.as_bytes())
        }
    }

    fn write_i128<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        value: i128,
    ) -> std::io::Result<()> {
        if value.unsigned_abs() > MAX_SAFE_INT as u128 {
            self.write_str(writer, &value.to_string())
        } else {
            let mut buffer = itoa::Buffer::new();
            let s = buffer.format(value);
            writer.write_all(s.as_bytes())
        }
    }

    fn write_u64<W: ?Sized + Write>(&mut self, writer: &mut W, value: u64) -> std::io::Result<()> {
        if value > MAX_SAFE_INT {
            self.write_str(writer, &value.to_string())
        } else {
            let mut buffer = itoa::Buffer::new();
            let s = buffer.format(value);
            writer.write_all(s.as_bytes())
        }
    }

    fn write_u128<W: ?Sized + Write>(
        &mut self,
        writer: &mut W,
        value: u128,
    ) -> std::io::Result<()> {
        if value > MAX_SAFE_INT as u128 {
            self.write_str(writer, &value.to_string())
        } else {
            let mut buffer = itoa::Buffer::new();
            let s = buffer.format(value);
            writer.write_all(s.as_bytes())
        }
    }
}
