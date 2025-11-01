// Utility helpers for DOM manipulation shared across UI modules.

// Append text to parent, converting Markdown links [text](https://...) into <a> tags.
export function appendTextWithLinks(parent, text) {
  if (!(parent instanceof Node)) return;
  if (typeof text !== 'string' || text.length === 0) {
    return;
  }
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

// Create an <img> for a country ISO code using a public flag CDN (SVG).
export function createFlagImg(iso, width = 18) {
  if (!iso || typeof iso !== 'string') return null;
  const lower = iso.toLowerCase();
  const url = `https://flagcdn.com/${lower}.svg`;
  const img = document.createElement('img');
  img.src = url;
  img.alt = `${iso} flag`;
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

