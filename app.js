// ============================================================
// OLLAMA API TESTER — app.js
// ============================================================

// https://unpkg.com/ollama/dist/browser.mjs
import { Ollama } from './browser.mjs';
window.Ollama = Ollama;

// -- State ----------------------------------------------------
const state = {
  host: localStorage.getItem('ollama_api_tester_host') || 'http://localhost:11434',
  authHeader: localStorage.getItem('ollama_api_tester_auth') || '',
  currentEndpoint: 'chat',
  isStreaming: false,
  currentOllama: null,
  responseRaw: null,
  streamText: '',
};

// -- Ollama Client ---------------------------------------------
function createOllama(host, authHeader) {
  const opts = { host };
  if (authHeader) opts.headers = { Authorization: authHeader };
  // Use browser-compatible CDN build
  return new window.Ollama(opts);
}

function getOllama() {
  if (!state.currentOllama) {
    state.currentOllama = createOllama(state.host, state.authHeader);
  }
  return state.currentOllama;
}

function resetOllama() {
  state.currentOllama = null;
}

// -- Endpoint Definitions --------------------------------------
const ENDPOINTS = {
  chat: {
    label: 'chat',
    method: 'POST',
    desc: 'Send messages to a model',
    form: renderChatForm,
    run: runChat,
  },
  generate: {
    label: 'generate',
    method: 'POST',
    desc: 'Generate text from a prompt',
    form: renderGenerateForm,
    run: runGenerate,
  },
  pull: {
    label: 'pull',
    method: 'POST',
    desc: 'Pull a model from the registry',
    form: renderPullForm,
    run: runPull,
  },
  push: {
    label: 'push',
    method: 'POST',
    desc: 'Push a model to the registry',
    form: renderPushForm,
    run: runPush,
  },
  create: {
    label: 'create',
    method: 'POST',
    desc: 'Create a model from a base',
    form: renderCreateForm,
    run: runCreate,
  },
  delete: {
    label: 'delete',
    method: 'DELETE',
    desc: 'Delete a model',
    form: renderDeleteForm,
    run: runDelete,
  },
  copy: {
    label: 'copy',
    method: 'POST',
    desc: 'Copy a model to a new name',
    form: renderCopyForm,
    run: runCopy,
  },
  list: {
    label: 'list',
    method: 'GET',
    desc: 'List all local models',
    form: renderListForm,
    run: runList,
  },
  show: {
    label: 'show',
    method: 'POST',
    desc: 'Show model information',
    form: renderShowForm,
    run: runShow,
  },
  embed: {
    label: 'embed',
    method: 'POST',
    desc: 'Generate embeddings from input',
    form: renderEmbedForm,
    run: runEmbed,
  },
  websearch: {
    label: 'web search',
    method: 'POST',
    desc: 'Search the web via Ollama cloud',
    form: renderWebSearchForm,
    run: runWebSearch,
  },
  webfetch: {
    label: 'web fetch',
    method: 'POST',
    desc: 'Fetch a URL via Ollama cloud',
    form: renderWebFetchForm,
    run: runWebFetch,
  },
  ps: {
    label: 'ps',
    method: 'GET',
    desc: 'List running models',
    form: renderPsForm,
    run: runPs,
  },
  version: {
    label: 'version',
    method: 'GET',
    desc: 'Get the Ollama server version',
    form: renderVersionForm,
    run: runVersion,
  },
  abort: {
    label: 'abort',
    method: 'UTIL',
    desc: 'Abort all running streams',
    form: renderAbortForm,
    run: runAbort,
  },
};

const METHOD_BADGE = {
  POST:   'badge-post',
  GET:    'badge-get',
  DELETE: 'badge-del',
  UTIL:   'badge-util',
};

// -- DOM Helpers -----------------------------------------------
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => c && e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
};

function fieldGroup(labelText, inputEl, hint = '') {
  const g = el('div', { class: 'field-group' });
  g.appendChild(el('label', {}, labelText));
  g.appendChild(inputEl);
  if (hint) g.appendChild(el('span', { class: 'field-hint' }, hint));
  return g;
}

