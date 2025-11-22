// Utility helpers for DOM manipulation shared across UI modules.

function appendInlineTextWithLinks(parent, text) {
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const anchor = document.createElement('a');
    anchor.href = match[2];
    anchor.textContent = match[1];
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    parent.appendChild(anchor);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function tryRenderBulletedList(parent, text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return false;
  }

  if (!lines.every(line => line.startsWith('-'))) {
    return false;
  }

  const list = document.createElement('ul');
  list.className = 'bullet-list';
  lines.forEach(line => {
    const li = document.createElement('li');
    const content = line.replace(/^-+\s*/, '').trim();
    appendInlineTextWithLinks(li, content);
    list.appendChild(li);
  });

  parent.appendChild(list);
  return true;
}

// Append text to parent, converting Markdown links [text](https://...) into <a> tags.
export function appendTextWithLinks(parent, text) {
  if (!(parent instanceof Node)) return;
  if (typeof text !== 'string' || text.length === 0) {
    return;
  }

  if (tryRenderBulletedList(parent, text)) {
    return;
  }

  appendInlineTextWithLinks(parent, text);
}

// Create an <img> for a country ISO code using a public flag CDN (SVG).
export function createFlagImg(iso, width = 18, altText = '') {
  if (!iso || typeof iso !== 'string') return null;
  const lower = iso.toLowerCase();
  const url = `https://flagcdn.com/${lower}.svg`;
  const img = document.createElement('img');
  img.src = url;
  const readableName = typeof altText === 'string' && altText.trim().length > 0
    ? altText.trim()
    : `${iso} flag`;
  img.alt = readableName;
  img.className = 'flag-icon';
  img.width = width;
  img.height = Math.round(width * (2 / 3));
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

export default {
  appendTextWithLinks,
  createFlagImg,
};

