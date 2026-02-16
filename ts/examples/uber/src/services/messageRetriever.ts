import { BotClient } from "@open-ic/openchat-botclient-ts";
import { ChatMessage } from "../types";

// TODO - this should _probably_ ignore messages that been sent by the bot itself
export async function getRecentMessages(client: BotClient, count: number): Promise<ChatMessage[]> {
    const maxCount = Math.min(count, 300);

    try {
        const chatSummary = await client.chatSummary();
        if (chatSummary.kind === "error") {
            console.error("Failed to get chat summary:", chatSummary);
            return [];
        }

        const response = await client.chatEvents({
            kind: "chat_events_page",
            startEventIndex: chatSummary.latestEventIndex,
            ascending: false, // Newest first
            maxEvents: maxCount * 2,
            maxMessages: maxCount,
        });

        if (response.kind !== "success") {
            console.error("Failed to retrieve chat events:", response);
            return [];
        }

        const messages: ChatMessage[] = [];

        for (const eventWrapper of response.events) {
            if (
                eventWrapper.event.kind === "message" &&
                eventWrapper.event.content.kind === "text_content"
            ) {
                messages.push({
                    sender: eventWrapper.event.sender,
                    text: eventWrapper.event.content.text,
                    timestamp: eventWrapper.timestamp,
                    messageIndex: eventWrapper.event.messageIndex,
                    messageId: eventWrapper.event.messageId,
                    eventIndex: eventWrapper.index,
                });

                // Stop once we have enough messages
                if (messages.length >= maxCount) {
                    break;
                }
            }
        }

        return messages.reverse();
    } catch (error) {
        console.error("Error retrieving messages:", error);
        return [];
    }
}
