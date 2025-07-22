import Base "api/common/base";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import InstallationLocation "api/common/installationLocation";
import Iter "mo:base/Iter";

module {
    public func new(apiKeys: [ApiKeyRecord]) : ApiKeyRegistry {
        var registry = ApiKeyRegistry();
        for (record in apiKeys.vals()) {
            registry.insert(record.apiKey, record.apiGateway, record.location);
        };
        registry;
    };

    public class ApiKeyRegistry() {
        var map = HashMap.HashMap<Text, (Base.CanisterId, InstallationLocation.InstallationLocation)>(10, Text.equal, Text.hash);

        public func insert(apiKey: Text, apiGateway: Base.CanisterId, location: InstallationLocation.InstallationLocation) {
            map.put(apiKey, (apiGateway, location));
        };

        public func remove(apiKey: Text) {
            map.delete(apiKey);
        };

        public func get(apiKey: Text) : ?(Base.CanisterId, InstallationLocation.InstallationLocation) {
            map.get(apiKey);
        };

        public func iter() : Iter.Iter<ApiKeyRecord> {
            Iter.map<(Text, (Base.CanisterId, InstallationLocation.InstallationLocation)), ApiKeyRecord>(
                map.entries(),
                func ((apiKey, (apiGateway, location))) : ApiKeyRecord {
                    {
                        apiKey = apiKey;
                        apiGateway = apiGateway;
                        location = location;
                    };
                }
            );        
        };

        public func count() : Nat {
            map.size();
        };
    };

    public type ApiKeyRecord = {
        apiKey: Text;
        apiGateway: Base.CanisterId;
        location: InstallationLocation.InstallationLocation;
    };
};
