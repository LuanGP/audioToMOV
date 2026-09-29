import { FFmpeg } from './vendor/ffmpeg/esm/index.js';
import { fetchFile } from './vendor/util/esm/index.js';

const MAX_FILE_SIZE_MB = 200;
const VENDOR_BASE = new URL('./vendor/', import.meta.url);

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.oga', '.opus',
  '.wma', '.aiff', '.aif', '.aifc', '.alac', '.caf', '.ac3', '.eac3',
  '.ape', '.wv', '.tta', '.tak', '.dts', '.amr', '.mp2', '.mpa',
  '.dsf', '.dff', '.mka', '.spx', '.gsm', '.vox',
  '.au', '.snd', '.ra', '.ram', '.voc', '.w64', '.rf64', '.bwf',
  '.nist', '.ircam', '.8svx', '.sf', '.paf', '.fap', '.pvf',
  '.xi', '.wve', '.pcm', '.raw',
]);

const ACCEPT_ATTR = [...AUDIO_EXTENSIONS].join(',');

const els = {
  loaderPanel: document.getElementById('loader-panel'),
  loaderText: document.getElementById('loader-text'),
  mainPanel: document.getElementById('main-panel'),
  dropZone: document.getElementById('drop-zone'),
  centralText: document.getElementById('central-text'),
  fileInput: document.getElementById('file-input'),
  queuePanel: document.getElementById('queue-panel'),
  queueList: document.getElementById('queue-list'),
  btnRemove: document.getElementById('btn-remove'),
  btnConvert: document.getElementById('btn-convert'),
  progressPanel: document.getElementById('progress-panel'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  toast: document.getElementById('toast'),
};

const state = {
  queue: [],
  selectedIndex: -1,
  ffmpeg: null,
  ffmpegReady: false,
  converting: false,
};

els.fileInput.accept = ACCEPT_ATTR;

function getExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function stem(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(0, dot) : name;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let toastTimer;
function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 4000);
}

function setLoader(text) {
  els.loaderText.textContent = text;
}

function showMain() {
  els.loaderPanel.classList.add('hidden');
  els.mainPanel.classList.remove('hidden');
}

function updateQueueUI() {
  const hasFiles = state.queue.length > 0;

  if (hasFiles) {
    els.dropZone.classList.add('hidden');
    els.queuePanel.classList.remove('hidden');
    els.centralText.textContent = `${state.queue.length} arquivo(s) na fila`;
  } else {
    els.dropZone.classList.remove('hidden');
    els.queuePanel.classList.add('hidden');
    els.centralText.textContent = 'Arraste aqui para converter';
    state.selectedIndex = -1;
  }

  els.queueList.innerHTML = '';
  state.queue.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = `${item.file.name} (${formatSize(item.file.size)})`;
    li.dataset.index = String(index);
    li.setAttribute('role', 'option');
    if (index === state.selectedIndex) li.classList.add('selected');
    li.addEventListener('click', () => {
      state.selectedIndex = index;
      updateQueueUI();
    });
    els.queueList.appendChild(li);
  });
}

function addFiles(fileList) {
  let added = 0;
  let skipped = 0;

  for (const file of fileList) {
    const ext = getExtension(file.name);
    if (!AUDIO_EXTENSIONS.has(ext)) {
      skipped++;
      continue;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`${file.name} é grande demais (máx. ${MAX_FILE_SIZE_MB} MB)`, 'error');
      skipped++;
      continue;
    }
    if (state.queue.some((q) => q.file.name === file.name && q.file.size === file.size)) {
      continue;
    }
    state.queue.push({ file, status: 'pending' });
    added++;
  }

  if (added) updateQueueUI();
  if (skipped && !added) {
    showToast('Nenhum arquivo de áudio válido encontrado', 'error');
  }
}

function removeSelected() {
  if (state.selectedIndex < 0 || state.converting) return;
  state.queue.splice(state.selectedIndex, 1);
  state.selectedIndex = -1;
  updateQueueUI();
}

function setProgress(percent, text, indeterminate = false) {
  els.progressPanel.classList.remove('hidden');
  const track = els.progressFill.parentElement;
  if (indeterminate) {
    els.progressFill.classList.add('indeterminate');
    els.progressFill.style.width = '';
    track.setAttribute('aria-valuenow', '0');
  } else {
    els.progressFill.classList.remove('indeterminate');
    const value = Math.min(100, Math.max(0, percent));
    els.progressFill.style.width = `${value}%`;
    track.setAttribute('aria-valuenow', String(Math.round(value)));
  }
  els.progressText.textContent = text;
}

