import { mutation } from "./_generated/server";

export const seedAll = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Activities
    const activities = [
      { type: "system", message: "Agent runtime started", source: "gateway", timestamp: now - 3600000 },
      { type: "chat", message: "New conversation with Donal", source: "telegram", timestamp: now - 1800000 },
      { type: "task", message: "Completed weekly report generation", source: "cron", timestamp: now - 900000 },
      { type: "system", message: "Heartbeat check passed", source: "monitor", timestamp: now - 300000 },
      { type: "content", message: "Draft saved: Trueshot Launch Thread", source: "agent", timestamp: now - 600000 },
    ];
    for (const a of activities) await ctx.db.insert("activities", a);

    // Calendar Events
    const events = [
      { title: "Team Standup", startTime: now + 3600000, endTime: now + 5400000, color: "#6366f1" },
      { title: "Trueshot Review", startTime: now + 86400000, endTime: now + 90000000, color: "#22c55e" },
      { title: "Content Planning", startTime: now + 172800000, endTime: now + 176400000, color: "#eab308" },
    ];
    for (const e of events) await ctx.db.insert("calendarEvents", e);

    // Tasks
    const tasks = [
      { title: "Ship Mission Control v1", status: "in_progress", priority: "high", category: "Product", createdAt: now - 86400000, updatedAt: now },
      { title: "Review PR #42", status: "pending", priority: "medium", category: "Code", createdAt: now - 3600000, updatedAt: now },
      { title: "Update SOUL.md", status: "completed", priority: "low", category: "Ops", createdAt: now - 172800000, updatedAt: now - 86400000 },
      { title: "Trueshot beta testing", status: "pending", priority: "critical", category: "Product", createdAt: now - 43200000, updatedAt: now },
    ];
    for (const t of tasks) await ctx.db.insert("tasks", t);

    // Contacts
    const contacts = [
      { name: "Alex Chen", company: "TechCorp", stage: "active", value: 5000, createdAt: now - 2592000000, lastContact: now - 86400000 },
      { name: "Sarah Williams", company: "StartupXYZ", stage: "negotiation", value: 3000, createdAt: now - 1296000000, lastContact: now - 172800000 },
      { name: "James Liu", company: "DataFlow", stage: "prospect", createdAt: now - 432000000, lastContact: now - 432000000 },
      { name: "Maya Patel", company: "CloudNine", stage: "lead", value: 8000, createdAt: now - 864000000, lastContact: now - 259200000 },
    ];
    for (const c of contacts) await ctx.db.insert("contacts", c);

    // Content Drafts
    const drafts = [
      { title: "Trueshot Launch Thread", type: "twitter", status: "drafting", platform: "Twitter", tags: ["product", "launch"], createdAt: now - 172800000, updatedAt: now - 3600000 },
      { title: "AI Agent Architecture", type: "blog", status: "idea", platform: "Blog", tags: ["technical"], createdAt: now - 86400000, updatedAt: now - 86400000 },
      { title: "Weekly Update #12", type: "newsletter", status: "review", platform: "Newsletter", tags: ["update"], createdAt: now - 43200000, updatedAt: now - 7200000 },
    ];
    for (const d of drafts) await ctx.db.insert("contentDrafts", d);

    // Ecosystem Products
    const products = [
      { slug: "trueshot", name: "Trueshot", description: "Photo authenticity platform", status: "beta", tech: ["React Native", "Base", "NFT"], links: [{ label: "Website", url: "https://trueshot.io" }], createdAt: now - 7776000000 },
      { slug: "openclaw", name: "OpenClaw", description: "AI agent infrastructure", status: "active", tech: ["Node.js", "TypeScript", "Claude"], links: [], createdAt: now - 2592000000 },
    ];
    for (const p of products) await ctx.db.insert("ecosystemProducts", p);

    return { seeded: true, counts: { activities: activities.length, events: events.length, tasks: tasks.length, contacts: contacts.length, drafts: drafts.length, products: products.length } };
  },
});
