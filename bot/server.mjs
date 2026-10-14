import { createServer } from 'node:http';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const miniAppUrl = process.env.MINI_APP_URL || publicUrl;
const port = Number(process.env.PORT || 8788);
const dbPath = resolve(process.env.SESSION_DB || 'bot/data/sessions.json');
if (!token || !publicUrl || !miniAppUrl) throw new Error('Set TELEGRAM_BOT_TOKEN, PUBLIC_URL, and MINI_APP_URL.');
const telegramApi = `https://api.telegram.org/bot${token}`;
let data = { sessions: {} };
try { data = JSON.parse(await readFile(dbPath, 'utf8')); } catch { /* first run */ }
let offset = 0;

async function persist() {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(data, null, 2), { mode: 0o600 });
}
async function tg(method, payload) {
  const response = await fetch(`${telegramApi}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}
const nameOf = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ') || `Player ${user.id}`;
function inviteUrl(id) { return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=join_${id}`; }
function webUrl(id) { const url = new URL(miniAppUrl); url.searchParams.set('session', id); return url.toString(); }
function roleKeyboard(session) {
  const hunter = session.roles.hunter;
  const witch = session.roles.witch;
  return { inline_keyboard: [[
    hunter ? { text: `Hunter · ${hunter.name}`, callback_data: 'taken' } : { text: 'Choose Hunter', callback_data: `role:${session.id}:hunter` },
    witch ? { text: `Witch · ${witch.name}`, callback_data: 'taken' } : { text: 'Choose Witch', callback_data: `role:${session.id}:witch` },
  ], ...(session.players.length === 2 && hunter && witch ? [[{ text: 'Open game', web_app: { url: webUrl(session.id) } }]] : [])] };
}
async function postLobby(session, chatId, messageId) {
  const players = session.players.map((p) => `${p.name}${session.roles.hunter?.id === p.id ? ' — Hunter' : session.roles.witch?.id === p.id ? ' — Witch' : ' — choosing a role'}`).join('\n');
  const text = `Witch Hunt · ${session.status === 'ready' ? 'Ready to play' : 'Waiting for players'}\n\n${players || 'Waiting for players…'}\n\nInvite a friend: ${inviteUrl(session.id)}`;
  if (messageId) await tg('editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: roleKeyboard(session), disable_web_page_preview: true });
  else {
    const sent = await tg('sendMessage', { chat_id: chatId, text, reply_markup: roleKeyboard(session), disable_web_page_preview: true });
    session.messages.push({ chatId, messageId: sent.message_id });
  }
}
async function refreshLobbies(session) {
  session.status = session.players.length === 2 && session.roles.hunter && session.roles.witch ? 'ready' : 'waiting';
  await persist();
  for (const message of [...session.messages]) {
    try { await postLobby(session, message.chatId, message.messageId); } catch { /* a deleted lobby message is harmless */ }
  }
}
async function createSession(user, chatId) {
  const id = randomBytes(5).toString('hex');
  const session = { id, status: 'waiting', players: [{ id: String(user.id), name: nameOf(user) }], roles: { hunter: null, witch: null }, messages: [], createdAt: new Date().toISOString() };
  data.sessions[id] = session;
  await persist();
  await postLobby(session, chatId);
  await tg('sendMessage', { chat_id: chatId, text: 'Share the lobby link above. You and your friend must each choose a different role.' });
}
async function joinSession(id, user, chatId) {
  const session = data.sessions[id];
  if (!session) return tg('sendMessage', { chat_id: chatId, text: 'That invite has expired or is invalid. Create a new game with /start.' });
  const uid = String(user.id);
  if (!session.players.some((p) => p.id === uid)) {
    if (session.players.length >= 2) return tg('sendMessage', { chat_id: chatId, text: 'This lobby is full.' });
    session.players.push({ id: uid, name: nameOf(user) });
  }
  session.messages.push({ chatId, messageId: null });
  await refreshLobbies(session);
}
async function handleUpdate(update) {
  if (update.message) {
    const message = update.message;
    const match = /^\/start(?:\s+([^\s]+))?/.exec(message.text || '');
    if (!match) return;
    const payload = match[1] || '';
    if (payload === 'create') return createSession(message.from, message.chat.id);
    if (payload.startsWith('join_')) return joinSession(payload.slice(5), message.from, message.chat.id);
    return tg('sendMessage', { chat_id: message.chat.id, text: 'Create a game lobby, then send its invite link to a friend.', reply_markup: { inline_keyboard: [[{ text: 'Create game', web_app: { url: miniAppUrl } }]] } });
  }
  if (update.callback_query) {
    const q = update.callback_query;
    if (q.data === 'taken') return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'That role is already taken.' });
    const [, id, role] = (q.data || '').split(':');
    const session = data.sessions[id];
    const uid = String(q.from.id);
    if (!session || !['hunter', 'witch'].includes(role)) return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'This lobby is unavailable.' });
    if (!session.players.some((p) => p.id === uid)) return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Join this lobby before choosing a role.' });
    const existing = session.roles.hunter?.id === uid ? 'hunter' : session.roles.witch?.id === uid ? 'witch' : null;
    if (session.roles[role] && session.roles[role].id !== uid) return tg('answerCallbackQuery', { callback_query_id: q.id, text: 'That role is already taken.' });
    if (existing && existing !== role) delete session.roles[existing];
    session.roles[role] = { id: uid, name: nameOf(q.from) };
    await tg('answerCallbackQuery', { callback_query_id: q.id, text: `You chose ${role}.` });
    return refreshLobbies(session);
  }
}
async function poll() {
  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        try { await handleUpdate(update); } catch (error) { console.error('Update failed:', error.message); }
      }
    } catch (error) { console.error('Telegram polling failed:', error.message); await new Promise((r) => setTimeout(r, 2500)); }
  }
}
function validInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}
const server = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('access-control-allow-headers', 'content-type, x-telegram-init-data');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/health') return send(200, { ok: true });
  const sessionMatch = /^\/api\/sessions\/([a-f0-9]+)$/.exec(req.url || '');
  if (req.method === 'GET' && sessionMatch) {
    const session = data.sessions[sessionMatch[1]];
    const user = validInitData(req.headers['x-telegram-init-data']);
    if (!session || !user || !session.players.some((p) => p.id === String(user.id))) return send(403, { error: 'not a session member' });
    return send(200, { id: session.id, status: session.status, players: session.players, roles: session.roles, yourRole: session.roles.hunter?.id === String(user.id) ? 'hunter' : session.roles.witch?.id === String(user.id) ? 'witch' : null });
  }
  send(404, { error: 'not found' });
});
server.listen(port, () => console.log(`Witch Hunt bot service listening on ${port}`));
void poll();