function textInput(id, placeholder = '', value = '') {
  const i = el('input', { type: 'text', id, placeholder });
  if (value) i.value = value;
  return i;
}

function numberInput(id, placeholder = '', min = '', step = '') {
  const i = el('input', { type: 'number', id, placeholder });
  if (min !== '') i.min = min;
  if (step !== '') i.step = step;
  return i;
}

function checkboxRow(id, labelText, defaultChecked = false) {
  const wrap = el('div', { class: 'checkbox-row' });
  const cb = el('input', { type: 'checkbox', id });
  if (defaultChecked) cb.checked = true;
  wrap.appendChild(cb);
  wrap.appendChild(el('span', {}, labelText));
  return wrap;
}

function selectInput(id, options) {
  const s = el('select', { id });
  options.forEach(([val, label]) => {
    const o = el('option', { value: val }, label);
    s.appendChild(o);
  });
  return s;
}

function textareaInput(id, placeholder = '', rows = 3) {
  const t = el('textarea', { id, placeholder, rows });
  return t;
}

function optionsCollapsible(prefix = '') {
  const wrap = el('div', { class: 'collapsible full-width' });
  const header = el('div', { class: 'collapsible-header' });
  header.innerHTML = `<span>Options (runtime parameters)</span><span class="collapsible-chevron">▼</span>`;
  header.addEventListener('click', () => wrap.classList.toggle('open'));
  const body = el('div', { class: 'collapsible-body' });
  const grid = el('div', { class: 'options-grid' });

  const opts = [
    ['temperature', 'Temperature', '0.0–2.0'],
    ['top_p',       'Top P',       '0.0–1.0'],
    ['top_k',       'Top K',       'e.g. 40'],
    ['seed',        'Seed',        'integer'],
    ['num_ctx',     'Num Ctx',     'context size'],
    ['num_predict', 'Num Predict', 'max tokens'],
    ['repeat_penalty', 'Repeat Penalty', 'e.g. 1.1'],
    ['stop',        'Stop',        'comma-separated'],
    ['tfs_z',       'TFS Z',       ''],
  ];
  opts.forEach(([name, label, ph]) => {
    grid.appendChild(fieldGroup(label, textInput(`${prefix}opt_${name}`, ph)));
  });
  body.appendChild(grid);
  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function getOptions(prefix = '') {
  const names = ['temperature','top_p','top_k','seed','num_ctx','num_predict','repeat_penalty','stop','tfs_z'];
  const opts = {};
  names.forEach(name => {
    const el = $(`${prefix}opt_${name}`);
    if (el && el.value.trim()) {
      if (name === 'stop') {
        opts[name] = el.value.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        const n = parseFloat(el.value);
        opts[name] = isNaN(n) ? el.value : n;
      }
    }
  });
  return Object.keys(opts).length ? opts : undefined;
}

// -- Form Renderers --------------------------------------------

function renderChatForm() {
  const grid = el('div', { class: 'form-grid' });

  // Model
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('chat_model', 'e.g. llama3.2, qwen3:4b'), 'Name of the model to use')));

  // Messages
  const msgSection = el('div', { class: 'full-width' });
  msgSection.appendChild(el('label', {}, 'Messages *'));
  const builder = el('div', { class: 'messages-builder', id: 'chat_messages' });
  addMessageRow(builder, 'user', '');
  const addBtn = el('button', { class: 'add-message-btn', type: 'button' }, '+ Add Message');
  addBtn.addEventListener('click', () => addMessageRow(builder, 'user', ''));
  msgSection.appendChild(builder);
  msgSection.appendChild(addBtn);
  grid.appendChild(msgSection);

  // Format, stream, think
  grid.appendChild(fieldGroup('Format', selectInput('chat_format', [['','none'],['json','json'],['text','text']]), 'Response format'));
  grid.appendChild(fieldGroup('Think', selectInput('chat_think', [['','false'],['true','true'],['high','high'],['medium','medium'],['low','low']]), 'Enable model thinking'));
  grid.appendChild(fieldGroup('Keep Alive', textInput('chat_keep_alive', 'e.g. 5m or 300'), 'Duration to keep model loaded'));

  const streamRow = el('div', { class: 'full-width' });
  streamRow.appendChild(fieldGroup('Stream', checkboxRow('chat_stream', 'Enable streaming response', true)));
  grid.appendChild(streamRow);

  // Logprobs
  const logRow = el('div', { class: 'full-width' });
  const logWrap = el('div', { style: 'display:flex; gap:14px; align-items:flex-start;' });
  logWrap.appendChild(checkboxRow('chat_logprobs', 'Return log probabilities'));
  logWrap.appendChild(fieldGroup('Top Logprobs', numberInput('chat_top_logprobs', '0–20', 0)));
  logRow.appendChild(el('label', {}, 'Log Probabilities'));
  logRow.appendChild(logWrap);
  grid.appendChild(logRow);

  // Tools (JSON)
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Tools (JSON array)', textareaInput('chat_tools', '[\n  {\n    "type": "function",\n    "function": {\n      "name": "get_weather",\n      "description": "...",\n      "parameters": {}\n    }\n  }\n]', 4), 'Optional tool definitions')));

  // Options
  grid.appendChild(optionsCollapsible('chat_'));

  return grid;
}

function renderGenerateForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('gen_model', 'e.g. llama3.2'))));
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Prompt *', textareaInput('gen_prompt', 'Enter your prompt here...', 5))));
  grid.appendChild(fieldGroup('System', textareaInput('gen_system', 'Override system prompt...', 3)));
  grid.appendChild(fieldGroup('Template', textareaInput('gen_template', 'Override model template...', 3)));
  grid.appendChild(fieldGroup('Suffix', textInput('gen_suffix', 'Text after inserted content')));
  grid.appendChild(fieldGroup('Format', selectInput('gen_format', [['','none'],['json','json'],['text','text']])));
  grid.appendChild(fieldGroup('Think', selectInput('gen_think', [['','false'],['true','true'],['high','high'],['medium','medium'],['low','low']])));
  grid.appendChild(fieldGroup('Keep Alive', textInput('gen_keep_alive', 'e.g. 5m')));
  const flags = el('div', { class: 'full-width', style: 'display:flex; gap:20px;' });
  flags.appendChild(checkboxRow('gen_stream', 'Stream', true));
  flags.appendChild(checkboxRow('gen_raw', 'Raw (bypass template)'));
  grid.appendChild(flags);
  grid.appendChild(optionsCollapsible('gen_'));
  return grid;
}

function renderPullForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('pull_model', 'e.g. llama3.2 or llama3.2:latest'), 'The model to pull from the registry')));
  const flags = el('div', { class: 'full-width', style: 'display:flex; gap:20px;' });
  flags.appendChild(checkboxRow('pull_stream', 'Stream progress', true));
  flags.appendChild(checkboxRow('pull_insecure', 'Allow insecure'));
  grid.appendChild(flags);
  return grid;
}

function renderPushForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('push_model', 'e.g. username/modelname:tag'), 'The model to push')));
  const flags = el('div', { class: 'full-width', style: 'display:flex; gap:20px;' });
  flags.appendChild(checkboxRow('push_stream', 'Stream progress', true));
  flags.appendChild(checkboxRow('push_insecure', 'Allow insecure'));
  grid.appendChild(flags);
  return grid;
}

function renderCreateForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model Name *', textInput('create_model', 'e.g. my-custom-model'))));
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('From (base model) *', textInput('create_from', 'e.g. llama3.2'))));
  grid.appendChild(fieldGroup('System Prompt', textareaInput('create_system', 'System prompt for the model...', 3)));
  grid.appendChild(fieldGroup('Template', textareaInput('create_template', 'Prompt template...', 3)));
  grid.appendChild(fieldGroup('Quantize', selectInput('create_quantize', [['','none'],['q4_K_M','q4_K_M'],['q8_0','q8_0'],['q4_0','q4_0'],['q5_K_M','q5_K_M'],['f16','f16']])));
  grid.appendChild(fieldGroup('License', textInput('create_license', 'License string (optional)')));
  grid.appendChild(checkboxRow('create_stream', 'Stream progress', true));
  return grid;
}

function renderDeleteForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('delete_model', 'e.g. llama3.2:latest'), 'The model to delete')));
  const warn = el('div', { class: 'info-box full-width' });
  warn.innerHTML = '⚠️ This will permanently delete the model from your local Ollama storage.';
  grid.appendChild(warn);
  return grid;
}

function renderCopyForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(fieldGroup('Source Model *', textInput('copy_source', 'e.g. llama3.2')));
  grid.appendChild(fieldGroup('Destination *', textInput('copy_dest', 'e.g. my-llama3.2')));
  return grid;
}

function renderListForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = 'ℹ️ Lists all models available locally. No parameters required.';
  grid.appendChild(info);
  return grid;
}

function renderShowForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('show_model', 'e.g. llama3.2'))));
  grid.appendChild(fieldGroup('System Override', textareaInput('show_system', 'Optional system override...', 2)));
  grid.appendChild(fieldGroup('Template Override', textareaInput('show_template', 'Optional template override...', 2)));
  return grid;
}

function renderEmbedForm() {
  const grid = el('div', { class: 'form-grid' });
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Model *', textInput('embed_model', 'e.g. nomic-embed-text'))));
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Input *', textareaInput('embed_input', 'Text to embed, or one per line for multiple...', 4), 'Multiple lines = multiple embeddings')));
  grid.appendChild(fieldGroup('Keep Alive', textInput('embed_keep_alive', 'e.g. 5m')));
  grid.appendChild(checkboxRow('embed_truncate', 'Truncate to max context length'));
  grid.appendChild(optionsCollapsible('embed_'));
  return grid;
}

function renderWebSearchForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = '🔑 Requires an Ollama account API key. Set it in Settings → Authorization Header as <code>Bearer &lt;key&gt;</code> and set host to <code>https://ollama.com</code>.';
  grid.appendChild(info);
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('Query *', textInput('ws_query', 'What would you like to search for?'))));
  grid.appendChild(fieldGroup('Max Results', numberInput('ws_max_results', '1–10 (default 5)', 1)));
  return grid;
}

function renderWebFetchForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = '🔑 Requires an Ollama account API key. Set it in Settings → Authorization Header and set host to <code>https://ollama.com</code>.';
  grid.appendChild(info);
  grid.appendChild(el('div', { class: 'full-width' }, fieldGroup('URL *', textInput('wf_url', 'https://example.com'), 'The URL to fetch')));
  return grid;
}

function renderPsForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = 'ℹ️ Lists all models currently loaded in memory. No parameters required.';
  grid.appendChild(info);
  return grid;
}

function renderVersionForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = 'ℹ️ Returns the Ollama server version. No parameters required.';
  grid.appendChild(info);
  return grid;
}

function renderAbortForm() {
  const grid = el('div', { class: 'form-grid' });
  const info = el('div', { class: 'info-box full-width' });
  info.innerHTML = '⚡ Aborts all currently running streamed generations on this client instance. This will cause all <code>for await</code> loops to throw an <code>AbortError</code>.';
  grid.appendChild(info);
  return grid;
}

// -- Message Row -----------------------------------------------
function addMessageRow(container, role = 'user', content = '') {
  const row = el('div', { class: 'message-row' });
  const sel = selectInput(``, [['user','user'],['assistant','assistant'],['system','system'],['tool','tool']]);
  sel.value = role;
  const ta = textareaInput('', 'Message content...', 2);
  ta.value = content;
  const rm = el('button', { class: 'remove-msg', type: 'button' }, '×');
  rm.addEventListener('click', () => row.remove());
  row.appendChild(sel);
  row.appendChild(ta);
  row.appendChild(rm);
  container.appendChild(row);
}

function getMessages() {
  const rows = document.querySelectorAll('#chat_messages .message-row');
  return Array.from(rows).map(row => ({
    role: row.querySelector('select').value,
    content: row.querySelector('textarea').value,
  })).filter(m => m.content.trim());
}

// -- API Runners -----------------------------------------------

