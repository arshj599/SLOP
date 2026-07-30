const API_BASE = 'http://localhost:8787';
const DEFAULT_STATE = { savedTools: [], userPreferences: { defaultFilters: {}, dismissedNotifications: [], privacyAcknowledged: false }, latestRecommendations: [], unread: false, tabDomains: {} };
async function storageGet(keys) { return chrome.storage.sync.get(keys); }
async function storageSet(values) { return chrome.storage.sync.set(values); }
async function localSet(values) { return chrome.storage.local.set(values); }
async function localGet(keys) { return chrome.storage.local.get(keys); }
async function ensureState() { const sync = await storageGet(['savedTools', 'userPreferences']); const local = await localGet(['latestRecommendations', 'latestClassification', 'unread', 'tabDomains']); return { ...DEFAULT_STATE, ...sync, ...local, userPreferences: { ...DEFAULT_STATE.userPreferences, ...(sync.userPreferences || {}) } }; }
async function userId() { const { slopUserId } = await chrome.storage.local.get('slopUserId'); if (slopUserId) return slopUserId; const id = crypto.randomUUID(); await chrome.storage.local.set({ slopUserId: id }); return id; }
async function api(path, body) { const response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': await userId() }, body: JSON.stringify(body || {}) }); if (!response.ok) throw new Error((await response.json()).error || `API ${response.status}`); return response.json(); }
function topDomain(rawUrl = '') { try { return new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { return ''; } }
async function collectTabContext(tab) { let metaDescription = ''; if (tab?.id) { try { const response = await chrome.tabs.sendMessage(tab.id, { type: 'SLOP_GET_META_DESCRIPTION' }); metaDescription = response?.metaDescription || ''; } catch {} } return { url: tab?.url || '', title: tab?.title || '', metaDescription }; }
async function requestRecommendations(payload, unread = true) { const state = await ensureState(); const result = await api('/recommendations', { ...payload, savedTools: state.savedTools, filters: state.userPreferences.defaultFilters || {} }); await localSet({ latestRecommendations: result.recommendations, latestClassification: { tier: result.tier, taskCategory: result.taskCategory, prompts: result.prompts, cacheHit: result.cacheHit }, unread }); return result; }
async function runAutomaticDetection(tab) { if (!tab?.id || !tab?.url || tab.url.startsWith('chrome://')) return; const state = await ensureState(); if (!state.userPreferences.privacyAcknowledged) return; const domain = topDomain(tab.url); const previous = state.tabDomains[String(tab.id)]; if (!domain || previous === domain) return; await localSet({ tabDomains: { ...state.tabDomains, [String(tab.id)]: domain } }); setTimeout(async () => { const context = await collectTabContext(tab); const cache = await api('/cache/check', context); if (cache.cacheHit || cache.tier === 1 || cache.tier === 2) await requestRecommendations(context, true); }, 4000); }
async function emit(eventType, body = {}) { return api('/events', { eventType, ...body }).catch(() => undefined); }
chrome.runtime.onInstalled.addListener(async () => { const state = await ensureState(); await storageSet({ savedTools: state.savedTools, userPreferences: state.userPreferences }); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => { if (changeInfo.status === 'complete') runAutomaticDetection(tab); });
chrome.action.onClicked.addListener(async (tab) => { if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SLOP_TOGGLE' }).catch(() => undefined); });
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { (async () => {
  if (message.type === 'SLOP_GET_STATE') return { state: await ensureState() };
  if (message.type === 'SLOP_ACK_PRIVACY') { const state = await ensureState(); const userPreferences = { ...state.userPreferences, privacyAcknowledged: true }; await storageSet({ userPreferences }); await emit('privacy_acknowledged'); return { userPreferences }; }
  if (message.type === 'SLOP_MANUAL_RECOMMEND') return await requestRecommendations({ task: message.task, url: message.url, title: message.title, metaDescription: message.metaDescription }, false);
  if (message.type === 'SLOP_ADVANCED_RECOMMEND') return await requestRecommendations({ task: `${message.task}\nOutcome: ${message.outcome}\nCurrent tool: ${message.currentTool}\nConstraints: ${message.constraints}`, url: message.url, title: message.title, metaDescription: message.metaDescription }, false);
  if (message.type === 'SLOP_INSTALL_GUIDE') { await emit('proceed_clicked', { toolId: message.toolId }); return await api('/install-guide', { toolId: message.toolId, task: message.task }); }
  if (message.type === 'SLOP_SAVE_TOOL') { const state = await ensureState(); const savedTools = [...state.savedTools.filter(t => t.toolId !== message.toolId), { toolId: message.toolId, dateAdded: new Date().toISOString(), sourceTaskCategory: message.taskCategory || 'manual' }]; await storageSet({ savedTools }); await emit('download_confirmed', { toolId: message.toolId, taskCategory: message.taskCategory }); return { savedTools }; }
  if (message.type === 'SLOP_CLEAR_SAVED') { await storageSet({ savedTools: [] }); return { savedTools: [] }; }
  if (message.type === 'SLOP_SET_FILTERS') { const state = await ensureState(); const userPreferences = { ...state.userPreferences, defaultFilters: message.filters || {} }; await storageSet({ userPreferences }); await emit('filter_used'); return { userPreferences }; }
  if (message.type === 'SLOP_MARK_READ') { await localSet({ unread: false }); await emit('notification_opened'); return { unread: false }; }
  if (message.type === 'SLOP_CARD_CLICKED') { await emit('card_clicked', { toolId: message.toolId }); return { ok: true }; }
  if (message.type === 'SLOP_OPEN_TOOL') { await chrome.tabs.create({ url: message.url }); return { ok: true }; }
  return { error: 'Unknown message' };
})().then(sendResponse).catch(error => sendResponse({ error: error.message })); return true; });
