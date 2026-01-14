import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import InstallationLocation "api/common/installationLocation";
import Permissions "api/common/permissions";
import Base "api/common/base";

module {
    type InstallationLocation = InstallationLocation.InstallationLocation;

    public class InstallationRegistry(records: [(InstallationLocation, InstallationRecord)]) {
        var map : HashMap.HashMap<InstallationLocation, InstallationRecord> = 
            HashMap.fromIter<InstallationLocation, InstallationRecord>(
                records.vals(), 
                10, 
                InstallationLocation.equal, 
                InstallationLocation.hash);

        public func insert(location: InstallationLocation, newRecord: InstallationRecord) {
            switch (map.get(location)) {
                case (?record) {
                    if (newRecord.lastUpdated <= record.lastUpdated) {
                        return;
                    }
                };
                case null {};
            };

            map.put(location, newRecord);
        };

        public func remove(location: InstallationLocation, timestamp: Base.TimestampMillis) {
            let ?record = map.get(location) else {
                return;
            };

            if (timestamp > record.lastUpdated) {
                map.delete(location);
            }
        };

        public func get(location: InstallationLocation) : ?InstallationRecord {
            map.get(location);
        };

        public func entries() : Iter.Iter<(InstallationLocation, InstallationRecord)> {
            map.entries();
        };

        public func count() : Nat {
            map.size();
        };
    };

    public type InstallationRecord = {
        apiGateway: Base.CanisterId;
        grantedCommandPermissions: Permissions.Permissions;
        grantedAutonomousPermissions: Permissions.Permissions;
        lastUpdated : Base.TimestampMillis;
    };
};