async function runChat() {
  const model = $('chat_model')?.value.trim();
  if (!model) return setStatus('error', 'Model is required');
  const messages = getMessages();
  if (!messages.length) return setStatus('error', 'At least one message required');

  const params = { model, messages };
  const format = $('chat_format')?.value; if (format) params.format = format;
  const think = $('chat_think')?.value; if (think) params.think = think === 'true' ? true : think || undefined;
  const keepAlive = $('chat_keep_alive')?.value.trim(); if (keepAlive) params.keep_alive = keepAlive;
  const stream = $('chat_stream')?.checked;
  params.stream = !!stream;
  if ($('chat_logprobs')?.checked) {
    params.logprobs = true;
    const tl = $('chat_top_logprobs')?.value; if (tl) params.top_logprobs = parseInt(tl);
  }
  const toolsRaw = $('chat_tools')?.value.trim();
  if (toolsRaw) { try { params.tools = JSON.parse(toolsRaw); } catch(e) { return setStatus('error', 'Invalid tools JSON'); } }
  const opts = getOptions('chat_'); if (opts) params.options = opts;

  if (stream) {
    return streamRequest(async () => getOllama().chat(params), r => r.message?.content || '');
  } else {
    return plainRequest(() => getOllama().chat(params));
  }
}

async function runGenerate() {
  const model = $('gen_model')?.value.trim();
  if (!model) return setStatus('error', 'Model is required');
  const prompt = $('gen_prompt')?.value.trim();
  if (!prompt) return setStatus('error', 'Prompt is required');

  const params = { model, prompt };
  const system = $('gen_system')?.value.trim(); if (system) params.system = system;
  const template = $('gen_template')?.value.trim(); if (template) params.template = template;
  const suffix = $('gen_suffix')?.value.trim(); if (suffix) params.suffix = suffix;
  const format = $('gen_format')?.value; if (format) params.format = format;
  const think = $('gen_think')?.value; if (think) params.think = think === 'true' ? true : think || undefined;
  const keepAlive = $('gen_keep_alive')?.value.trim(); if (keepAlive) params.keep_alive = keepAlive;
  params.stream = !!$('gen_stream')?.checked;
  if ($('gen_raw')?.checked) params.raw = true;
  const opts = getOptions('gen_'); if (opts) params.options = opts;

  if (params.stream) {
    return streamRequest(async () => getOllama().generate(params), r => r.response || '');
  } else {
    return plainRequest(() => getOllama().generate(params));
  }
}

async function runPull() {
  const model = $('pull_model')?.value.trim();
  if (!model) return setStatus('error', 'Model name required');
  const params = { model, stream: !!$('pull_stream')?.checked };
  if ($('pull_insecure')?.checked) params.insecure = true;
  if (params.stream) {
    return progressRequest(async () => getOllama().pull(params));
  } else {
    return plainRequest(() => getOllama().pull(params));
  }
}

async function runPush() {
  const model = $('push_model')?.value.trim();
  if (!model) return setStatus('error', 'Model name required');
  const params = { model, stream: !!$('push_stream')?.checked };
  if ($('push_insecure')?.checked) params.insecure = true;
  if (params.stream) {
    return progressRequest(async () => getOllama().push(params));
  } else {
    return plainRequest(() => getOllama().push(params));
  }
}

async function runCreate() {
  const model = $('create_model')?.value.trim();
  const from = $('create_from')?.value.trim();
  if (!model || !from) return setStatus('error', 'Model name and base model required');
  const params = { model, from, stream: !!$('create_stream')?.checked };
  const system = $('create_system')?.value.trim(); if (system) params.system = system;
  const template = $('create_template')?.value.trim(); if (template) params.template = template;
  const quantize = $('create_quantize')?.value; if (quantize) params.quantize = quantize;
  const license = $('create_license')?.value.trim(); if (license) params.license = license;
  if (params.stream) {
    return progressRequest(async () => getOllama().create(params));
  } else {
    return plainRequest(() => getOllama().create(params));
  }
}

async function runDelete() {
  const model = $('delete_model')?.value.trim();
  if (!model) return setStatus('error', 'Model name required');
  return plainRequest(() => getOllama().delete({ model }));
}

