const API_BASE = 'http://localhost:8787';
const DEFAULT_STATE = { savedTools: [], userPreferences: { defaultFilters: {}, dismissedNotifications: [] }, latestRecommendations: [], unread: false };

async function storageGet(keys) { return chrome.storage.sync.get(keys); }
async function storageSet(values) { return chrome.storage.sync.set(values); }
async function localSet(values) { return chrome.storage.local.set(values); }
async function localGet(keys) { return chrome.storage.local.get(keys); }
async function ensureState() { const sync = await storageGet(['savedTools', 'userPreferences']); const local = await localGet(['latestRecommendations', 'unread']); return { ...DEFAULT_STATE, ...sync, ...local }; }
async function api(path, body) {
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-id': await userId() }, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error((await response.json()).error || `API ${response.status}`);
  return response.json();
}
async function userId() { const { slopUserId } = await chrome.storage.local.get('slopUserId'); if (slopUserId) return slopUserId; const id = crypto.randomUUID(); await chrome.storage.local.set({ slopUserId: id }); return id; }
async function collectTabContext(tab) { return { url: tab?.url || '', title: tab?.title || '', metaDescription: '' }; }
async function requestRecommendations(payload, unread = true) {
  const state = await ensureState(); const result = await api('/recommendations', { ...payload, savedTools: state.savedTools, filters: state.userPreferences.defaultFilters || {} });
  await localSet({ latestRecommendations: result.recommendations, latestClassification: { tier: result.tier, taskCategory: result.taskCategory, prompts: result.prompts, cacheHit: result.cacheHit }, unread });
  return result;
}
async function runAutomaticDetection(tab) {
  if (!tab?.url || tab.url.startsWith('chrome://')) return;
  const context = await collectTabContext(tab);
  setTimeout(() => requestRecommendations(context, true).catch(() => undefined), 4000);
}

chrome.runtime.onInstalled.addListener(async () => { const state = await ensureState(); await storageSet({ savedTools: state.savedTools, userPreferences: state.userPreferences }); });
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => { if (changeInfo.status === 'complete') runAutomaticDetection(tab); });
chrome.action.onClicked.addListener(async (tab) => { if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SLOP_TOGGLE' }).catch(() => undefined); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'SLOP_GET_STATE') return { state: await ensureState() };
    if (message.type === 'SLOP_MANUAL_RECOMMEND') return await requestRecommendations({ task: message.task, url: message.url, title: message.title }, false);
    if (message.type === 'SLOP_ADVANCED_RECOMMEND') return await requestRecommendations({ task: `${message.task}\nOutcome: ${message.outcome}\nCurrent tool: ${message.currentTool}\nConstraints: ${message.constraints}`, url: message.url, title: message.title }, false);
    if (message.type === 'SLOP_INSTALL_GUIDE') return await api('/install-guide', { toolId: message.toolId, task: message.task });
    if (message.type === 'SLOP_SAVE_TOOL') { const state = await ensureState(); const savedTools = [...state.savedTools.filter(t => t.toolId !== message.toolId), { toolId: message.toolId, dateAdded: new Date().toISOString(), sourceTaskCategory: message.taskCategory || 'manual' }]; await storageSet({ savedTools }); return { savedTools }; }
    if (message.type === 'SLOP_CLEAR_SAVED') { await storageSet({ savedTools: [] }); return { savedTools: [] }; }
    if (message.type === 'SLOP_SET_FILTERS') { const state = await ensureState(); const userPreferences = { ...state.userPreferences, defaultFilters: message.filters || {} }; await storageSet({ userPreferences }); return { userPreferences }; }
    if (message.type === 'SLOP_MARK_READ') { await localSet({ unread: false }); return { unread: false }; }
    if (message.type === 'SLOP_OPEN_TOOL') { await chrome.tabs.create({ url: message.url }); return { ok: true }; }
    return { error: 'Unknown message' };
  })().then(sendResponse).catch(error => sendResponse({ error: error.message }));
  return true;
});
