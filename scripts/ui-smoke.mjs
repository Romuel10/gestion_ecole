const endpoint = process.env.SEKOLY_CDP || 'http://127.0.0.1:9222';
const appUrl = process.env.SEKOLY_URL || 'http://127.0.0.1:4173';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 40) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error(`Service unavailable: ${url}`);
}

await waitForJson(`${endpoint}/json/version`);

const targetResponse = await fetch(
  `${endpoint}/json/new?${encodeURIComponent(appUrl)}`,
  { method: 'PUT' }
);
if (!targetResponse.ok) {
  throw new Error(`Cannot open Sekoly in Chrome: ${targetResponse.status}`);
}
const target = await targetResponse.json();
if (!target.webSocketDebuggerUrl) throw new Error('Missing DevTools URL.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(
      message.params?.exceptionDetails?.exception?.description ||
        message.params?.exceptionDetails?.text ||
        'Unknown JavaScript error'
    );
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Browser JavaScript error'
    );
  }
  return result.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

for (let i = 0; i < 60; i += 1) {
  const ready = await evaluate(
    `document.readyState === 'complete' && document.body.innerText.includes('Tableau de bord')`
  );
  if (ready) break;
  if (i === 59) throw new Error('Sekoly UI did not finish loading.');
  await sleep(250);
}

const views = [
  ['Tableau de bord', 'Tableau de bord'],
  ['Admissions', 'Admissions'],
  ['\u00c9l\u00e8ves', '\u00c9l\u00e8ves'],
  ['Notes et bulletins', 'Notes et bulletins'],
  ['Emploi du temps', 'Emploi du temps'],
  ['Vie scolaire', 'Vie scolaire'],
  ['Enseignants', 'Enseignants'],
  ['Finances', 'Finances'],
  ['Param\u00e8tres', 'Param\u00e8tres'],
];

for (const [navLabel, expectedTitle] of views) {
  const clicked = await evaluate(`(() => {
    const label = ${JSON.stringify(navLabel)};
    const button = [...document.querySelectorAll('.app-sidebar__item')]
      .find((node) => (node.textContent || '').trim().includes(label));
    if (!button) return false;
    button.click();
    return true;
  })()`);

  if (!clicked) throw new Error(`Missing navigation item: ${navLabel}`);

  let found = false;
  for (let i = 0; i < 30; i += 1) {
    found = await evaluate(`(() => {
      const title = ${JSON.stringify(expectedTitle)};
      const header = document.querySelector('.app-header__title');
      const body = document.body.innerText || '';
      return header?.textContent?.trim() === title &&
        !body.includes('Sekoly a rencontr\\u00e9 un probl\\u00e8me');
    })()`);
    if (found) break;
    await sleep(200);
  }

  if (!found) {
    const text = await evaluate(`(document.body.innerText || '').slice(0, 2500)`);
    throw new Error(`Render failed for ${navLabel}. DOM: ${text}`);
  }
}

await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'k',
  code: 'KeyK',
  modifiers: 2,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'k',
  code: 'KeyK',
  modifiers: 2,
});
await sleep(300);

const paletteVisible = await evaluate(
  `Boolean(document.querySelector('[role="dialog"][aria-label="Recherche globale"]'))`
);
if (!paletteVisible) throw new Error('Ctrl+K command palette did not open.');

const fatalErrors = runtimeErrors.filter(
  (message) =>
    !message.includes('ResizeObserver loop') &&
    !message.includes('favicon')
);

if (fatalErrors.length) {
  throw new Error(`JavaScript errors detected:\n${fatalErrors.join('\n---\n')}`);
}

console.log(
  `Sekoly UI smoke: ${views.length} interfaces and global search validated without JavaScript errors.`
);

socket.close();
