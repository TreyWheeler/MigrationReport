const SVG_NS = 'http://www.w3.org/2000/svg';

function createTriangleGlyph() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('alert-icon__glyph');
  const outline = document.createElementNS(SVG_NS, 'path');
  outline.setAttribute('d', 'M12 3 22 21H2L12 3Z');
  outline.setAttribute('fill', 'currentColor');
  svg.appendChild(outline);
  const mark = document.createElementNS(SVG_NS, 'rect');
  mark.setAttribute('x', '11');
  mark.setAttribute('y', '9');
  mark.setAttribute('width', '2');
  mark.setAttribute('height', '6');
  mark.setAttribute('fill', '#0f172a');
  mark.setAttribute('rx', '1');
  svg.appendChild(mark);
  const dot = document.createElementNS(SVG_NS, 'rect');
  dot.setAttribute('x', '11');
  dot.setAttribute('y', '16');
  dot.setAttribute('width', '2');
  dot.setAttribute('height', '2');
  dot.setAttribute('fill', '#0f172a');
  dot.setAttribute('rx', '1');
  svg.appendChild(dot);
  return svg;
}

function createOctagonGlyph() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('alert-icon__glyph');
  const outline = document.createElementNS(SVG_NS, 'path');
  outline.setAttribute('d', 'M9 2h6l7 7v6l-7 7H9l-7-7V9L9 2Z');
  outline.setAttribute('fill', 'currentColor');
  svg.appendChild(outline);
  const mark = document.createElementNS(SVG_NS, 'rect');
  mark.setAttribute('x', '11');
  mark.setAttribute('y', '8');
  mark.setAttribute('width', '2');
  mark.setAttribute('height', '7');
  mark.setAttribute('fill', '#0f172a');
  mark.setAttribute('rx', '1');
  svg.appendChild(mark);
  const dot = document.createElementNS(SVG_NS, 'rect');
  dot.setAttribute('x', '11');
  dot.setAttribute('y', '16');
  dot.setAttribute('width', '2');
  dot.setAttribute('height', '2');
  dot.setAttribute('fill', '#0f172a');
  dot.setAttribute('rx', '1');
  svg.appendChild(dot);
  return svg;
}

function createAlertIcon(status, tooltip = '', options = {}) {
  const severity = status === 'incompatible' ? 'incompatible' : 'concerning';
  const el = document.createElement('span');
  el.className = `alert-icon alert-icon--${severity}`;
  if (options && options.variant) {
    el.classList.add(`alert-icon--${options.variant}`);
  }
  if (tooltip) {
    el.title = tooltip;
  }
  el.dataset.alertIcon = 'true';

  const svg = severity === 'incompatible' ? createOctagonGlyph() : createTriangleGlyph();
  svg.setAttribute('aria-hidden', 'true');
  el.appendChild(svg);

  const srLabel = options && typeof options.srText === 'string'
    ? options.srText
    : `Alert: ${severity}`;
  if (srLabel) {
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = srLabel;
    el.appendChild(sr);
  }

  return el;
}

export { createAlertIcon };
