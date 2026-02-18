import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  activities: defineTable({
    type: v.string(),
    message: v.string(),
    source: v.string(),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),

  calendarEvents: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    startTime: v.number(),
    endTime: v.number(),
    allDay: v.optional(v.boolean()),
    color: v.optional(v.string()),
    location: v.optional(v.string()),
  }).index("by_startTime", ["startTime"]),

  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(), // "pending" | "in_progress" | "completed" | "cancelled"
    priority: v.string(), // "critical" | "high" | "medium" | "low"
    category: v.optional(v.string()),
    assignee: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]).index("by_priority", ["priority"]),

  contacts: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    stage: v.string(), // "prospect" | "lead" | "negotiation" | "active" | "churned"
    value: v.optional(v.number()),
    notes: v.optional(v.string()),
    lastContact: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_stage", ["stage"]),

  contentDrafts: defineTable({
    title: v.string(),
    body: v.optional(v.string()),
    type: v.string(), // "twitter" | "blog" | "newsletter" | "video"
    status: v.string(), // "idea" | "drafting" | "review" | "scheduled" | "published"
    platform: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  ecosystemProducts: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    status: v.string(),
    tech: v.array(v.string()),
    links: v.array(v.object({ label: v.string(), url: v.string() })),
    metrics: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
});
