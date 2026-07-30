import { readFileSync, existsSync } from 'node:fs';
import { classify, recommend, tools } from '../backend/server.js';

const requiredFiles = ['docs/deployment-protocol.md','extension/manifest.json','extension/background.js','extension/content.js','backend/server.js'];
const failures = [];
for (const file of requiredFiles) if (!existsSync(file)) failures.push(`Missing ${file}`);
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) failures.push('Manifest must be v3');
for (const permission of ['activeTab','storage','tabs']) if (!manifest.permissions.includes(permission)) failures.push(`Missing permission ${permission}`);
if (!manifest.background?.service_worker) failures.push('Missing background service worker');
if (!manifest.content_scripts?.[0]?.js?.includes('content.js')) failures.push('Missing content script');
const content = readFileSync('extension/content.js','utf8');
for (const token of ['attachShadow', 'Task Input', 'Advanced Search', 'Did you download', 'Free/freemium only', 'You already use this']) if (!content.includes(token)) failures.push(`Content UI missing ${token}`);
const background = readFileSync('extension/background.js','utf8');
for (const token of ['chrome.storage.sync', 'SLOP_MANUAL_RECOMMEND', 'SLOP_ADVANCED_RECOMMEND', 'SLOP_SAVE_TOOL', 'chrome.tabs.create', 'setTimeout']) if (!background.includes(token)) failures.push(`Background missing ${token}`);
const backend = readFileSync('backend/server.js','utf8');
for (const token of ['/classify', '/recommendations', '/install-guide', 'CACHE_TTL_MS', 'TIER3_LIMIT_PER_HOUR', 'usageEvents']) if (!backend.includes(token)) failures.push(`Backend missing ${token}`);
const gmail = classify({ url: 'https://mail.google.com/mail/u/0/#inbox' });
if (gmail.tier !== 1 || gmail.taskCategory !== 'email management') failures.push('Tier 1 Gmail classification failed');
const manual = classify({ task: 'I need help debugging a GitHub API test' });
if (manual.tier !== 3 || manual.taskCategory !== 'coding') failures.push('Tier 3 manual classification failed');
const recs = recommend({ taskCategory: 'coding', savedTools: [{ toolId: 'github-copilot' }] });
if (!recs.length || recs[0].id !== 'github-copilot' || !recs[0].alreadySaved) failures.push('Saved tool re-ranking failed');
if (tools.length < 8) failures.push('Tool database seed is too small');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Protocol coverage checks passed.');
