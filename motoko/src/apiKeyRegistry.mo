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
        var mapByApiKey = HashMap.HashMap<Text, (Base.CanisterId, InstallationLocation.InstallationLocation)>(10, Text.equal, Text.hash);
        var mapByLocation = HashMap.HashMap<InstallationLocation.InstallationLocation, Text>(10, InstallationLocation.equal, InstallationLocation.hash);

        public func insert(apiKey: Text, apiGateway: Base.CanisterId, location: InstallationLocation.InstallationLocation) {
            // Get the existing apiKey for this location, if any, and remove it from mapByApiKey.
            // This ensures that for a given location, there is only one apiKey.

            switch (mapByLocation.get(location)) {
                case (?existingApiKey) {
                    mapByApiKey.delete(existingApiKey);
                };
                case null {};
            };

            mapByLocation.put(location, apiKey);
            mapByApiKey.put(apiKey, (apiGateway, location));
        };

        public func remove(location: InstallationLocation.InstallationLocation) {
            switch (mapByLocation.remove(location)) {
                case (?apiKey) {
                    mapByApiKey.delete(apiKey);
                };
                case null {};
            };
        };

        public func get(apiKey: Text) : ?(Base.CanisterId, InstallationLocation.InstallationLocation) {
            mapByApiKey.get(apiKey);
        };

        public func iter() : Iter.Iter<ApiKeyRecord> {
            Iter.map<(Text, (Base.CanisterId, InstallationLocation.InstallationLocation)), ApiKeyRecord>(
                mapByApiKey.entries(),
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
            mapByApiKey.size();
        };
    };

    public type ApiKeyRecord = {
        apiKey: Text;
        apiGateway: Base.CanisterId;
        location: InstallationLocation.InstallationLocation;
    };
};