function hideProgress() {
  els.progressPanel.classList.add('hidden');
  els.progressFill.classList.remove('indeterminate');
  els.progressFill.style.width = '0%';
}

async function loadFFmpeg() {
  if (state.ffmpegReady) return state.ffmpeg;

  setLoader('Carregando FFmpeg…');
  const ffmpeg = new FFmpeg();
  state.ffmpeg = ffmpeg;

  ffmpeg.on('progress', ({ progress }) => {
    if (!state.converting) return;
    const pct = Math.round((progress || 0) * 100);
    setProgress(pct, els.progressText.textContent.split('\n')[0] + `\n${pct}%`);
  });

  // Arquivos locais em web/vendor (mesmo origin — sem CDN)
  await ffmpeg.load({
    coreURL: new URL('core/ffmpeg-core.js', VENDOR_BASE).href,
    wasmURL: new URL('core/ffmpeg-core.wasm', VENDOR_BASE).href,
  });

  state.ffmpegReady = true;
  return ffmpeg;
}

async function convertFile(ffmpeg, file) {
  const inputName = `input${getExtension(file.name) || '.audio'}`;
  const outputName = 'output.wav';

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  const exitCode = await ffmpeg.exec([
    '-nostdin',
    '-i', inputName,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-f', 'wav',
    '-y',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);

  try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
  try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }

  if (exitCode !== 0) {
    throw new Error(`FFmpeg retornou código ${exitCode}`);
  }

  return new Blob([data], { type: 'audio/wav' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function convertQueue() {
  if (!state.queue.length || state.converting) return;

  state.converting = true;
  els.btnConvert.disabled = true;
  els.btnRemove.disabled = true;
  els.dropZone.classList.add('hidden');
  els.queuePanel.classList.add('hidden');
  els.dropZone.classList.remove('hidden');

  let ffmpeg;
  try {
    setProgress(0, 'Preparando conversor…', true);
    ffmpeg = await loadFFmpeg();
  } catch (err) {
    showToast('Erro ao carregar FFmpeg. Recarregue a página.', 'error');
    state.converting = false;
    els.btnConvert.disabled = false;
    els.btnRemove.disabled = false;
    hideProgress();
    updateQueueUI();
    console.error(err);
    return;
  }

  showMain();
  const total = state.queue.length;
  let success = 0;
  const failures = [];

  for (let i = 0; i < total; i++) {
    const item = state.queue[i];
    const label = `Convertendo ${i + 1}/${total}\n${item.file.name}`;
    setProgress(0, label, true);

    try {
      const blob = await convertFile(ffmpeg, item.file);
      downloadBlob(blob, `${stem(item.file.name)}.wav`);
      item.status = 'done';
      success++;
    } catch (err) {
      item.status = 'error';
      failures.push(item.file.name);
      console.error(err);
    }
  }

  hideProgress();
  state.queue = [];
  state.selectedIndex = -1;
  state.converting = false;
  els.btnConvert.disabled = false;
  els.btnRemove.disabled = false;
  updateQueueUI();

  if (success === total) {
    showToast(`Todos os ${total} arquivo(s) convertidos!`, 'success');
  } else if (success > 0) {
    showToast(`${success}/${total} convertidos. Falhas: ${failures.slice(0, 3).join(', ')}`, 'error');
  } else {
    showToast('Nenhum arquivo foi convertido. Tente outro formato.', 'error');
  }
}

function setupDragDrop() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, () => els.dropZone.classList.add('drag-over'));
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, () => els.dropZone.classList.remove('drag-over'));
  });

  els.dropZone.addEventListener('drop', (e) => {
    if (state.converting) return;
    addFiles(e.dataTransfer.files);
  });

  els.dropZone.addEventListener('click', () => {
    if (!state.converting) els.fileInput.click();
  });

  els.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!state.converting) els.fileInput.click();
    }
  });

  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files?.length) {
      addFiles(els.fileInput.files);
      els.fileInput.value = '';
    }
  });

  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (state.converting) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  });
}

els.btnRemove.addEventListener('click', removeSelected);
els.btnConvert.addEventListener('click', convertQueue);

setupDragDrop();

loadFFmpeg()
  .then(() => {
    showMain();
  })
  .catch((err) => {
    const detail = err?.message || String(err);
    setLoader(`Erro ao carregar. Recarregue a página.\n(${detail})`);
    console.error(err);
  });
