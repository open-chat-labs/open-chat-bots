import Array "mo:base/Array";

module {
    public func isSubset<T>(a : [T], b : [T], equal : (T, T) -> Bool) : Bool {
        if (a.size() > b.size()) {
            return false;
        };
        
        for (p in a.vals()) {
            if (Array.indexOf(p, b, equal) == null) {
                return false;
            };
        };

        true;
    };
}