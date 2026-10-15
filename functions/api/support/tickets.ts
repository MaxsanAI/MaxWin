import { Env, ensureAuthSchema, getUser, json, readJson, randomToken } from "../auth/_shared";

async function ensureSupportSchema(db: D1Database): Promise<void> {
  await ensureAuthSchema(db);
  await db.prepare("CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','in_progress','resolved')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL,sender_type TEXT NOT NULL CHECK(sender_type IN ('user','admin')),sender_user_id TEXT,message TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE SET NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated ON support_tickets(user_id,updated_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages(ticket_id,created_at)").run();
}
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Support is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to contact MAXWIN Support." }, 401);
  try {
    await ensureSupportSchema(env.DB);
    const tickets = await env.DB.prepare("SELECT id,subject,status,created_at AS createdAt,updated_at AS updatedAt FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 50").bind(user.id).all();
    const messages = await env.DB.prepare("SELECT m.id,m.ticket_id AS ticketId,m.sender_type AS senderType,m.message,m.created_at AS createdAt FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.user_id=? ORDER BY m.created_at ASC LIMIT 1000").bind(user.id).all();
    return json({ user: { username: user.username }, tickets: tickets.results || [], messages: messages.results || [] });
  } catch (error) { console.error("[MAXWIN support] Load failed:", error instanceof Error ? error.message : String(error)); return json({ error: "Could not load support messages." }, 500); }
};
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Support is not configured." }, 503);
  const user = await getUser(request, env.DB);
  if (!user) return json({ error: "Log in to contact MAXWIN Support." }, 401);
  const body = await readJson(request);
  if (!body) return json({ error: "Enter a valid support message." }, 400);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  if (message.length < 2 || message.length > 4000) return json({ error: "Message must be between 2 and 4,000 characters." }, 400);
  const now = new Date().toISOString();
  try {
    await ensureSupportSchema(env.DB);
    if (ticketId) {
      const ticket = await env.DB.prepare("SELECT id,status FROM support_tickets WHERE id=? AND user_id=? LIMIT 1").bind(ticketId,user.id).first<{id:string;status:string}>();
      if (!ticket) return json({ error: "Support ticket not found." }, 404);
      if (ticket.status === "resolved") return json({ error: "This ticket is resolved. Open a new ticket if you need more help." }, 409);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_type,sender_user_id,message,created_at) VALUES(?,?,'user',?,?,?)").bind(randomToken(16),ticketId,user.id,message,now),
        env.DB.prepare("UPDATE support_tickets SET status='open',updated_at=? WHERE id=? AND user_id=? AND status!='resolved'").bind(now,ticketId,user.id)
      ]);
      return json({ ok: true, message: "Reply sent." }, 201);
    }
    if (subject.length < 3 || subject.length > 120) return json({ error: "Subject must be between 3 and 120 characters." }, 400);
    const id = randomToken(16);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO support_tickets(id,user_id,subject,status,created_at,updated_at) VALUES(?,?,?,'open',?,?)").bind(id,user.id,subject,now,now),
      env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_type,sender_user_id,message,created_at) VALUES(?,?,'user',?,?,?)").bind(randomToken(16),id,user.id,message,now)
    ]);
    return json({ ok: true, ticketId: id, message: "Support request sent." }, 201);
  } catch (error) { console.error("[MAXWIN support] Submit failed:", error instanceof Error ? error.message : String(error)); return json({ error: "Could not send your support message." }, 500); }
};