async function runCopy() {
  const source = $('copy_source')?.value.trim();
  const destination = $('copy_dest')?.value.trim();
  if (!source || !destination) return setStatus('error', 'Source and destination required');
  return plainRequest(() => getOllama().copy({ source, destination }));
}

async function runList() {
  return plainRequest(() => getOllama().list());
}

async function runShow() {
  const model = $('show_model')?.value.trim();
  if (!model) return setStatus('error', 'Model name required');
  const params = { model };
  const system = $('show_system')?.value.trim(); if (system) params.system = system;
  const template = $('show_template')?.value.trim(); if (template) params.template = template;
  return plainRequest(() => getOllama().show(params));
}

async function runEmbed() {
  const model = $('embed_model')?.value.trim();
  const inputRaw = $('embed_input')?.value.trim();
  if (!model || !inputRaw) return setStatus('error', 'Model and input required');
  const lines = inputRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const input = lines.length === 1 ? lines[0] : lines;
  const params = { model, input };
  const keepAlive = $('embed_keep_alive')?.value.trim(); if (keepAlive) params.keep_alive = keepAlive;
  if ($('embed_truncate')?.checked) params.truncate = true;
  const opts = getOptions('embed_'); if (opts) params.options = opts;
  return plainRequest(() => getOllama().embed(params));
}

async function runWebSearch() {
  const query = $('ws_query')?.value.trim();
  if (!query) return setStatus('error', 'Query required');
  const params = { query };
  const max = $('ws_max_results')?.value; if (max) params.max_results = parseInt(max);
  return plainRequest(() => getOllama().webSearch(params));
}

async function runWebFetch() {
  const url = $('wf_url')?.value.trim();
  if (!url) return setStatus('error', 'URL required');
  return plainRequest(() => getOllama().webFetch({ url }));
}

async function runPs() {
  return plainRequest(() => getOllama().ps());
}

async function runVersion() {
  return plainRequest(() => getOllama().version());
}

async function runAbort() {
  try {
    getOllama().abort();
    state.isStreaming = false;
    setSending(false);
    showResponse({ status: 'ok', message: 'Aborted all running streams on this client instance.' });
    setStatus('success', 'Streams aborted');
  } catch(e) {
    setStatus('error', e.message);
  }
}

// -- Request Helpers -------------------------------------------

async function plainRequest(fn) {
  setSending(true);
  setStatus('busy', 'Sending request…');
  const t0 = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - t0;
    state.responseRaw = res;
    showResponse(res);
    setResponseStatus('ok', '200 OK');
    setStatus('success', `Completed in ${ms}ms`);
    setMeta(`${ms}ms`);
  } catch(e) {
    handleError(e);
  } finally {
    setSending(false);
  }
}

async function streamRequest(fn, extractText) {
  setSending(true);
  setStatus('busy', 'Streaming…');
  state.isStreaming = true;
  state.streamText = '';
  showStreamPlaceholder();
  const t0 = Date.now();
  try {
    const stream = await fn();
    for await (const part of stream) {
      state.streamText += extractText(part) || '';
      updateStream(state.streamText);
    }
    const ms = Date.now() - t0;
    finalizeStream(state.streamText);
    setResponseStatus('ok', '200 OK');
    setStatus('success', `Streamed in ${ms}ms`);
    setMeta(`${ms}ms · ${state.streamText.length} chars`);
  } catch(e) {
    if (e.name === 'AbortError') {
      finalizeStream(state.streamText + '\n[aborted]');
      setStatus('ready', 'Aborted');
    } else {
      handleError(e);
    }
  } finally {
    state.isStreaming = false;
    setSending(false);
  }
}

