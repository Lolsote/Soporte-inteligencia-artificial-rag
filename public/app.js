// Database Migration: auto-clear old schema once
if (typeof window !== 'undefined' && window.localStorage) {
  if (localStorage.getItem('db_version') !== '2.1') {
    localStorage.clear();
    localStorage.setItem('db_version', '2.1');
  }
}

// Helpers to read/write/remove subscription flags bound to the logged-in user account
function getSessionValue(key) {
  const currentUser = localStorage.getItem('current_user');
  if (!currentUser) return localStorage.getItem(key);
  const users = JSON.parse(localStorage.getItem('users_db') || '[]');
  const user = users.find(u => u.email.toLowerCase() === currentUser.toLowerCase());
  if (user && user[key] !== undefined) return String(user[key]);
  return localStorage.getItem(key);
}

function setSessionValue(key, value) {
  localStorage.setItem(key, value);
  const currentUser = localStorage.getItem('current_user');
  if (currentUser) {
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    const userIndex = users.findIndex(u => u.email.toLowerCase() === currentUser.toLowerCase());
    if (userIndex !== -1) {
      const parsedValue = (value === 'true' ? true : (value === 'false' ? false : value));
      users[userIndex][key] = parsedValue;
      localStorage.setItem('users_db', JSON.stringify(users));
    }
  }
}

function removeSessionValue(key) {
  localStorage.removeItem(key);
  const currentUser = localStorage.getItem('current_user');
  if (currentUser) {
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    const userIndex = users.findIndex(u => u.email.toLowerCase() === currentUser.toLowerCase());
    if (userIndex !== -1) {
      delete users[userIndex][key];
      localStorage.setItem('users_db', JSON.stringify(users));
    }
  }
}

// Reset subscriptions via URL search parameter (e.g. ?reset=true)
if (typeof window !== 'undefined' && window.location && window.location.search.includes('reset=true')) {
  removeSessionValue('sub_docs');
  removeSessionValue('sub_diag');
  removeSessionValue('sub_premium');
  removeSessionValue('first_purchase_done');
  
  const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
  window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  alert("Suscripciones de prueba restablecidas correctamente.");
}

const output = document.getElementById('output');
const ingestForm = document.getElementById('ingestForm');
const uploadForm = document.getElementById('uploadForm');
const queryForm = document.getElementById('queryForm');
const demoQuestionBtn = document.getElementById('demoQuestionBtn');
const executeForm = document.getElementById('executeForm');
const whitelistAddForm = document.getElementById('whitelistAddForm');
const whitelistRemoveForm = document.getElementById('whitelistRemoveForm');
const actions = document.querySelectorAll('[data-action]');

function getApiBaseUrl() {
  const savedUrl = localStorage.getItem('api_base_url');
  if (savedUrl) {
    return savedUrl;
  }

  const fallbackBase = 'http://localhost:3000';
  if (typeof window === 'undefined' || !window.location) {
    return fallbackBase;
  }

  const currentOrigin = window.location.origin;
  const isFileOrigin = !currentOrigin || currentOrigin === 'null' || currentOrigin.startsWith('file://');
  
  if (isFileOrigin) {
    return fallbackBase;
  }

  // Si estamos en localhost pero en un puerto distinto al del backend (ej. puerto de desarrollo frontend)
  const isLocalhost = currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1');
  const isBackendPort = currentOrigin.includes(':3000');
  if (isLocalhost && !isBackendPort) {
    return fallbackBase;
  }

  return currentOrigin;
}

function buildApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

function logResult(data) {
  if (output) {
    output.textContent = JSON.stringify(data, null, 2);
  }
}

async function sendRequest(path, options = {}) {
  const apiUrl = buildApiUrl(path);

  try {
    const res = await fetch(apiUrl, options);
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const errorPayload = typeof payload === 'string' ? { error: payload } : payload;
      logResult(errorPayload);
      return errorPayload;
    }

    logResult(payload);
    return payload;
  } catch (err) {
    logResult({
      error: err.message,
      hint: 'No se pudo contactar con la API. Asegúrate de tener el backend levantado en http://localhost:3000.',
      apiUrl,
    });
    return null;
  }
}

// ── TAB SWITCHING LOGIC ──────────────────────────────────────────
const menuButtons = document.querySelectorAll('.menu-btn');
const tabContents = document.querySelectorAll('.tab-content');

menuButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    
    // Intercept clicks on locked tabs for the simulated paywall (Admins bypass all locks)
    if (tabId === 'docs-tab' || tabId === 'diag-tab') {
      const currentUser = localStorage.getItem('current_user') || '';
      const parts = currentUser.split('@');
      const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');

      const hasDocsSub = isAdmin || getSessionValue('sub_docs') === 'true' || getSessionValue('sub_premium') === 'true';
      const hasDiagSub = isAdmin || getSessionValue('sub_diag') === 'true' || getSessionValue('sub_premium') === 'true';
      
      if (tabId === 'docs-tab' && !hasDocsSub) {
        openPaywall('docs');
        return;
      }
      if (tabId === 'diag-tab' && !hasDiagSub) {
        openPaywall('diag');
        return;
      }
    }
    
    menuButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((t) => t.classList.remove('active'));
    
    btn.classList.add('active');
    const tab = document.getElementById(tabId);
    if (tab) {
      tab.classList.add('active');
    }
  });
});

function showConsole() {
  const configBtn = document.querySelector('.menu-btn[data-tab="config-tab"]');
  if (configBtn) {
    configBtn.click();
  }
}

