// Test-only Chrome transport. All linting, rules, fixes and UI are production code.
const manifest = await (await fetch('/manifest.json')).json();
const listeners = [];
const storageListeners = new Set();
const parameters = new URLSearchParams(location.search);
window.preview = { failSave: false, failLoad: parameters.has('failLoad'), failRules: parameters.has('failRules'), delay: Number(parameters.get('delay') || 0) };
const pause = () => new Promise(resolve => setTimeout(resolve, window.preview.delay));
const dispatch = (message, index = 0) => new Promise((resolve, reject) => {
  if (!listeners[index]) return reject(new Error('No message listener registered'));
  listeners[index](message, {}, resolve);
});
window.chrome = {
  runtime: {
    getURL: path => new URL(`/${path}`, location.origin).href,
    getManifest: () => manifest,
    onMessage: { addListener: listener => listeners.push(listener) },
    sendMessage(message, callback) {
      const result = message.type === 'GET_RULES' && window.preview.failRules
        ? Promise.resolve({ type: 'ERROR', message: 'Test rule service unavailable' })
        : dispatch(message);
      if (callback) result.then(callback);
      return result;
    },
  },
  storage: {
    sync: {
      async get(key) {
        await pause();
        if (window.preview.failLoad) throw new Error('Test storage unavailable');
        return { [key]: JSON.parse(localStorage.getItem(key) || 'null') };
      },
      async set(items) {
        await pause();
        if (window.preview.failSave) throw new Error('Test save unavailable');
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          changes[key] = { oldValue: JSON.parse(localStorage.getItem(key) || 'null'), newValue: value };
          localStorage.setItem(key, JSON.stringify(value));
        }
        storageListeners.forEach(listener => listener(changes, 'sync'));
      },
    },
    onChanged: { addListener: listener => storageListeners.add(listener), removeListener: listener => storageListeners.delete(listener) },
  },
  tabs: {
    query: async () => [{ id: 1, url: parameters.get('page') || 'https://github.com/example/project/issues/new' }],
    sendMessage: async () => ({ type: 'PAGE_STATUS_RESULT', status: { editorCount: Number(parameters.get('editors') ?? 1), serviceWorkerHealthy: !parameters.has('unhealthy') } }),
  },
};
// Use the bundled service worker in the page; only its Chrome transport is replaced.
await import('/dist/background/service-worker.js');
if (location.pathname.includes('/fixtures/')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/dist/content/styles.css';
  document.head.append(link);
  await import('/dist/content/content-script.js');
}
