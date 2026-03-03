// @ts-nocheck
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Seed the database with realistic test data for Club Allenby.
 *
 * This mutation is idempotent — if any members already exist, it skips entirely.
 * Run via: npx convex run seed/seedData:seed
 *
 * Creates:
 *   - 1 admin (for triggeredBy references)
 *   - 10 members (Jewish singles in Miami/NYC/LA)
 *   - 6 matches in various workflow states
 *   - 10 feedback entries
 *   - 20 WhatsApp messages
 *   - 8 audit log entries
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // -----------------------------------------------------------------------
    // Idempotency guard — skip if data already exists
    // -----------------------------------------------------------------------
    const existingMembers = await ctx.db.query("members").first();
    if (existingMembers) {
      console.log("Seed data already exists — skipping.");
      return { seeded: false, reason: "data_already_exists" };
    }

    const now = Date.now();
    const DAY = 86_400_000;
    const FIFTEEN_DAYS = 15 * DAY;

    // Helper: deterministic timestamp N days ago from now
    const daysAgo = (n: number) => now - n * DAY;

    // -----------------------------------------------------------------------
    // 1. Admin (needed for matches.triggeredBy)
    // -----------------------------------------------------------------------
    const adminId = await ctx.db.insert("admins", {
      email: "dani@cluballenby.com",
      passwordHash: "$2b$10$seedhashdoesnotmatterfordevpurposes00000000000000",
      name: "Dani Bergman",
      role: "super_admin",
      status: "active",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90),
    });

    // -----------------------------------------------------------------------
    // 2. Members (10 realistic Club Allenby profiles)
    // -----------------------------------------------------------------------
    const memberData = [
      {
        smaId: "sma_client_001",
        firstName: "Sarah",
        lastName: "Levinson",
        email: "sarah.levinson@gmail.com",
        phone: "+13055551201",
        whatsappId: "+13055551201",
        tier: "vip" as const,
        profileComplete: true,
        matchmakerNotes: "Very engaged member. Attends every Shabbat dinner. Looking for someone equally observant. Works in tech — flexible schedule.",
        rejectionCount: 1,
        status: "active" as const,
        lastSyncedAt: daysAgo(1),
        createdAt: daysAgo(45),
        updatedAt: daysAgo(1),
      },
      {
        smaId: "sma_client_002",
        firstName: "David",
        lastName: "Cohen",
        email: "david.cohen@outlook.com",
        phone: "+13055551202",
        whatsappId: "+13055551202",
        tier: "member" as const,
        profileComplete: true,
        matchmakerNotes: "Relocated to Miami from NYC 6 months ago. Still has NYC network. Real estate developer. Prefers 28-35 age range.",
        rejectionCount: 0,
        status: "active" as const,
        lastSyncedAt: daysAgo(2),
        createdAt: daysAgo(30),
        updatedAt: daysAgo(2),
      },
      {
        smaId: "sma_client_003",
        firstName: "Rebecca",
        lastName: "Goldstein",
        email: "rebecca.goldstein@yahoo.com",
        phone: "+12125551203",
        whatsappId: "+12125551203",
        tier: "member" as const,
        profileComplete: true,
        matchmakerNotes: "Lives in NYC but open to Miami. Attorney at a top firm. Has attended two speed dating events. Prefers someone ambitious and family-oriented.",
        rejectionCount: 2,
        status: "active" as const,
        lastSyncedAt: daysAgo(3),
        createdAt: daysAgo(60),
        updatedAt: daysAgo(3),
      },
      {
        smaId: "sma_client_004",
        firstName: "Jonathan",
        lastName: "Abrams",
        email: "j.abrams@icloud.com",
        phone: "+13055551204",
        whatsappId: "+13055551204",
        tier: "vip" as const,
        profileComplete: true,
        matchmakerNotes: "Cardiologist at Mount Sinai. Very specific preferences — wants someone who keeps kosher. Age range 27-34. Has been on 3 intros so far.",
        rejectionCount: 1,
        status: "active" as const,
        lastSyncedAt: daysAgo(1),
        createdAt: daysAgo(50),
        updatedAt: daysAgo(1),
      },
      {
        smaId: "sma_client_005",
        firstName: "Miriam",
        lastName: "Shapiro",
        email: "miriam.shapiro@gmail.com",
        phone: "+13105551205",
        whatsappId: "+13105551205",
        tier: "free" as const,
        profileComplete: false,
        matchmakerNotes: "Submitted intake form at Stoplight party. Profile incomplete — follow up needed.",
        rejectionCount: 0,
        status: "active" as const,
        lastSyncedAt: daysAgo(5),
        createdAt: daysAgo(10),
        updatedAt: daysAgo(5),
      },
      {
        smaId: "sma_client_006",
        firstName: "Ethan",
        lastName: "Rosen",
        email: "ethan.rosen@gmail.com",
        phone: "+13055551206",
        whatsappId: "+13055551206",
        tier: "member" as const,
        profileComplete: true,
        matchmakerNotes: "Startup founder in Wynwood. Casual observance. Looking for someone creative and adventurous. Attends wellness events regularly.",
        rejectionCount: 3,
        status: "active" as const,
        lastSyncedAt: daysAgo(2),
        createdAt: daysAgo(40),
        updatedAt: daysAgo(2),
      },
      {
        smaId: "sma_client_007",
        firstName: "Ariella",
        lastName: "Mizrachi",
        email: "ariella.m@hotmail.com",
        phone: "+13055551207",
        whatsappId: "+13055551207",
        tier: "vip" as const,
        profileComplete: true,
        matchmakerNotes: "Israeli-American. Dual citizen. Interior designer. Very social — knows a lot of people in the community. Needs someone who can keep up with her energy.",
        rejectionCount: 0,
        status: "active" as const,
        lastSyncedAt: daysAgo(1),
        createdAt: daysAgo(55),
        updatedAt: daysAgo(1),
      },
      {
        smaId: "sma_client_008",
        firstName: "Noah",
        lastName: "Friedman",
        email: "noah.friedman@proton.me",
        phone: "+12125551208",
        whatsappId: "+12125551208",
        tier: "member" as const,
        profileComplete: true,
        matchmakerNotes: "Finance professional in NYC. Travels to Miami monthly. Prefers someone based in either city. Conservative background but modern lifestyle.",
        rejectionCount: 4,
        status: "paused" as const,
        lastSyncedAt: daysAgo(7),
        createdAt: daysAgo(70),
        updatedAt: daysAgo(7),
      },
      {
        smaId: "sma_client_009",
        firstName: "Talia",
        lastName: "Berger",
        email: "talia.berger@gmail.com",
        phone: "+13055551209",
        whatsappId: "+13055551209",
        tier: "free" as const,
        profileComplete: true,
        matchmakerNotes: "Grad student at UM. Young but serious about finding a partner. Budget-conscious — on free tier but very active at events.",
        rejectionCount: 0,
        status: "recalibrating" as const,
        lastSyncedAt: daysAgo(4),
        createdAt: daysAgo(25),
        updatedAt: daysAgo(4),
      },
      {
        smaId: "sma_client_010",
        firstName: "Michael",
        lastName: "Katz",
        email: "michael.katz@gmail.com",
        phone: "+13105551210",
        whatsappId: "+13105551210",
        tier: "member" as const,
        profileComplete: true,
        matchmakerNotes: "Entertainment lawyer in LA. Flies to Miami for Club Allenby events. Charming but tends to be indecisive about matches. Needs coaching.",
        rejectionCount: 2,
        status: "active" as const,
        lastSyncedAt: daysAgo(3),
        createdAt: daysAgo(35),
        updatedAt: daysAgo(3),
      },
    ];

    const memberIds: any[] = [];
    for (const member of memberData) {
      const id = await ctx.db.insert("members", member);
      memberIds.push(id);
    }

    // Alias for readability:
    // 0: Sarah Levinson     (F, VIP, Miami)
    // 1: David Cohen        (M, member, Miami)
    // 2: Rebecca Goldstein  (F, member, NYC)
    // 3: Jonathan Abrams    (M, VIP, Miami)
    // 4: Miriam Shapiro     (F, free, LA)
    // 5: Ethan Rosen        (M, member, Miami)
    // 6: Ariella Mizrachi   (F, VIP, Miami)
    // 7: Noah Friedman      (M, member, NYC — paused)
    // 8: Talia Berger       (F, free, Miami — recalibrating)
    // 9: Michael Katz       (M, member, LA)

    // -----------------------------------------------------------------------
    // 3. Matches (6 in various workflow states)
    // -----------------------------------------------------------------------

    // Match 1: pending — just created, nobody notified yet
    const match1Id = await ctx.db.insert("matches", {
      memberAId: memberIds[1], // David Cohen
      memberBId: memberIds[0], // Sarah Levinson
      status: "pending",
      triggeredBy: adminId,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    });

    // Match 2: active — Sarah notified about match with Jonathan, awaiting response
    const match2Id = await ctx.db.insert("matches", {
      memberAId: memberIds[0], // Sarah Levinson
      memberBId: memberIds[3], // Jonathan Abrams
      status: "active",
      triggeredBy: adminId,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(4),
    });

    // Match 3: active — Rebecca expressed interest, still active
    const match3Id = await ctx.db.insert("matches", {
      memberAId: memberIds[2], // Rebecca Goldstein
      memberBId: memberIds[5], // Ethan Rosen
      status: "active",
      responseType: "interested",
      triggeredBy: adminId,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(7),
    });

    // Match 4: pending — upsell activated, awaiting outreach outcome
    const match4Id = await ctx.db.insert("matches", {
      memberAId: memberIds[6], // Ariella Mizrachi
      memberBId: memberIds[1], // David Cohen
      status: "pending",
      responseType: "upsell_yes",
      triggeredBy: adminId,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(8),
    });

    // Match 5: completed — intro sent, group chat active
    const match5Id = await ctx.db.insert("matches", {
      memberAId: memberIds[9], // Michael Katz
      memberBId: memberIds[2], // Rebecca Goldstein
      status: "completed",
      triggeredBy: adminId,
      groupChatId: "wa_group_chat_002",
      createdAt: daysAgo(18),
      updatedAt: daysAgo(14),
    });

    // Match 6: completed — old match that ran its course
    const match6Id = await ctx.db.insert("matches", {
      memberAId: memberIds[3], // Jonathan Abrams
      memberBId: memberIds[6], // Ariella Mizrachi
      status: "completed",
      triggeredBy: adminId,
      createdAt: daysAgo(28),
      updatedAt: daysAgo(20),
    });

    // -----------------------------------------------------------------------
    // 4. Feedback (10 entries across various matches)
    // -----------------------------------------------------------------------
    const feedbackData = [
      // Rebecca is interested in Ethan (match 3)
      {
        matchId: match3Id,
        memberId: memberIds[2], // Rebecca
        decision: "interested" as const,
        freeText: "He seems really interesting — love that he's in the startup world. Would definitely like to meet.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(8),
      },
      // Ariella is interested in David (match 4)
      {
        matchId: match4Id,
        memberId: memberIds[6], // Ariella
        decision: "interested" as const,
        smaMatchNotesSynced: true,
        createdAt: daysAgo(10),
      },
      // David is interested in Ariella (match 4)
      {
        matchId: match4Id,
        memberId: memberIds[1], // David
        decision: "interested" as const,
        freeText: "She sounds amazing — we have a lot in common.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(9),
      },
      // Michael is interested in Rebecca (match 5)
      {
        matchId: match5Id,
        memberId: memberIds[9], // Michael
        decision: "interested" as const,
        smaMatchNotesSynced: true,
        createdAt: daysAgo(16),
      },
      // Rebecca is interested in Michael (match 5)
      {
        matchId: match5Id,
        memberId: memberIds[2], // Rebecca
        decision: "interested" as const,
        freeText: "An entertainment lawyer? That's fun. Let's do it.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(15),
      },
      // Jonathan not interested in Ariella (match 6 — completed)
      {
        matchId: match6Id,
        memberId: memberIds[3], // Jonathan
        decision: "not_interested" as const,
        categories: ["chemistry" as const],
        freeText: "She's great but I didn't feel a romantic connection. Would be happy to be friends.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(22),
      },
      // Ariella not interested in Jonathan (match 6 — completed)
      {
        matchId: match6Id,
        memberId: memberIds[6], // Ariella
        decision: "not_interested" as const,
        categories: ["age_preference" as const],
        freeText: "Nice guy but a bit too old for me.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(21),
      },
      // Noah passed on a hypothetical — but we put it on match 6 as external feedback
      {
        matchId: match6Id,
        memberId: memberIds[7], // Noah (paused, but had earlier feedback)
        decision: "passed" as const,
        categories: ["location" as const],
        freeText: "I'm pausing my membership for now — need to sort out my NYC/Miami situation first.",
        smaMatchNotesSynced: false,
        createdAt: daysAgo(20),
      },
      // Ethan hasn't responded yet to match 3 but gave feedback on an older match (match 6 reused)
      {
        matchId: match3Id,
        memberId: memberIds[5], // Ethan
        decision: "interested" as const,
        freeText: "Just saw the profile — she looks great. Happy to be introduced.",
        smaMatchNotesSynced: false,
        createdAt: daysAgo(6),
      },
      // Sarah passed on match 2 (Jonathan)
      {
        matchId: match2Id,
        memberId: memberIds[0], // Sarah
        decision: "not_interested" as const,
        categories: ["something_specific" as const],
        freeText: "I know Jonathan through mutual friends — it would be awkward.",
        smaMatchNotesSynced: true,
        createdAt: daysAgo(3),
      },
    ];

    for (const fb of feedbackData) {
      await ctx.db.insert("feedback", fb);
    }

    // -----------------------------------------------------------------------
    // 5. WhatsApp Messages (20 messages — mix of inbound/outbound)
    // -----------------------------------------------------------------------
    const whatsappData = [
      // --- Match 1: David + Sarah (pending) - initial outreach ---
      {
        matchId: match1Id,
        memberId: memberIds[1], // David
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hi David! Club Allenby here. We have an exciting match for you! Check your email for details. Reply YES if you'd like to hear more.",
        status: "delivered" as const,
        createdAt: daysAgo(1) + 3600000,
      },

      // --- Match 2: Sarah + Jonathan (active) ---
      {
        matchId: match2Id,
        memberId: memberIds[0], // Sarah
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hi Sarah! Club Allenby here. We've found a match we think you'll love! Did you receive your match details?",
        status: "read" as const,
        createdAt: daysAgo(4) + 7200000,
      },
      {
        matchId: match2Id,
        memberId: memberIds[0], // Sarah
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Yes I got the match! But I actually know Jonathan through friends and it would be weird. Is there anyone else?",
        status: "delivered" as const,
        createdAt: daysAgo(4) + 10800000,
      },
      {
        matchId: match2Id,
        memberId: memberIds[0], // Sarah
        direction: "outbound" as const,
        messageType: "text" as const,
        content: "Totally understand, Sarah! No worries at all. We'll keep looking for the perfect match for you. Stay tuned!",
        status: "read" as const,
        createdAt: daysAgo(4) + 14400000,
      },

      // --- Match 3: Rebecca + Ethan (active, interested) ---
      {
        matchId: match3Id,
        memberId: memberIds[2], // Rebecca
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hi Rebecca! Club Allenby here. We have a great match suggestion for you. A startup founder in Wynwood who shares your love for adventure!",
        status: "read" as const,
        createdAt: daysAgo(9),
      },
      {
        matchId: match3Id,
        memberId: memberIds[2], // Rebecca
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Ooh that sounds interesting! Tell me more about him? Is he observant at all?",
        status: "delivered" as const,
        createdAt: daysAgo(9) + 3600000,
      },
      {
        matchId: match3Id,
        memberId: memberIds[2], // Rebecca
        direction: "outbound" as const,
        messageType: "text" as const,
        content: "He's casually observant — attends High Holiday services and loves Shabbat dinners but wouldn't call himself strictly religious. He's really warm and social. We think you two would hit it off!",
        status: "read" as const,
        createdAt: daysAgo(9) + 7200000,
      },
      {
        matchId: match3Id,
        memberId: memberIds[2], // Rebecca
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "I'm interested! Let's do it.",
        status: "delivered" as const,
        createdAt: daysAgo(8) + 3600000,
      },
      {
        matchId: match3Id,
        memberId: memberIds[5], // Ethan
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hey Ethan! Club Allenby here. We've matched you with someone special — an attorney from NYC who's adventurous and family-oriented. Interested?",
        status: "read" as const,
        createdAt: daysAgo(7),
      },
      {
        matchId: match3Id,
        memberId: memberIds[5], // Ethan
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Just saw the profile — she looks great. Happy to be introduced 👍",
        status: "delivered" as const,
        createdAt: daysAgo(6) + 7200000,
      },

      // --- Match 4: Ariella + David (pending, upsell_yes) ---
      {
        matchId: match4Id,
        memberId: memberIds[6], // Ariella
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hi Ariella! We have an amazing match for you. He recently moved to Miami and works in real estate. We think you two would really connect!",
        status: "read" as const,
        createdAt: daysAgo(11),
      },
      {
        matchId: match4Id,
        memberId: memberIds[6], // Ariella
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Yes yes yes! He sounds perfect. When can we meet?",
        status: "delivered" as const,
        createdAt: daysAgo(10) + 7200000,
      },
      {
        matchId: match4Id,
        memberId: memberIds[1], // David
        direction: "outbound" as const,
        messageType: "interactive" as const,
        content: "Great news, David! Your match Ariella is also interested. We're setting up a group chat for you two. Stay tuned!",
        status: "read" as const,
        createdAt: daysAgo(8) + 3600000,
      },

      // --- Match 5: Michael + Rebecca (completed) ---
      {
        matchId: match5Id,
        memberId: memberIds[9], // Michael
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hey Michael! Club Allenby here. We've matched you with an attorney from NYC. She's smart, fun, and loves exploring new restaurants. Sound good?",
        status: "read" as const,
        createdAt: daysAgo(17),
      },
      {
        matchId: match5Id,
        memberId: memberIds[9], // Michael
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Sounds great! I'm in NYC next week actually. Perfect timing.",
        status: "delivered" as const,
        createdAt: daysAgo(16) + 7200000,
      },
      {
        matchId: match5Id,
        memberId: memberIds[2], // Rebecca
        direction: "outbound" as const,
        messageType: "text" as const,
        content: "Rebecca, great news! Michael is also interested and will be in NYC next week. We've created a group chat for you two to coordinate. Have fun!",
        status: "read" as const,
        createdAt: daysAgo(14) + 3600000,
      },

      // --- General / non-match messages ---
      {
        memberId: memberIds[4], // Miriam (incomplete profile)
        direction: "outbound" as const,
        messageType: "template" as const,
        content: "Hi Miriam! Thanks for joining Club Allenby at the Stoplight party. We noticed your profile is incomplete. Finish it here so we can start matching you!",
        status: "delivered" as const,
        createdAt: daysAgo(8),
      },
      {
        memberId: memberIds[4], // Miriam
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Oh thanks for the reminder! I'll finish it this weekend.",
        status: "delivered" as const,
        createdAt: daysAgo(7) + 14400000,
      },
      {
        memberId: memberIds[8], // Talia (recalibrating)
        direction: "outbound" as const,
        messageType: "text" as const,
        content: "Hi Talia! We're recalibrating your match preferences based on your recent feedback. We'll be in touch soon with better-suited suggestions!",
        status: "read" as const,
        createdAt: daysAgo(4) + 3600000,
      },
      {
        memberId: memberIds[7], // Noah (paused)
        direction: "inbound" as const,
        messageType: "text" as const,
        content: "Hey, I need to pause my membership for a bit. Moving between NYC and Miami and things are hectic. I'll reach out when I'm settled.",
        status: "delivered" as const,
        createdAt: daysAgo(7),
      },
    ];

    for (const msg of whatsappData) {
      await ctx.db.insert("whatsappMessages", msg);
    }

    // -----------------------------------------------------------------------
    // 6. Audit Log Entries (8 entries)
    // -----------------------------------------------------------------------
    const auditLogData = [
      {
        adminId: adminId,
        action: "login",
        resource: "auth",
        details: JSON.stringify({ method: "email_password", ip: "192.168.1.100" }),
        createdAt: daysAgo(1),
      },
      {
        adminId: adminId,
        action: "match_created",
        resource: "matches",
        resourceId: String(match1Id),
        details: JSON.stringify({
          memberA: "David Cohen",
          memberB: "Sarah Levinson",
          reason: "High compatibility score based on shared interests and location",
        }),
        createdAt: daysAgo(1) + 1800000,
      },
      {
        adminId: adminId,
        action: "match_created",
        resource: "matches",
        resourceId: String(match2Id),
        details: JSON.stringify({
          memberA: "Sarah Levinson",
          memberB: "Jonathan Abrams",
          reason: "Both VIP tier, similar religious observance level",
        }),
        createdAt: daysAgo(5),
      },
      {
        adminId: adminId,
        action: "feedback_received",
        resource: "feedback",
        details: JSON.stringify({
          member: "Rebecca Goldstein",
          match: "Rebecca + Ethan",
          decision: "interested",
        }),
        createdAt: daysAgo(8),
      },
      {
        adminId: adminId,
        action: "feedback_received",
        resource: "feedback",
        details: JSON.stringify({
          member: "Sarah Levinson",
          match: "Sarah + Jonathan",
          decision: "not_interested",
          reason: "Already know each other through mutual friends",
        }),
        createdAt: daysAgo(3),
      },
      {
        adminId: adminId,
        action: "member_status_changed",
        resource: "members",
        resourceId: String(memberIds[7]),
        details: JSON.stringify({
          member: "Noah Friedman",
          previousStatus: "active",
          newStatus: "paused",
          reason: "Member requested pause — relocating between cities",
        }),
        createdAt: daysAgo(7),
      },
      {
        adminId: adminId,
        action: "member_status_changed",
        resource: "members",
        resourceId: String(memberIds[8]),
        details: JSON.stringify({
          member: "Talia Berger",
          previousStatus: "active",
          newStatus: "recalibrating",
          reason: "Adjusting match preferences after feedback",
        }),
        createdAt: daysAgo(4),
      },
      {
        adminId: adminId,
        action: "login",
        resource: "auth",
        details: JSON.stringify({ method: "email_password", ip: "10.0.0.52" }),
        createdAt: daysAgo(3),
      },
    ];

    for (const log of auditLogData) {
      await ctx.db.insert("auditLogs", log);
    }

    // -----------------------------------------------------------------------
    // Done
    // -----------------------------------------------------------------------
    console.log("Seed data inserted successfully.");
    console.log(`  - 1 admin`);
    console.log(`  - ${memberIds.length} members`);
    console.log(`  - 6 matches`);
    console.log(`  - ${feedbackData.length} feedback entries`);
    console.log(`  - ${whatsappData.length} WhatsApp messages`);
    console.log(`  - ${auditLogData.length} audit log entries`);

    return {
      seeded: true,
      counts: {
        admins: 1,
        members: memberIds.length,
        matches: 6,
        feedback: feedbackData.length,
        whatsappMessages: whatsappData.length,
        auditLogs: auditLogData.length,
      },
    };
  },
});