// ── QUIET PETITIONS FOR BACKGROUND MONITORING ──────────────────────
async function sendRequestQuietly(path, options = {}) {
  const apiUrl = buildApiUrl(path);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  
  try {
    const res = await fetch(apiUrl, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) return null;
    return contentType.includes('application/json') ? await res.json() : await res.text();
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

// ── SYSTEM MONITORING (HEALTH CHECK) ────────────────────────────────
async function updateStatusIndicators() {
  const data = await sendRequestQuietly('/api/rag/health');
  
  const backendDot = document.getElementById('status-backend-dot');
  const backendText = document.getElementById('status-backend-text');
  const ollamaDot = document.getElementById('status-ollama-dot');
  const ollamaText = document.getElementById('status-ollama-text');
  const chromaDot = document.getElementById('status-chroma-dot');
  const chromaText = document.getElementById('status-chroma-text');
  const statType = document.getElementById('stat-type');
  
  if (data) {
    if (backendDot) backendDot.className = 'status-dot online';
    if (backendText) backendText.textContent = 'En línea';
    
    if (ollamaDot) {
      ollamaDot.className = data.ollama === 'online' ? 'status-dot online' : 'status-dot offline';
    }
    if (ollamaText) {
      ollamaText.textContent = data.ollama === 'online' ? 'En línea' : 'Desconectado';
    }
    
    if (chromaDot) {
      chromaDot.className = data.vectorStore && data.vectorStore !== 'Memory' ? 'status-dot online' : 'status-dot warning';
    }
    if (chromaText) {
      chromaText.textContent = data.vectorStore || 'Memoria';
    }
    if (statType) {
      statType.textContent = data.vectorStore || 'Memory';
    }
  } else {
    if (backendDot) backendDot.className = 'status-dot offline';
    if (backendText) backendText.textContent = 'Desconectado';
    if (ollamaDot) ollamaDot.className = 'status-dot offline';
    if (ollamaText) ollamaText.textContent = 'Desconectado';
    if (chromaDot) chromaDot.className = 'status-dot offline';
    if (chromaText) chromaText.textContent = 'Desconectado';
    if (statType) statType.textContent = 'Memory';
  }
}

// ── VECTOR STORE STATS ─────────────────────────────────────────────
async function updateStats() {
  const data = await sendRequestQuietly('/api/rag/stats');
  const statChunks = document.getElementById('stat-chunks');
  const statModel = document.getElementById('stat-model');
  
  if (data) {
    if (statChunks) statChunks.textContent = data.collectionSize ?? 0;
    if (statModel) statModel.textContent = data.embeddingModel || 'n/a';
  } else {
    // Fallback: estimate stats based on mockup uploads
    if (statChunks) {
      const mockFiles = JSON.parse(localStorage.getItem('mock_uploaded_files') || '[]');
      statChunks.textContent = mockFiles.length * 4;
    }
    if (statModel) statModel.textContent = 'nomic-embed-text';
  }
}

// Initial configuration load
updateStatusIndicators();
updateStats();
initSubscriptions();
setInterval(updateStatusIndicators, 10000);

// ── ACTIONS ROUTING ────────────────────────────────────────────────
actions.forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.getAttribute('data-action');
    switch (action) {
      case 'health':
        sendRequest('/api/rag/health').then(() => updateStatusIndicators());
        break;
      case 'stats':
        sendRequest('/api/rag/stats').then(() => updateStats());
        break;
      case 'listDocs':
        await handleListDocs();
        break;
      case 'clearCollection':
        if (confirm('¿Estás seguro de que deseas limpiar la base vectorial completa?')) {
          localStorage.removeItem('mock_uploaded_files');
          sendRequest('/api/rag/collection/clear', { method: 'POST' }).catch(() => {}).then(() => {
            updateStats();
            const docListContainer = document.getElementById('docListContainer');
            if (docListContainer) {
              docListContainer.style.display = 'none';
              handleListDocs();
            }
          });
        }
        break;
      case 'indexStatus':
        sendRequest('/api/rag/admin/index-status').then(() => showConsole());
        break;
      case 'viewPrompt':
        await loadPrompt();
        break;
      case 'catalog':
        sendRequest('/api/diagnostic/catalog').then(() => showConsole());
        break;
      case 'listWhitelist':
        sendRequest('/api/diagnostic/whitelist').then(() => showConsole());
        break;
      case 'audit':
        sendRequest('/api/diagnostic/audit').then(() => showConsole());
        break;
      case 'resetRateLimit':
        sendRequest('/api/diagnostic/rate-limit/reset', { method: 'POST' }).then(() => {
          alert('Rate limit restablecido.');
        });
        break;
      default:
        break;
    }
  });
});

// ── RAG INGESTION FORMS ─────────────────────────────────────────────
if (ingestForm) {
  ingestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(ingestForm);
    const docsDir = formData.get('docsDir')?.toString() || './docs';
    const repoUrlsRaw = formData.get('repoUrls')?.toString() || '';
    const clear = formData.get('clear') === 'on';

    const repoUrls = repoUrlsRaw
      .split(/\r?\n|,/) 
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const body = { docsDir, clear };
    if (repoUrls.length > 0) {
      body.repoUrls = repoUrls;
    }

    const submitBtn = ingestForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.textContent = 'Procesando ingesta...';
      submitBtn.disabled = true;
    }

    const data = await sendRequest('/api/rag/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (submitBtn) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }

    if (data && !data.error) {
      alert(`Ingesta masiva completada con éxito. Procesados ${data.processedFiles?.length || 0} archivos.`);
      updateStats();
      const docListContainer = document.getElementById('docListContainer');
      if (docListContainer && docListContainer.style.display !== 'none') {
        handleListDocs();
      }
    } else {
      alert(`Error en la ingesta: ${data?.error || 'Verifique la consola para más detalles.'}`);
    }
  });
}

const fileInput = document.getElementById('file-input');
const fileInfoBox = document.getElementById('file-info-box');
const fileNameDisplay = document.getElementById('file-name-display');

if (fileInput) {
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      if (fileNameDisplay) {
        fileNameDisplay.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
      if (fileInfoBox) fileInfoBox.style.display = 'block';
    } else {
      if (fileInfoBox) fileInfoBox.style.display = 'none';
    }
  });
}

