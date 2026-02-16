import { BotClient, ChannelIdentifier } from "@open-ic/openchat-botclient-ts";
import { changeRole } from "./changeRole";
import { createChannel } from "./createChannel";
import { deleteChannel } from "./deleteChannel";
import { deleteMessage } from "./messageDeleter";
import { reactToMessage, reactToMessages } from "./messageReactor";
import { Plan } from "./planSchema";
import { replyToMessage } from "./replyToMessage";

type PlanStatus = "proposed" | "approved" | "rejected" | "expired";

type ProposedPlan = {
    plan: Plan;
    status: PlanStatus;
    proposedAt: number;
    proposedBy: string;
};

const store: Map<string, ProposedPlan> = new Map();

export function proposePlan(proposedBy: string, messageId: bigint, plan: Plan) {
    const proposal: ProposedPlan = {
        plan,
        status: "proposed",
        proposedAt: +new Date(),
        proposedBy,
    };
    store.set(messageId.toString(), proposal);
}

export function getPlan(messageId: bigint): Promise<ProposedPlan | undefined> {
    return Promise.resolve(store.get(messageId.toString()));
}

export function removePlan(messageId: bigint): Promise<boolean> {
    const removed = store.delete(messageId.toString());
    return Promise.resolve(removed);
}

export async function executePlan(client: BotClient, { plan }: ProposedPlan): Promise<void> {
    for (const step of plan.steps) {
        switch (step.action) {
            case "change_role":
                await changeRole(client, step.userId, step.role);
                break;
            case "create_channel":
                // Note this doesn't have enough information any more as we are in autonomous scope
                await createChannel(client, step.name, step.description, step.isPublic);
                break;
            case "delete_channel":
                // Note this doesn't have enough information any more as we are in autonomous scope
                await deleteChannel(client, new ChannelIdentifier("", BigInt(step.channelId)));
                break;
            case "reply_to_message":
                await replyToMessage(client, Number(step.eventIndex), step.reply);
                break;
            case "delete_message":
                await deleteMessage(client, BigInt(step.messageId));
                break;
            case "react_to_message":
                await reactToMessage(client, BigInt(step.messageId), step.reaction);
                break;
            case "react_to_messages":
                await reactToMessages(client, step.messageIds.map(BigInt), step.reaction);
                break;
        }
    }
    return Promise.resolve();
}
