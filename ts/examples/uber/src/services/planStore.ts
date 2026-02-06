import { Plan } from "./planSchema";

type PlanStatus = "proposed" | "approved" | "rejected" | "expired";

type ProposedPlan = {
    plan: Plan;
    status: PlanStatus;
    proposedAt: number;
    proposedBy: string;
};

const store: Map<bigint, ProposedPlan> = new Map();

export function proposePlan(proposedBy: string, messageId: bigint, plan: Plan) {
    const proposal: ProposedPlan = {
        plan,
        status: "proposed",
        proposedAt: +new Date(),
        proposedBy,
    };
    store.set(messageId, proposal);
    console.log("ProposedPlan: ", proposal);
}

export function getPlan(messageId: bigint): Promise<ProposedPlan | undefined> {
    return Promise.resolve(store.get(messageId));
}