async function progressRequest(fn) {
  setSending(true);
  setStatus('busy', 'Working…');
  state.isStreaming = true;
  const lines = [];
  showStreamPlaceholder();
  const t0 = Date.now();
  try {
    const stream = await fn();
    for await (const part of stream) {
      const pct = part.total ? Math.round((part.completed / part.total) * 100) : 0;
      if (part.status) {
        lines.push(part.status + (part.total ? ` (${pct}%)` : ''));
        updateProgressDisplay(lines, pct);
      }
    }
    const ms = Date.now() - t0;
    updateProgressDisplay(lines, 100);
    setResponseStatus('ok', 'Done');
    setStatus('success', `Done in ${ms}ms`);
    setMeta(`${ms}ms`);
  } catch(e) {
    handleError(e);
  } finally {
    state.isStreaming = false;
    setSending(false);
  }
}

function handleError(e) {
  const msg = e.message || String(e);
  showResponse({ error: msg });
  setResponseStatus('err', 'Error');
  setStatus('error', msg.length > 60 ? msg.slice(0, 60) + '…' : msg);
}

// -- Response Display ------------------------------------------

function showResponse(data) {
  const body = $('response-body');
  const formatted = document.getElementById('view-formatted')?.classList.contains('active');
  if (formatted) {
    body.innerHTML = `<div class="json-output">${syntaxHighlight(JSON.stringify(data, null, 2))}</div>`;
  } else {
    body.innerHTML = `<div class="json-output">${escHtml(JSON.stringify(data, null, 2))}</div>`;
  }
  state.responseRaw = data;
}

function showStreamPlaceholder() {
  const body = $('response-body');
  body.innerHTML = `<div class="stream-output" id="stream-content"></div><span class="stream-cursor" id="stream-cursor"></span>`;
}

function updateStream(text) {
  const el = document.getElementById('stream-content');
  if (el) el.textContent = text;
}

function finalizeStream(text) {
  const body = $('response-body');
  const cursor = document.getElementById('stream-cursor');
  if (cursor) cursor.remove();
  const el = document.getElementById('stream-content');
  if (el) el.textContent = text;
  state.responseRaw = { response: text };
}

function updateProgressDisplay(lines, pct) {
  const body = $('response-body');
  body.innerHTML = `<div class="stream-output">${escHtml(lines.join('\n'))}</div>`;
  const pw = $('progress-wrap');
  const pb = $('progress-bar');
  if (pw) pw.classList.remove('hidden');
  if (pb) pb.style.width = pct + '%';
  if (pct >= 100 && pw) {
    setTimeout(() => pw.classList.add('hidden'), 1500);
  }
}

function syntaxHighlight(json) {
  return escHtml(json).replace(
    /"([^"]+)":\s*|"([^"]*?)"|(\btrue\b|\bfalse\b)|\bnull\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
    (match, key, str, bool, num) => {
      if (key !== undefined) return `<span class="json-key">"${key}"</span>: `;
      if (str !== undefined) return `<span class="json-str">"${str}"</span>`;
      if (bool !== undefined) return `<span class="json-bool">${bool}</span>`;
      if (match === 'null') return `<span class="json-null">null</span>`;
      if (num !== undefined) return `<span class="json-num">${num}</span>`;
      return match;
    }
  );
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// -- UI State --------------------------------------------------

function setStatus(type, text) {
  const dot = $('status-dot');
  const txt = $('status-text');
  dot.className = 'status-dot ' + type;
  if (txt) txt.textContent = text;
  if (type === 'success') {
    setTimeout(() => { dot.className = 'status-dot ready'; if (txt) txt.textContent = 'Ready'; }, 3000);
  }
}

function setMeta(text) {
  const m = $('status-meta');
  if (m) m.textContent = text;
}

function setResponseStatus(type, text) {
  const s = $('response-status');
  if (!s) return;
  s.textContent = text;
  s.className = 'response-status ' + type;
}

function setSending(val) {
  const btn = $('send-btn');
  const label = $('send-label');
  const spinner = $('send-spinner');
  if (!btn) return;
  btn.disabled = val;
  if (label) label.textContent = val ? 'Sending…' : 'Send Request';
  if (spinner) spinner.classList.toggle('hidden', !val);
}

// -- Navigation ------------------------------------------------

function selectEndpoint(name) {
  state.currentEndpoint = name;

  // Sidebar active state
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.endpoint === name);
  });

  const ep = ENDPOINTS[name];
  if (!ep) return;

  // Update header
  const badge = $('endpoint-badge');
  const title = $('endpoint-title');
  const desc = $('endpoint-desc');
  if (badge) { badge.textContent = ep.method; badge.className = 'endpoint-badge ' + (METHOD_BADGE[ep.method] || 'badge-post'); }
  if (title) title.textContent = ep.label;
  if (desc) desc.textContent = ep.desc;

  // Render form
  const container = $('form-container');
  if (container) {
    container.innerHTML = '';
    const form = ep.form();
    if (form) container.appendChild(form);
  }

  // Reset response
  $('response-body').innerHTML = `<div class="response-placeholder"><div class="placeholder-icon">◎</div><p>Response will appear here after sending a request</p></div>`;
  setResponseStatus('', '');
  setMeta('');
}

