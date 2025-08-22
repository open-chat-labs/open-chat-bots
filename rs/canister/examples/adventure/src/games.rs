use lazy_static::lazy_static;
use std::collections::BTreeMap;

static BUCCANEERS_CACHE_ZCODE: &[u8] = include_bytes!("./games/buccaneers_cache.z3");
static CATSEYE_ZCODE: &[u8] = include_bytes!("./games/catseye.z3");
static COLOSSAL_CAVE_ZCODE: &[u8] = include_bytes!("./games/colossal_cave.z3");
static DEJAVU_ZCODE: &[u8] = include_bytes!("./games/dejavu.z3");
static DUCKME_ZCODE: &[u8] = include_bytes!("./games/duckme.z3");
static FANTASYDIMENSION_ZCODE: &[u8] = include_bytes!("./games/fantasydimension.z3");
static GUSSDEATH_ZCODE: &[u8] = include_bytes!("./games/gussdeath.z3");
static LIBRARY_OF_HORROR_ZCODE: &[u8] = include_bytes!("./games/library_of_horror.z3");
static MOONGLOW_ZCODE: &[u8] = include_bytes!("./games/moonglow.z3");
static SUBMARINE_SABOTAGE_ZCODE: &[u8] = include_bytes!("./games/submarine-sabotage.z3");
static ZORK_ZCODE: &[u8] = include_bytes!("./games/zork1.z3");

lazy_static! {
    pub static ref GAMES: BTreeMap<&'static str, &'static [u8]> = BTreeMap::from([
        ("Buccaneers Cache", BUCCANEERS_CACHE_ZCODE),
        ("Cat's Eye", CATSEYE_ZCODE),
        ("Colossal Cave", COLOSSAL_CAVE_ZCODE),
        ("Deja Vu", DEJAVU_ZCODE),
        ("Duck Me", DUCKME_ZCODE),
        ("Fantasy Dimension", FANTASYDIMENSION_ZCODE),
        ("Guss Death", GUSSDEATH_ZCODE),
        ("Library of Horror", LIBRARY_OF_HORROR_ZCODE),
        ("Moonglow", MOONGLOW_ZCODE),
        ("Submarine Sabotage", SUBMARINE_SABOTAGE_ZCODE),
        ("Zork", ZORK_ZCODE),
    ]);
}
