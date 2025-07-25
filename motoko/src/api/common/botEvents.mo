import B "../common/base";
import Chat "../common/chat";
import ChatEvents "../common/chatEvents";
import CommunityEvents "../common/communityEvents";
import InstallationLocation "../common/installationLocation";
import Permissions "../common/permissions";

module {
    type ChatEvent = ChatEvents.ChatEvent;
    type CommunityEvent = CommunityEvents.CommunityEvent;
    type InstallationLocation = InstallationLocation.InstallationLocation; 
    type Permissions = Permissions.RawPermissions;

    public type BotEventWrapper = {
        api_gateway : B.CanisterId;
        event : BotEvent;
        timestamp : B.TimestampMillis;
    };

    public type BotEvent = {
        #Chat : BotChatEvent;
        #Community : BotCommunityEvent;
        #Lifecycle : BotLifecycleEvent;
    };

    public type BotChatEvent = {
        event : ChatEvent;
        chat : Chat.Chat;
        thread : ?B.MessageIndex;
        event_index : B.EventIndex;
        latest_event_index : B.EventIndex;
    };

    public type BotCommunityEvent = {
        event : CommunityEvent;
        community_id : B.CommunityId;
        event_index : B.EventIndex;
        latest_event_index : B.EventIndex;
    };

    public type BotLifecycleEvent = {
        #Registered : BotRegisteredEvent;
        #Installed : BotInstalledEvent;
        #Uninstalled : BotUninstalledEvent;
    };

    public type BotRegisteredEvent = {
        bot_id : B.UserId;
        bot_name : Text;
    };

    public type BotInstalledEvent = {
        installed_by : B.UserId;
        location : InstallationLocation;
        granted_command_permissions : Permissions;
        granted_autonomous_permissions : Permissions;
    };

    public type BotUninstalledEvent = {
        uninstalled_by : B.UserId;
        location : InstallationLocation;
    };
};