// -- Settings --------------------------------------------------

function openSettings() {
  $('host-input').value = state.host;
  $('auth-header').value = state.authHeader;
  $('settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  $('settings-overlay').classList.add('hidden');
}

function saveSettings() {
  const host = $('host-input').value.trim() || 'http://localhost:11434';
  const auth = $('auth-header').value.trim();
  state.host = host;
  state.authHeader = auth;
  localStorage.setItem('ollama_api_tester_host', host);
  localStorage.setItem('ollama_api_tester_auth', auth);
  resetOllama();
  updateHostBadge();
  closeSettings();
  setStatus('ready', 'Settings saved');
}

function updateHostBadge() {
  const badge = $('host-badge');
  if (!badge) return;
  try {
    const u = new URL(state.host);
    badge.textContent = u.host;
  } catch {
    badge.textContent = state.host;
  }
}

// -- View Toggle -----------------------------------------------

function setView(formatted) {
  $('view-formatted').classList.toggle('active', formatted);
  $('view-raw').classList.toggle('active', !formatted);
  if (state.responseRaw !== null) {
    showResponse(state.responseRaw);
  }
}

// -- Init ------------------------------------------------------

function init() {
  bootApp();
}

function bootApp() {
  updateHostBadge();
  setStatus('ready', 'Ready');

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => selectEndpoint(btn.dataset.endpoint));
  });

  // Send button
  $('send-btn')?.addEventListener('click', async () => {
    if (state.isStreaming) return;
    const ep = ENDPOINTS[state.currentEndpoint];
    if (ep?.run) {
      await ep.run();
    }
  });

  // Settings
  $('open-settings')?.addEventListener('click', openSettings);
  $('close-settings')?.addEventListener('click', closeSettings);
  $('cancel-settings')?.addEventListener('click', closeSettings);
  $('save-settings')?.addEventListener('click', saveSettings);
  $('reset-host')?.addEventListener('click', () => { $('host-input').value = 'http://localhost:11434'; });
  $('settings-overlay')?.addEventListener('click', e => { if (e.target === $('settings-overlay')) closeSettings(); });

  // Clear form
  $('clear-form')?.addEventListener('click', () => selectEndpoint(state.currentEndpoint));

  // Clear response
  $('clear-response')?.addEventListener('click', () => {
    $('response-body').innerHTML = `<div class="response-placeholder"><div class="placeholder-icon">◎</div><p>Response will appear here after sending a request</p></div>`;
    setResponseStatus('', '');
    state.responseRaw = null;
  });

  // Copy response
  $('copy-response')?.addEventListener('click', () => {
    if (state.responseRaw !== null) {
      navigator.clipboard.writeText(JSON.stringify(state.responseRaw, null, 2)).then(() => {
        setStatus('success', 'Copied to clipboard');
      });
    }
  });

  // View toggle
  $('view-formatted')?.addEventListener('click', () => setView(true));
  $('view-raw')?.addEventListener('click', () => setView(false));

  // Load default endpoint
  selectEndpoint('chat');
}

// -- Keyboard shortcuts ----------------------------------------
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    $('send-btn')?.click();
  }
  if (e.key === 'Escape') {
    closeSettings();
  }
});

// -- Service Worker (PWA) --------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Start
window.addEventListener('DOMContentLoaded', init);
