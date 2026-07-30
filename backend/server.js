import http from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIER3_LIMIT_PER_HOUR = 20;

const tools = [
  { id: 'chatgpt', name: 'ChatGPT', logoUrl: '', description: 'General-purpose assistant for writing, analysis, coding, brainstorming, and task planning.', rating: 4.8, userCount: 180000000, costTier: 'Freemium', complexityTier: 'Beginner', url: 'https://chatgpt.com', categories: ['writing', 'research', 'coding', 'productivity', 'email management'], installSteps: ['Open ChatGPT.', 'Create or sign in to your account.', 'Describe the task and constraints.', 'Review and adapt the output before using it.'] },
  { id: 'grammarly', name: 'Grammarly', logoUrl: '', description: 'Writing assistant for grammar, tone, clarity, and email/document polishing.', rating: 4.6, userCount: 30000000, costTier: 'Freemium', complexityTier: 'Beginner', url: 'https://www.grammarly.com', categories: ['writing', 'email management', 'document editing'], installSteps: ['Open Grammarly.', 'Install the browser extension or desktop app.', 'Enable it for your writing surfaces.', 'Use suggestions to revise text.'] },
  { id: 'notion-ai', name: 'Notion AI', logoUrl: '', description: 'Workspace AI for summarizing notes, drafting docs, and organizing project knowledge.', rating: 4.5, userCount: 35000000, costTier: 'Paid', complexityTier: 'Intermediate', url: 'https://www.notion.so/product/ai', categories: ['document editing', 'productivity', 'project management'], installSteps: ['Open Notion.', 'Enable Notion AI in your workspace.', 'Create or open a page.', 'Ask AI to draft, summarize, or transform workspace content.'] },
  { id: 'perplexity', name: 'Perplexity', logoUrl: '', description: 'Answer engine for cited research, source discovery, and quick topic exploration.', rating: 4.7, userCount: 15000000, costTier: 'Freemium', complexityTier: 'Beginner', url: 'https://www.perplexity.ai', categories: ['research', 'learning'], installSteps: ['Open Perplexity.', 'Sign in if you want history saved.', 'Ask a focused research question.', 'Open cited sources to verify important claims.'] },
  { id: 'github-copilot', name: 'GitHub Copilot', logoUrl: '', description: 'AI coding assistant for autocomplete, chat, tests, and code explanation inside developer tools.', rating: 4.6, userCount: 5000000, costTier: 'Paid', complexityTier: 'Intermediate', url: 'https://github.com/features/copilot', categories: ['coding'], installSteps: ['Open GitHub Copilot.', 'Start or confirm a subscription.', 'Install the IDE extension.', 'Sign in to GitHub from your IDE.', 'Use inline suggestions or chat for your coding task.'] },
  { id: 'canva-magic-studio', name: 'Canva Magic Studio', logoUrl: '', description: 'Design assistant for presentations, social posts, images, and brand-ready creative assets.', rating: 4.5, userCount: 170000000, costTier: 'Freemium', complexityTier: 'Beginner', url: 'https://www.canva.com/magic/', categories: ['design', 'presentation'], installSteps: ['Open Canva Magic Studio.', 'Choose a template or create a design.', 'Describe the design outcome.', 'Export or share the finished asset.'] },
  { id: 'zapier-ai', name: 'Zapier AI', logoUrl: '', description: 'Automation assistant for connecting apps and building AI-assisted workflows.', rating: 4.4, userCount: 3000000, costTier: 'Freemium', complexityTier: 'Advanced', url: 'https://zapier.com/ai', categories: ['automation', 'productivity'], installSteps: ['Open Zapier AI.', 'Connect the apps involved in your workflow.', 'Describe the automation trigger and action.', 'Test the Zap before turning it on.'] },
  { id: 'fireflies', name: 'Fireflies.ai', logoUrl: '', description: 'Meeting assistant for recording, transcribing, summarizing, and searching meetings.', rating: 4.4, userCount: 10000000, costTier: 'Freemium', complexityTier: 'Beginner', url: 'https://fireflies.ai', categories: ['meetings', 'productivity'], installSteps: ['Open Fireflies.ai.', 'Connect your calendar or meeting platform.', 'Invite the bot to meetings.', 'Review summaries and action items after calls.'] }
];