if (uploadForm) {
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(uploadForm);
    const file = fileInput?.files?.[0];
    
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.textContent = 'Procesando...';
      submitBtn.disabled = true;
    }
    
    let data = null;
    try {
      data = await sendRequest('/api/rag/ingest/upload', { method: 'POST', body: formData });
    } catch (err) {
      console.warn("Backend offline, simulating upload.");
    }
    
    if (submitBtn) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
    
    if (data && !data.error) {
      alert(`Archivo "${data.fileName}" subido y procesado con éxito. Creados ${data.chunksCreated} fragmentos.`);
      updateStats();
      const docListContainer = document.getElementById('docListContainer');
      if (docListContainer) {
        docListContainer.style.display = 'flex';
        handleListDocs();
      }
      uploadForm.reset();
      if (fileInfoBox) fileInfoBox.style.display = 'none';
    } else if (file) {
      // Simulation fallback for Vercel/offline testing
      setTimeout(() => {
        const mockFiles = JSON.parse(localStorage.getItem('mock_uploaded_files') || '[]');
        const exists = mockFiles.some(f => f.name === file.name);
        if (!exists) {
          mockFiles.push({
            name: file.name,
            size: file.size,
            path: `uploads/${file.name}`,
            uploadedAt: new Date().toISOString()
          });
          localStorage.setItem('mock_uploaded_files', JSON.stringify(mockFiles));
        }

        alert(`Archivo "${file.name}" subido e indexado con éxito (Simulado offline). Creados ${Math.ceil(file.size / 500) || 5} fragmentos.`);
        updateStats();
        
        const docListContainer = document.getElementById('docListContainer');
        if (docListContainer) {
          docListContainer.style.display = 'flex';
          handleListDocs();
        }
        
        uploadForm.reset();
        if (fileInfoBox) fileInfoBox.style.display = 'none';
      }, 1000);
    } else {
      alert('Por favor, selecciona un archivo válido para subir.');
    }
  });
}

