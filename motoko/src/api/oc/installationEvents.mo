import B "../common/base";
import I "../common/installationLocation";
import P "../common/permissions";

module {
    public type Actor = actor {
        bot_installation_events : (Args) -> async Response;
    };

    public type Args = {
        from : Nat32;
        size : Nat16;
    };

    public type Response = {
        #Success : SuccessResult;
        #Error : B.OCError;
    };

    public type SuccessResult = {
        bot_id : B.UserId;
        events : [BotInstallationEvent];
    };

    public type BotInstallationEvent = {
        #Installed : BotInstalled;
        #Uninstalled : BotUninstalled;
    };

    public type BotInstalled = {
        location : I.InstallationLocation;
        api_gateway : B.CanisterId;
        granted_permissions : P.RawPermissions;
        granted_autonomous_permissions : P.RawPermissions;
        installed_by : B.UserId;
        timestamp : B.TimestampMillis;
    };

    public type BotUninstalled = {
        location : I.InstallationLocation;
        uninstalled_by : B.UserId;
        timestamp : B.TimestampMillis;
    };
};
