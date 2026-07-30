import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DB_PATH = resolve(process.env.SLOP_DB_PATH || 'backend/data/slop-db.json');
const DEFAULT_DB = { tools: [], recommendation_cache: [], usage_events: [], rate_limits: [] };

function ensureDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
}
function readDb() { ensureDb(); return { ...DEFAULT_DB, ...JSON.parse(readFileSync(DB_PATH, 'utf8')) }; }
function writeDb(db) { ensureDb(); writeFileSync(DB_PATH, JSON.stringify({ ...DEFAULT_DB, ...db }, null, 2)); }
export function seedTools(tools) { const db = readDb(); if (!db.tools.length) { db.tools = tools; writeDb(db); } return db.tools; }
export function getTools() { return readDb().tools; }
export function getCache(cacheKey) { const row = readDb().recommendation_cache.find(item => item.cacheKey === cacheKey); return row && new Date(row.expiresAt).getTime() > Date.now() ? row : null; }
export function setCache(cacheKey, value, ttlMs) { const db = readDb(); db.recommendation_cache = db.recommendation_cache.filter(item => item.cacheKey !== cacheKey); db.recommendation_cache.push({ cacheKey, value, generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttlMs).toISOString() }); writeDb(db); return getCache(cacheKey); }
export function cacheStats() { const now = Date.now(); const db = readDb(); return { total: db.recommendation_cache.length, fresh: db.recommendation_cache.filter(item => new Date(item.expiresAt).getTime() > now).length }; }
export function logUsage(event) { const db = readDb(); db.usage_events.push({ ...event, timestamp: event.timestamp || new Date().toISOString() }); writeDb(db); }
export function getUsageEvents() { return readDb().usage_events; }
export function allowRate(userId, bucket, limit, windowMs) { const now = Date.now(); const db = readDb(); db.rate_limits = db.rate_limits.filter(row => now - row.timestamp < windowMs); const count = db.rate_limits.filter(row => row.userId === userId && row.bucket === bucket).length; if (count >= limit) { writeDb(db); return false; } db.rate_limits.push({ userId, bucket, timestamp: now }); writeDb(db); return true; }
export function resetDbForTests() { writeDb(DEFAULT_DB); }