if (queryForm) {
  queryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    // Check questions limit first
    const limitInfo = getQueryLimitInfo();
    if (!limitInfo.unlimited && limitInfo.remaining <= 0) {
      alert('⚠️ Has alcanzado el límite de preguntas de tu plan. Por favor, actualiza tu suscripción para obtener más consultas.');
      openPaywall();
      return;
    }

    const formData = new FormData(queryForm);
    const question = formData.get('question')?.toString() || '';
    const k = Number(formData.get('k')) || 5;

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');

    if (!chatMessages || !question.trim()) return;

    // Increment questions asked count and update UI counter immediately
    incrementQuestionsAsked();
    updateChatLimitCounter();

    // 1. Add user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    if (currentChatAttachment) {
      userBubble.innerHTML = `
        <div>${question}</div>
        <div style="margin-top: 6px; padding: 4px 8px; background: rgba(0,0,0,0.25); border-radius: 6px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.1); color: #fff;">
          ${currentChatAttachment.type === 'local' ? '📎' : '📁'} ${currentChatAttachment.name}
        </div>
      `;
    } else {
      userBubble.textContent = question;
    }
    chatMessages.appendChild(userBubble);

    // Clear input
    if (chatInput) chatInput.value = '';

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 2. Add thinking bubble
    const thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'chat-bubble bot';
    thinkingBubble.innerHTML = '<em>SoporteIA está formulando una respuesta basada en tus documentos...</em>';
    chatMessages.appendChild(thinkingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 3. Send query
    const queryBody = { question, k };
    if (currentChatAttachment) {
      queryBody.attachment = currentChatAttachment;
      // If offline/simulating, inject attachment name to customize prompt retrieval simulation
      const hasBaseUrl = localStorage.getItem('api_base_url');
      if (!hasBaseUrl) {
        queryBody.question = `${question} [Con documento adjunto: ${currentChatAttachment.name}]`;
      }
    }

    // Reset attachment preview immediately after sending
    currentChatAttachment = null;
    if (chatFileInput) chatFileInput.value = '';
    const preview = document.getElementById('chatAttachmentPreview');
    if (preview) preview.style.display = 'none';

    const data = await sendRequest('/api/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody),
    });

    // 4. Update thinking bubble with real response
    if (data) {
      let sourcesHtml = '';
      if (data.sources && data.sources.length > 0) {
        sourcesHtml = `
          <div class="chat-sources">
            <strong>Fuentes consultadas:</strong>
            ${data.sources.map(src => {
              const fileName = src.metadata?.source ? src.metadata.source.split(/[\\/]/).pop() : 'Documento';
              const scoreText = src.score ? ` (score: ${src.score.toFixed(4)})` : '';
              const pageText = src.metadata?.loc?.pageNumber ? ` - pág. ${src.metadata.loc.pageNumber}` : '';
              return `<span class="source-item" title="${src.content.replace(/"/g, '&quot;')}">📄 ${fileName}${pageText}${scoreText}</span>`;
            }).join('')}
          </div>
        `;
      }
      thinkingBubble.innerHTML = `<div>${data.answer}</div>${sourcesHtml}`;
      
      // Log chat query for admin console
      try {
        const currentUser = localStorage.getItem('current_user') || 'anónimo';
        const logs = JSON.parse(localStorage.getItem('chat_history_db') || '[]');
        logs.push({
          email: currentUser,
          question: question,
          answer: data.answer,
          timestamp: Date.now()
        });
        localStorage.setItem('chat_history_db', JSON.stringify(logs));
        updateAdminConsole();
      } catch (e) {
        console.error(e);
      }
    } else {
      thinkingBubble.innerHTML = `<div style="color: var(--color-error);">Error al obtener respuesta del servidor. Por favor, revisa que esté activo.</div>`;
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  if (demoQuestionBtn) {
    demoQuestionBtn.addEventListener('click', () => {
      const questionInput = queryForm.querySelector('input[name="question"]');
      if (questionInput) {
        questionInput.value = '¿Cómo verifico que PostgreSQL está corriendo?';
        if (typeof queryForm.requestSubmit === 'function') {
          queryForm.requestSubmit();
        } else {
          queryForm.dispatchEvent(new Event('submit'));
        }
      }
    });
  }
}

// ── PROMPT & DIAGNOSTICS MANAGEMENT ─────────────────────────────────
async function loadPrompt() {
  const data = await sendRequest('/api/rag/admin/prompt');
  if (data && data.template) {
    const promptTextarea = document.getElementById('promptTemplate');
    if (promptTextarea) {
      promptTextarea.value = data.template;
    }
  }
}

const promptForm = document.getElementById('promptForm');
if (promptForm) {
  promptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(promptForm);
    const template = formData.get('template')?.toString() || '';
    const data = await sendRequest('/api/rag/admin/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    });
    if (data && !data.error) {
      alert('Prompt del sistema actualizado correctamente.');
    } else {
      alert(`Error al actualizar el prompt: ${data?.error || 'Verifique la consola para más detalles.'}`);
    }
  });
}

if (executeForm) {
  executeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(executeForm);
    const command = formData.get('command')?.toString() || '';
    const paramsRaw = formData.get('params')?.toString() || '';
    let params = {};
    try {
      params = paramsRaw ? JSON.parse(paramsRaw) : {};
    } catch (err) {
      alert('Parámetros JSON inválidos');
      return;
    }

    const submitBtn = executeForm.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.textContent = 'Ejecutando...';
      submitBtn.disabled = true;
    }

    const data = await sendRequest('/api/diagnostic/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...params }),
    });

    if (submitBtn) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }

    if (data && !data.error) {
      showConsole();
    } else {
      alert(`Error al ejecutar el diagnóstico: ${data?.error || 'Verifique la consola para más detalles.'}`);
    }
  });
}

if (whitelistAddForm) {
  whitelistAddForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(whitelistAddForm);
    const host = formData.get('host')?.toString() || '';
    const label = formData.get('label')?.toString() || '';
    const allowedCommandsRaw = formData.get('allowedCommands')?.toString() || '[]';
    let allowedCommands = [];
    try {
      allowedCommands = allowedCommandsRaw ? JSON.parse(allowedCommandsRaw) : [];
    } catch (err) {
      alert('allowedCommands JSON inválido');
      return;
    }
    const data = await sendRequest('/api/diagnostic/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, label, allowedCommands }),
    });
    if (data && !data.error) {
      alert(`Host "${host}" agregado correctamente.`);
      whitelistAddForm.reset();
    } else {
      alert(`Error al agregar host: ${data?.error || 'Verifique la consola para más detalles.'}`);
    }
  });
}

if (whitelistRemoveForm) {
  whitelistRemoveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(whitelistRemoveForm);
    const host = formData.get('host')?.toString() || '';
    const data = await sendRequest(`/api/diagnostic/whitelist/${encodeURIComponent(host)}`, { method: 'DELETE' });
    if (data && !data.error) {
      alert(`Host "${host}" eliminado correctamente.`);
      whitelistRemoveForm.reset();
    } else {
      alert(`Error al eliminar host: ${data?.error || 'Verifique la consola para más detalles.'}`);
    }
  });
}

// ── HELPER: LIST DOCUMENTS RENDER ──────────────────────────────────
async function handleListDocs() {
  const data = await sendRequest('/api/rag/docs/list');
  const docListContainer = document.getElementById('docListContainer');
  if (docListContainer) {
    if (data && data.files && data.files.length > 0) {
      docListContainer.style.display = 'flex';
      docListContainer.innerHTML = `
        <h3 style="font-size: 1rem; margin-bottom: 10px; color: var(--text-primary);">Documentos en ./docs (${data.count}):</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${data.files.map(file => {
            const fileName = file.split(/[\\/]/).pop();
            return `
              <div class="doc-item">
                <span class="doc-name">${fileName}</span>
                <span class="doc-meta" title="${file}">Ruta: ${file}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const mockFiles = JSON.parse(localStorage.getItem('mock_uploaded_files') || '[]');
      if (mockFiles.length > 0) {
        docListContainer.style.display = 'flex';
        docListContainer.innerHTML = `
          <h3 style="font-size: 1rem; margin-bottom: 10px; color: var(--text-primary);">Documentos Indexados (${mockFiles.length}):</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${mockFiles.map(file => `
              <div class="doc-item">
                <span class="doc-name">${file.name}</span>
                <span class="doc-meta" title="${file.path}">Ruta: ${file.path} (${(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        docListContainer.style.display = 'flex';
        docListContainer.innerHTML = `<p style="font-size: 0.9rem; color: var(--text-secondary);">No se encontraron documentos en ./docs.</p>`;
      }
    }
  }
}

// ── API BASE URL CONFIGURATION FORM ────────────────────────────────
const apiConfigForm = document.getElementById('apiConfigForm');
const apiBaseUrlInput = document.getElementById('apiBaseUrlInput');

if (apiBaseUrlInput) {
  apiBaseUrlInput.value = getApiBaseUrl();
}

if (apiConfigForm) {
  apiConfigForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = apiBaseUrlInput.value.trim();
    if (url) {
      localStorage.setItem('api_base_url', url);
      alert(`Dirección de la API actualizada a: ${url}. Se actualizarán las estadísticas y estados.`);
      updateStatusIndicators();
      updateStats();
    } else {
      localStorage.removeItem('api_base_url');
      alert('Se ha restablecido la dirección API predeterminada.');
      if (apiBaseUrlInput) {
        apiBaseUrlInput.value = getApiBaseUrl();
      }
      updateStatusIndicators();
      updateStats();
    }
  });
}

// ── SIMULATED PAYWALL AND BILLING MANAGEMENT ────────────────────────
let activeSelectedPlan = null;

function initSubscriptions() {
  updateSidebarLocks();
  updateSubscriptionBillingStatus();
  
  // Set current user email label in header
  const currentUserLabel = document.getElementById('currentUserLabel');
  const currentEmail = localStorage.getItem('current_user') || '';
  if (currentUserLabel) {
    currentUserLabel.innerText = `Sesión: ${currentEmail || 'n/a'}`;
  }

  // Admin access validation for Configuración RAG and Cuentas Vinculadas
  const parts = currentEmail.split('@');
  const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');

  const configBtn = document.querySelector('.menu-btn[data-tab="config-tab"]');
  if (configBtn) {
    configBtn.style.display = isAdmin ? 'flex' : 'none';
  }

  const accountsBtn = document.getElementById('menuBtnAccounts');
  if (accountsBtn) {
    accountsBtn.style.display = isAdmin ? 'flex' : 'none';
  }

  // Handle chat attach options visibility based on Documentación subscription
  const hasDocsSub = isAdmin || getSessionValue('sub_docs') === 'true' || getSessionValue('sub_premium') === 'true';
  
  const chatAttachOptions = document.getElementById('chatAttachOptions');
  if (chatAttachOptions) {
    chatAttachOptions.style.display = hasDocsSub ? 'flex' : 'none';
  }

  const btnChatAttachFile = document.getElementById('btnChatAttachFile');
  if (btnChatAttachFile) {
    btnChatAttachFile.style.display = hasDocsSub ? 'flex' : 'none';
  }

  updateAdminConsole();
  updateChatLimitCounter();
}

function updateAdminConsole() {
  const currentUser = localStorage.getItem('current_user') || '';
  const parts = currentUser.split('@');
  const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');

  // Verify accounts tab button visibility
  const accountsBtn = document.getElementById('menuBtnAccounts');
  if (accountsBtn) {
    accountsBtn.style.display = isAdmin ? 'flex' : 'none';
  }

  if (!isAdmin) return;

  const users = JSON.parse(localStorage.getItem('users_db') || '[]');
  
  // Separate admin and regular users
  const adminUsers = users.filter(u => {
    const p = u.email.split('@');
    return p.length > 1 && p[1].toLowerCase().startsWith('teto');
  });

  const regularUsers = users.filter(u => {
    const p = u.email.split('@');
    return !(p.length > 1 && p[1].toLowerCase().startsWith('teto'));
  });

  // 1. Render Admins list
  const adminTbody = document.getElementById('adminAccountsListBody');
  if (adminTbody) {
    adminTbody.innerHTML = adminUsers.map(u => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 10px 15px; font-weight: 500; color: var(--color-primary);">${u.email}</td>
        <td style="padding: 10px 15px; font-family: monospace; color: var(--text-secondary);">${u.password}</td>
        <td style="padding: 10px 15px; font-weight: 600; color: var(--color-primary);">Administrador 👑</td>
      </tr>
    `).join('') || `<tr><td colspan="3" style="padding: 15px; text-align: center; color: var(--text-secondary);">No hay administradores registrados.</td></tr>`;
  }

  // 2. Render Regular Users list
  const regularTbody = document.getElementById('regularAccountsListBody');
  if (regularTbody) {
    regularTbody.innerHTML = regularUsers.map(u => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 10px 15px; font-weight: 500;">${u.email}</td>
        <td style="padding: 10px 15px; font-family: monospace; color: var(--text-secondary);">${u.password}</td>
        <td style="padding: 10px 15px; color: ${u.sub_docs ? 'var(--color-success)' : 'var(--text-secondary)'}; font-weight: 600;">${u.sub_docs ? 'Activo ✅' : 'Inactivo ❌'}</td>
        <td style="padding: 10px 15px; color: ${u.sub_diag ? 'var(--color-success)' : 'var(--text-secondary)'}; font-weight: 600;">${u.sub_diag ? 'Activo ✅' : 'Inactivo ❌'}</td>
        <td style="padding: 10px 15px; color: ${u.sub_premium ? 'var(--color-success)' : 'var(--text-secondary)'}; font-weight: 600;">${u.sub_premium ? 'Activo ✅' : 'Inactivo ❌'}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="padding: 15px; text-align: center; color: var(--text-secondary);">No hay usuarios convencionales registrados.</td></tr>`;
  }

  // 3. Render Chat Logs
  const logs = JSON.parse(localStorage.getItem('chat_history_db') || '[]');
  const logsContainer = document.getElementById('adminChatLogsContainer');
  if (logsContainer) {
    logsContainer.innerHTML = logs.map(l => {
      const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : 'n/a';
      return `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 10px; margin-bottom: 5px;">
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary); margin-bottom: 4px;">
            <span>Usuario: <b>${l.email}</b></span>
            <span>${timeStr}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--text-primary); margin-bottom: 4px;"><b>Pregunta:</b> ${l.question}</div>
          <div style="font-size:0.85rem; color:#a5b4fc; background:rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border-left: 3px solid var(--color-primary); line-height: 1.4;">
            <b>Respuesta RAG:</b> ${l.answer}
          </div>
        </div>
      `;
    }).reverse().join('') || `<div style="text-align: center; color: var(--text-secondary); padding: 15px;">No se han registrado consultas al chat RAG todavía.</div>`;
  }
}

function getPremiumPriceInfo() {
  const isFirstPurchase = getSessionValue('first_purchase_done') !== 'true';
  const subDocs = getSessionValue('sub_docs') === 'true';
  const subDiag = getSessionValue('sub_diag') === 'true';

  let originalPrice = 99.99;
  let promoApplied = false;
  let finalPrice = originalPrice;

  if (isFirstPurchase) {
    promoApplied = true;
    finalPrice = 9.99;
  } else {
    // Calculate upgrade discounts based on already paid tiers
    let discount = 0;
    if (subDocs) discount += 29.99;
    if (subDiag) discount += 39.99;

    finalPrice = Math.max(0, originalPrice - discount);
  }

  return {
    originalPrice,
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    promoApplied,
    isFirstPurchase
  };
}

function openPaywall(targetTab = null) {
  const paywallModal = document.getElementById('paywallModal');
  if (!paywallModal) return;

  const info = getPremiumPriceInfo();

  const originalPremium = document.getElementById('price-original-premium');
  const pricePremium = document.getElementById('price-premium');
  const promoPremium = document.getElementById('promo-premium');

  if (info.promoApplied) {
    if (originalPremium) originalPremium.style.display = 'block';
    if (pricePremium) pricePremium.innerHTML = '$9.99<span>/mes</span>';
    if (promoPremium) {
      promoPremium.style.display = 'inline-block';
      promoPremium.innerText = '¡Oferta primer pago!';
    }
  } else if (info.finalPrice < info.originalPrice) {
    if (originalPremium) originalPremium.style.display = 'block';
    if (pricePremium) pricePremium.innerHTML = `$${info.finalPrice}<span>/mes</span>`;
    if (promoPremium) {
      promoPremium.style.display = 'inline-block';
      promoPremium.innerText = '¡Descuento de actualización!';
    }
  } else {
    if (originalPremium) originalPremium.style.display = 'none';
    if (pricePremium) pricePremium.innerHTML = '$99.99<span>/mes</span>';
    if (promoPremium) promoPremium.style.display = 'none';
  }

  // Reset modal screens
  const plansDiv = document.getElementById('paywallPlans');
  const checkoutDiv = document.getElementById('paywallCheckout');
  const processingDiv = document.getElementById('paywallProcessing');
  const successDiv = document.getElementById('paywallSuccess');

  if (plansDiv) plansDiv.style.display = 'block';
  if (checkoutDiv) checkoutDiv.style.display = 'none';
  if (processingDiv) processingDiv.style.display = 'none';
  if (successDiv) successDiv.style.display = 'none';

  // Hide plans that are already subscribed, keeping layout centered and balanced
  const subDocs = getSessionValue('sub_docs') === 'true';
  const subDiag = getSessionValue('sub_diag') === 'true';

  const cardDocs = document.getElementById('card-docs');
  const cardDiag = document.getElementById('card-diag');

  let visibleCount = 3;

  if (cardDocs) {
    if (subDocs) {
      cardDocs.style.display = 'none';
      visibleCount--;
    } else {
      cardDocs.style.display = 'flex';
    }
  }

  if (cardDiag) {
    if (subDiag) {
      cardDiag.style.display = 'none';
      visibleCount--;
    } else {
      cardDiag.style.display = 'flex';
    }
  }

  // Adjust CSS Grid columns dynamically
  const grid = document.querySelector('.pricing-grid');
  if (grid) {
    if (visibleCount === 3) {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      grid.style.maxWidth = '100%';
    } else if (visibleCount === 2) {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
      grid.style.maxWidth = '580px';
      grid.style.margin = '0 auto 10px';
    } else if (visibleCount === 1) {
      grid.style.gridTemplateColumns = '1fr';
      grid.style.maxWidth = '300px';
      grid.style.margin = '0 auto 10px';
    }
  }

  paywallModal.classList.add('active');
}

function closePaywall() {
  const paywallModal = document.getElementById('paywallModal');
  if (paywallModal) {
    paywallModal.classList.remove('active');
  }
}

function selectPlan(plan) {
  activeSelectedPlan = plan;
  let planNameText = '';
  let priceText = '';

  if (plan === 'docs') {
    planNameText = 'Suscripción: Plan Documentación';
    priceText = '$29.99';
  } else if (plan === 'diag') {
    planNameText = 'Suscripción: Plan Diagnósticos';
    priceText = '$39.99';
  } else if (plan === 'premium') {
    const info = getPremiumPriceInfo();
    planNameText = 'Suscripción: Plan Premium Todo Incluido';
    priceText = `$${info.finalPrice}`;
  }

  const nameEl = document.getElementById('checkoutPlanName');
  const priceEl = document.getElementById('checkoutPrice');

  if (nameEl) nameEl.innerText = planNameText;
  if (priceEl) priceEl.innerText = priceText;

  const form = document.getElementById('mockPaymentForm');
  if (form) form.reset();

  const plansDiv = document.getElementById('paywallPlans');
  const checkoutDiv = document.getElementById('paywallCheckout');

  if (plansDiv) plansDiv.style.display = 'none';
  if (checkoutDiv) checkoutDiv.style.display = 'flex';
}

function goBackToPlans() {
  const plansDiv = document.getElementById('paywallPlans');
  const checkoutDiv = document.getElementById('paywallCheckout');
  if (plansDiv) plansDiv.style.display = 'block';
  if (checkoutDiv) checkoutDiv.style.display = 'none';
}

function processPayment(event) {
  event.preventDefault();
  
  const checkoutDiv = document.getElementById('paywallCheckout');
  const processingDiv = document.getElementById('paywallProcessing');
  
  if (checkoutDiv) checkoutDiv.style.display = 'none';
  if (processingDiv) processingDiv.style.display = 'flex';

  setTimeout(() => {
    if (processingDiv) processingDiv.style.display = 'none';
    
    if (activeSelectedPlan === 'docs') {
      setSessionValue('sub_docs', 'true');
      const msg = document.getElementById('successMessage');
      if (msg) msg.innerText = 'Tu Plan Documentación ha sido activado correctamente.';
    } else if (activeSelectedPlan === 'diag') {
      setSessionValue('sub_diag', 'true');
      const msg = document.getElementById('successMessage');
      if (msg) msg.innerText = 'Tu Plan Diagnósticos ha sido activado correctamente.';
    } else if (activeSelectedPlan === 'premium') {
      setSessionValue('sub_premium', 'true');
      const msg = document.getElementById('successMessage');
      if (msg) msg.innerText = 'Tu Plan Premium Todo Incluido ha sido activado correctamente.';
    }

    setSessionValue('first_purchase_done', 'true');

    updateSidebarLocks();
    updateSubscriptionBillingStatus();
    updateAdminConsole();
    updateChatLimitCounter();

    const successDiv = document.getElementById('paywallSuccess');
    if (successDiv) successDiv.style.display = 'flex';
  }, 1500);
}

function finishSubscriptionFlow() {
  closePaywall();
  if (activeSelectedPlan === 'docs' || activeSelectedPlan === 'premium') {
    const docsBtn = document.querySelector('.menu-btn[data-tab="docs-tab"]');
    if (docsBtn) docsBtn.click();
  } else if (activeSelectedPlan === 'diag') {
    const diagBtn = document.querySelector('.menu-btn[data-tab="diag-tab"]');
    if (diagBtn) diagBtn.click();
  }
}

function resetSubscriptions() {
  removeSessionValue('sub_docs');
  removeSessionValue('sub_diag');
  removeSessionValue('sub_premium');
  removeSessionValue('first_purchase_done');
  localStorage.removeItem('chat_history_db');

  // Reset questions asked count for current user
  const currentUser = localStorage.getItem('current_user');
  if (currentUser) {
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    const userIndex = users.findIndex(u => u.email.toLowerCase() === currentUser.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].questions_asked = 0;
      localStorage.setItem('users_db', JSON.stringify(users));
    }
  }

  alert('Todas las suscripciones han sido canceladas y el beneficio de primera compra ha sido restablecido.');
  
  updateSidebarLocks();
  updateSubscriptionBillingStatus();
  updateAdminConsole();
  updateChatLimitCounter();
  
  const chatBtn = document.querySelector('.menu-btn[data-tab="chat-tab"]');
  if (chatBtn) chatBtn.click();
}

function updateSidebarLocks() {
  const currentUser = localStorage.getItem('current_user') || '';
  const parts = currentUser.split('@');
  const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');

  const isDocsSubscribed = isAdmin || getSessionValue('sub_docs') === 'true' || getSessionValue('sub_premium') === 'true';
  const isDiagSubscribed = isAdmin || getSessionValue('sub_diag') === 'true' || getSessionValue('sub_premium') === 'true';

  const docsBtn = document.querySelector('.menu-btn[data-tab="docs-tab"]');
  const diagBtn = document.querySelector('.menu-btn[data-tab="diag-tab"]');

  if (docsBtn) {
    docsBtn.innerHTML = `📄 Documentación ${isDocsSubscribed ? '' : '🔒'}`;
  }
  if (diagBtn) {
    diagBtn.innerHTML = `⚙️ Diagnósticos ${isDiagSubscribed ? '' : '🔒'}`;
  }
}

function updateSubscriptionBillingStatus() {
  const subDocs = getSessionValue('sub_docs') === 'true';
  const subDiag = getSessionValue('sub_diag') === 'true';
  const subPremium = getSessionValue('sub_premium') === 'true';
  const promoUsed = getSessionValue('first_purchase_done') === 'true';

  const statusDocs = document.getElementById('sub-status-docs');
  const statusDiag = document.getElementById('sub-status-diag');
  const statusPremium = document.getElementById('sub-status-premium');
  const statusPromo = document.getElementById('sub-status-promo');

  if (statusDocs) {
    statusDocs.innerText = subDocs ? 'Activa ✅' : 'Inactiva ❌';
    statusDocs.style.color = subDocs ? 'var(--color-success)' : 'var(--text-secondary)';
  }
  if (statusDiag) {
    statusDiag.innerText = subDiag ? 'Activa ✅' : 'Inactiva ❌';
    statusDiag.style.color = subDiag ? 'var(--color-success)' : 'var(--text-secondary)';
  }
  if (statusPremium) {
    statusPremium.innerText = subPremium ? 'Activa ✅' : 'Inactiva ❌';
    statusPremium.style.color = subPremium ? 'var(--color-success)' : 'var(--text-secondary)';
  }
  if (statusPromo) {
    statusPromo.innerText = promoUsed ? 'Usado ❌' : 'Disponible ($9.99) ✅';
    statusPromo.style.color = promoUsed ? 'var(--text-secondary)' : 'var(--color-success)';
  }
}

function logout() {
  localStorage.removeItem('current_user');
  window.location.replace('login.html');
}

// Bind to window to allow inline html onclick calls to function correctly
window.initSubscriptions = initSubscriptions;
window.openPaywall = openPaywall;
window.closePaywall = closePaywall;
window.selectPlan = selectPlan;
window.goBackToPlans = goBackToPlans;
window.processPayment = processPayment;
window.finishSubscriptionFlow = finishSubscriptionFlow;
window.resetSubscriptions = resetSubscriptions;
window.logout = logout;

// ── CHAT ATTACHMENTS LOGIC ──────────────────────────────────────────
let currentChatAttachment = null;

const btnChatAttachFile = document.getElementById('btnChatAttachFile');
const chatFileInput = document.getElementById('chatFileInput');
const chatAttachmentPreview = document.getElementById('chatAttachmentPreview');
const chatAttachmentName = document.getElementById('chatAttachmentName');
const btnRemoveChatAttachment = document.getElementById('btnRemoveChatAttachment');

if (btnChatAttachFile && chatFileInput) {
  btnChatAttachFile.addEventListener('click', () => {
    chatFileInput.click();
  });
}

if (chatFileInput) {
  chatFileInput.addEventListener('change', () => {
    if (chatFileInput.files && chatFileInput.files.length > 0) {
      const file = chatFileInput.files[0];
      
      const currentUser = localStorage.getItem('current_user') || '';
      const parts = currentUser.split('@');
      const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');
      const hasPremiumSub = isAdmin || getSessionValue('sub_premium') === 'true';

      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      
      if (!hasPremiumSub) {
        // Limited to .txt, .png, .jpg, .jpeg
        const allowedExtensions = ['.txt', '.png', '.jpg', '.jpeg'];
        if (!allowedExtensions.includes(ext)) {
          alert('⚠️ Tu plan actual de Documentación solo permite adjuntar archivos de texto (.txt) e imágenes (.png, .jpg). Para adjuntar cualquier tipo de archivo (como .pdf o .md), por favor actualiza al Plan Premium Todo Incluido.');
          chatFileInput.value = '';
          openPaywall('premium');
          return;
        }
      }

      currentChatAttachment = {
        type: 'local',
        name: file.name,
        size: file.size
      };
      if (chatAttachmentName) {
        chatAttachmentName.innerText = `📎 Archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
      if (chatAttachmentPreview) {
        chatAttachmentPreview.style.display = 'flex';
      }
    }
  });
}

