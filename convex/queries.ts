import { query } from "./_generated/server";
import { v } from "convex/values";

export const getActivities = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activities")
      .order("desc")
      .take(args.limit || 20);
  },
});

export const getCalendarEvents = query({
  args: {
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("calendarEvents").order("asc");
    const events = await q.collect();
    if (args.startTime && args.endTime) {
      return events.filter(
        (e) => e.startTime >= args.startTime! && e.startTime <= args.endTime!
      );
    }
    return events;
  },
});

export const getTasks = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("tasks").collect();
  },
});

export const getContacts = query({
  args: { stage: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.stage) {
      return await ctx.db
        .query("contacts")
        .withIndex("by_stage", (q) => q.eq("stage", args.stage!))
        .collect();
    }
    return await ctx.db.query("contacts").collect();
  },
});

export const getContentDrafts = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("contentDrafts")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("contentDrafts").collect();
  },
});

export const getEcosystemProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ecosystemProducts").collect();
  },
});

export const getEcosystemProduct = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("ecosystemProducts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    return products[0] || null;
  },
});
