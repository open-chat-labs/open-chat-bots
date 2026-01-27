/**
 * OpenAI tool definitions for the Responses API
 * These tools allow OpenAI to request message history and set up schedules
 */

export const getRecentMessagesTool = {
  type: "function" as const,
  function: {
    name: "get_recent_messages",
    description: "Retrieve recent messages from the OpenChat conversation to analyze and summarize",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of messages to retrieve (1-500)",
        },
      },
      required: ["count"],
    },
  },
};

export const scheduleSummaryTool = {
  type: "function" as const,
  function: {
    name: "schedule_summary",
    description: "Schedule automatic recurring summaries of chat activity",
    parameters: {
      type: "object",
      properties: {
        message_count: {
          type: "number",
          description: "Number of messages to summarize each time",
        },
        frequency: {
          type: "string",
          enum: ["daily", "weekly", "interval"],
          description: "How often to generate summaries",
        },
        time: {
          type: "string",
          description: "Time in 24-hour format (e.g., '09:00') for daily/weekly schedules",
        },
        day_of_week: {
          type: "number",
          description: "Day of week (0=Sunday, 1=Monday, etc.) for weekly schedules",
        },
        interval_hours: {
          type: "number",
          description: "Interval in hours for interval-based schedules",
        },
      },
      required: ["message_count", "frequency"],
    },
  },
};
