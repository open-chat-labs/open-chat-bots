import HashMap "mo:base/HashMap";
import InstallationLocation "api/common/installationLocation";
import Permissions "api/common/permissions";

import Base "api/common/base";

module {
    public class InstallationRegistry() {
        var map = HashMap.HashMap<InstallationLocation.InstallationLocation, InstallationRecord>(10, InstallationLocation.equal, InstallationLocation.hash);

        public func insert(location: InstallationLocation.InstallationLocation, details: InstallationRecord) {
            map.put(location, details);
        };

        public func remove(location: InstallationLocation.InstallationLocation) {
            map.delete(location);
        };

        public func get(location: InstallationLocation.InstallationLocation) : ?InstallationRecord {
            map.get(location)
        };

        public func count() : Nat {
            map.size();
        };
    };

    public type InstallationRecord = {
        apiGateway: Base.CanisterId;
        grantedCommandPermissions: Permissions.Permissions;
        grantedAutonomousPermissions: Permissions.Permissions;
    };
};
