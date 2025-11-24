import type { DataContent } from "./data";

export type DiamondMembershipStatus = "inactive" | "active" | "lifetime";

export type UserSummary = DataContent & {
    kind: "user" | "bot";
    userId: string;
    username: string;
    displayName: string | undefined;
    suspended: boolean;
    diamondStatus: DiamondMembershipStatus;
    chitBalance: number;
    totalChitEarned: number;
    streak: number;
    maxStreak: number;
    isUniquePerson: boolean;
};