const domainCategories = [
  [/mail\.google\.com|outlook\.live\.com|outlook\.office\.com/i, 'email management'],
  [/docs\.google\.com|office\.com|notion\.so/i, 'document editing'],
  [/figma\.com|canva\.com/i, 'design'],
  [/github\.com|gitlab\.com|stackoverflow\.com/i, 'coding'],
  [/calendar\.google\.com|zoom\.us|meet\.google\.com/i, 'meetings']
];
const cache = new Map();
const rateBuckets = new Map();
const usageEvents = [];

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-user-id' });
  res.end(JSON.stringify(body));
}
function readBody(req) { return new Promise((resolve) => { let data=''; req.on('data', c => data += c); req.on('end', () => resolve(data ? JSON.parse(data) : {})); }); }
function normalize(value='') { return value.toLowerCase().replace(/^https?:\/\//, '').replace(/[#?].*$/, '').replace(/\/$/, '').trim(); }
function categoryFromText(text='') {
  const lower = text.toLowerCase();
  if (/email|inbox|gmail|outlook/.test(lower)) return 'email management';
  if (/code|bug|github|api|test|repo/.test(lower)) return 'coding';
  if (/design|figma|logo|image|brand|presentation|slide/.test(lower)) return lower.includes('presentation') ? 'presentation' : 'design';
  if (/research|source|learn|compare|study/.test(lower)) return 'research';
  if (/meeting|transcript|call|notes/.test(lower)) return 'meetings';
  if (/automate|workflow|zap|integration/.test(lower)) return 'automation';
  if (/document|draft|write|grammar|edit|summarize/.test(lower)) return 'document editing';
  return 'productivity';
}
function classify({ url='', title='', metaDescription='', task='' }) {
  if (task) return { tier: 3, taskCategory: categoryFromText(task), prompts: promptsFor(categoryFromText(task)) };
  const normalizedUrl = normalize(url);
  for (const [pattern, category] of domainCategories) if (pattern.test(normalizedUrl)) return { tier: 1, taskCategory: category, prompts: promptsFor(category) };
  const category = categoryFromText(`${normalizedUrl} ${title} ${metaDescription}`);
  return { tier: 2, taskCategory: category, prompts: promptsFor(category) };
}
function promptsFor(category) {
  return {
    'email management': ['Help me filter important emails', 'Draft a concise reply', 'Summarize this inbox workflow'],
    coding: ['Help me debug this code', 'Suggest tests for this change', 'Explain this repository workflow'],
    design: ['Create a design concept', 'Improve this visual asset', 'Find a tool for brand graphics'],
    'document editing': ['Summarize this document', 'Improve this draft', 'Turn notes into an outline'],
    meetings: ['Summarize meeting notes', 'Extract action items', 'Prepare a meeting agenda'],
    automation: ['Automate this repetitive workflow', 'Connect these apps', 'Suggest a no-code automation'],
    research: ['Research this topic with sources', 'Compare tools for this task', 'Find credible references'],
    productivity: ['Recommend an AI productivity tool', 'Help organize this workflow', 'Find a simpler way to do this']
  }[category] || ['Recommend an AI tool', 'Help me complete this task'];
}
function cacheKey(payload, category) { return `${normalize(payload.url || 'manual')}::${category}::${normalize(payload.task || '')}`; }
function enforceRate(userId) {
  const now = Date.now();
  const bucket = rateBuckets.get(userId) || [];
  const recent = bucket.filter(ts => now - ts < 60 * 60 * 1000);
  if (recent.length >= TIER3_LIMIT_PER_HOUR) return false;
  recent.push(now); rateBuckets.set(userId, recent); return true;
}
function recommend({ taskCategory, savedTools = [], filters = {} }) {
  const savedIds = new Set(savedTools.map(t => t.toolId || t.id));
  let ranked = tools
    .filter(tool => tool.categories.includes(taskCategory) || tool.categories.includes('productivity'))
    .sort((a, b) => Number(savedIds.has(b.id)) - Number(savedIds.has(a.id)) || b.rating - a.rating || b.userCount - a.userCount)
    .map(tool => ({ ...tool, alreadySaved: savedIds.has(tool.id) }));
  if (filters.freeOnly) ranked = ranked.filter(t => t.costTier === 'Freemium' || t.costTier === 'Free');
  if (filters.complexityTier) ranked = ranked.filter(t => t.complexityTier === filters.complexityTier);
  if (filters.sortBy === 'userCount') ranked.sort((a, b) => b.userCount - a.userCount);
  return ranked.slice(0, 6);
}
function logEvent(eventType, body, req) { usageEvents.push({ eventType, domain: normalize(body.url || '').split('/')[0] || 'manual', taskCategory: body.taskCategory, timestamp: new Date().toISOString(), userIdHashed: req.headers['x-user-id'] || 'anonymous' }); }

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, cacheEntries: cache.size, usageEvents: usageEvents.length });
    if (req.method === 'GET' && url.pathname === '/tools') return json(res, 200, { tools });
    if (req.method === 'POST' && url.pathname === '/classify') {
      const body = await readBody(req); const result = classify(body); logEvent('classify', { ...body, taskCategory: result.taskCategory }, req); return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/recommendations') {
      const body = await readBody(req); const userId = req.headers['x-user-id'] || 'anonymous';
      const classification = classify(body);
      if (classification.tier === 3 && !enforceRate(userId)) return json(res, 429, { error: 'Tier 3 rate limit exceeded' });
      const key = cacheKey(body, classification.taskCategory); const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return json(res, 200, { ...cached.value, cacheHit: true });
      const value = { ...classification, recommendations: recommend({ taskCategory: classification.taskCategory, savedTools: body.savedTools || [], filters: body.filters || {} }) };
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS }); logEvent('recommendations', { ...body, taskCategory: classification.taskCategory }, req);
      return json(res, 200, { ...value, cacheHit: false });
    }
    if (req.method === 'POST' && url.pathname === '/install-guide') {
      const body = await readBody(req); const tool = tools.find(t => t.id === body.toolId);
      if (!tool) return json(res, 404, { error: 'Unknown tool' });
      const taskLine = body.task ? `Use it specifically for: ${body.task}` : 'Add your task inside the tool for tailored output.';
      logEvent('install_guide', { ...body, taskCategory: categoryFromText(body.task || tool.categories[0]) }, req);
      return json(res, 200, { toolId: tool.id, toolName: tool.name, url: tool.url, steps: [...tool.installSteps, taskLine, 'Return to SLOP and confirm whether you adopted the tool.'] });
    }
    if (req.method === 'POST' && url.pathname === '/events') { const body = await readBody(req); logEvent(body.eventType || 'client_event', body, req); return json(res, 202, { ok: true }); }
    return json(res, 404, { error: 'Not found' });
  } catch (error) { return json(res, 500, { error: error.message }); }
});

if (process.argv[1] && process.argv[1].endsWith('server.js')) server.listen(PORT, () => console.log(`SLOP backend listening on http://localhost:${PORT}`));
export { server, classify, recommend, tools };