if (btnRemoveChatAttachment) {
  btnRemoveChatAttachment.addEventListener('click', () => {
    currentChatAttachment = null;
    if (chatFileInput) chatFileInput.value = '';
    if (chatAttachmentPreview) {
      chatAttachmentPreview.style.display = 'none';
    }
  });
}

async function openSelectSavedDocModal() {
  const modal = document.getElementById('selectSavedDocModal');
  const container = document.getElementById('savedDocsListContainer');
  if (!modal || !container) return;

  modal.classList.add('active');
  container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Cargando documentos...</p>';

  // Fetch from backend
  let files = [];
  try {
    const data = await sendRequest('/api/rag/docs/list');
    if (data && data.files) {
      files = data.files.map(f => ({
        name: f.split(/[\\/]/).pop(),
        path: f
      }));
    }
  } catch (e) {
    console.warn("Backend offline for attachment selection.");
  }

  // Combine with mock uploaded files
  const mockFiles = JSON.parse(localStorage.getItem('mock_uploaded_files') || '[]');
  mockFiles.forEach(mf => {
    if (!files.some(f => f.name === mf.name)) {
      files.push({
        name: mf.name,
        path: mf.path
      });
    }
  });

  if (files.length > 0) {
    container.innerHTML = files.map(file => `
      <div class="saved-doc-select-item" 
           data-name="${file.name.replace(/"/g, '&quot;')}" 
           data-path="${file.path.replace(/"/g, '&quot;')}"
           style="padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s ease; display:flex; align-items:center; gap: 10px; background: rgba(255,255,255,0.02);" 
           onmouseover="this.style.background='rgba(255,255,255,0.06)'" 
           onmouseout="this.style.background='rgba(255,255,255,0.02)'">
        <span style="font-size: 1.2rem;">📄</span>
        <div style="text-align: left; flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${file.name}</div>
          <div style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">Ruta: ${file.path}</div>
        </div>
      </div>
    `).join('');

    // Programmatically attach click listeners safely to avoid escape sequence issues
    container.querySelectorAll('.saved-doc-select-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.getAttribute('data-name');
        const path = item.getAttribute('data-path');
        selectSavedDoc(name, path);
      });
    });
  } else {
    container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; font-size: 0.9rem; padding: 15px;">No hay documentos indexados en el sistema. Sube uno primero en la pestaña Documentación.</p>';
  }
}

function closeSelectSavedDocModal() {
  const modal = document.getElementById('selectSavedDocModal');
  if (modal) modal.classList.remove('active');
}

function selectSavedDoc(name, path) {
  currentChatAttachment = {
    type: 'saved',
    name: name,
    path: path
  };
  if (chatAttachmentName) {
    chatAttachmentName.innerText = `📁 Archivo Guardado: ${name}`;
  }
  if (chatAttachmentPreview) {
    chatAttachmentPreview.style.display = 'flex';
  }
  closeSelectSavedDocModal();
}



window.openSelectSavedDocModal = openSelectSavedDocModal;
window.closeSelectSavedDocModal = closeSelectSavedDocModal;
window.selectSavedDoc = selectSavedDoc;

// ── LIMIT CALCULATORS & COUNTERS HELPERS ────────────────────────────
function getQuestionsAsked() {
  const currentUser = localStorage.getItem('current_user');
  if (!currentUser) return 0;
  const users = JSON.parse(localStorage.getItem('users_db') || '[]');
  const user = users.find(u => u.email.toLowerCase() === currentUser.toLowerCase());
  return user ? (user.questions_asked || 0) : 0;
}

function incrementQuestionsAsked() {
  const currentUser = localStorage.getItem('current_user');
  if (!currentUser) return;
  const users = JSON.parse(localStorage.getItem('users_db') || '[]');
  const userIndex = users.findIndex(u => u.email.toLowerCase() === currentUser.toLowerCase());
  if (userIndex !== -1) {
    users[userIndex].questions_asked = (users[userIndex].questions_asked || 0) + 1;
    localStorage.setItem('users_db', JSON.stringify(users));
  }
}

function getQueryLimitInfo() {
  const currentUser = localStorage.getItem('current_user') || '';
  const parts = currentUser.split('@');
  const isAdmin = parts.length > 1 && parts[1].toLowerCase().startsWith('teto');

  if (isAdmin) {
    return {
      limit: Infinity,
      used: 0,
      remaining: Infinity,
      unlimited: true
    };
  }

  const subDocs = getSessionValue('sub_docs') === 'true';
  const subDiag = getSessionValue('sub_diag') === 'true';
  const subPremium = getSessionValue('sub_premium') === 'true';
  const used = getQuestionsAsked();

  let baseLimit = 5;
  let addedLimit = 0;

  if (subPremium) {
    // Premium overrides other plans, providing exactly 5 + 100 = 105
    addedLimit = 100;
  } else {
    // Cumulative sum of individual plans
    if (subDocs) addedLimit += 10;
    if (subDiag) addedLimit += 15;
  }

  const totalLimit = baseLimit + addedLimit;
  const remaining = Math.max(0, totalLimit - used);

  return {
    limit: totalLimit,
    used: used,
    remaining: remaining,
    unlimited: false
  };
}

function updateChatLimitCounter() {
  const counterEl = document.getElementById('chatLimitCounter');
  if (!counterEl) return;
  const info = getQueryLimitInfo();
  if (info.unlimited) {
    counterEl.innerText = 'Ilimitado 👑';
    counterEl.style.color = 'var(--color-primary)';
    counterEl.style.background = 'rgba(99, 102, 241, 0.15)';
    counterEl.style.borderColor = 'rgba(99, 102, 241, 0.3)';
  } else {
    counterEl.innerText = `${info.used} / ${info.limit}`;
    if (info.remaining <= 0) {
      counterEl.style.color = 'var(--color-error)';
      counterEl.style.background = 'var(--color-error-bg)';
      counterEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    } else if (info.remaining <= 2) {
      counterEl.style.color = 'var(--color-warning)';
      counterEl.style.background = 'var(--color-warning-bg)';
      counterEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    } else {
      counterEl.style.color = '#a5b4fc';
      counterEl.style.background = 'rgba(99, 102, 241, 0.1)';
      counterEl.style.borderColor = 'rgba(99, 102, 241, 0.2)';
    }
  }
}

window.getQueryLimitInfo = getQueryLimitInfo;
window.updateChatLimitCounter = updateChatLimitCounter;
