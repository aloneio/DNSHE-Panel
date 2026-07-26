export const qs = (selector, parent = document) => parent.querySelector(selector);
export const qsa = (selector, parent = document) => [...parent.querySelectorAll(selector)];

export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (name === 'className') node.className = String(value);
    else if (name === 'htmlFor') node.htmlFor = String(value);
    else if (name === 'text') node.textContent = String(value);
    else if (name.startsWith('data-')) node.dataset[name.slice(5)] = String(value);
    else if (name in node && typeof value !== 'string') node[name] = value;
    else node.setAttribute(name, String(value));
  }
  appendChildren(node, children);
  return node;
}

export function text(value) { return document.createTextNode(value == null ? '' : String(value)); }
export function clear(node) { node.replaceChildren(); return node; }
export function appendChildren(node, children) { for (const child of children.flat(Infinity)) node.append(child instanceof Node ? child : text(child)); return node; }
export function textCell(value, className) { return el('td', { ...(className ? { className } : {}), text: value == null ? '—' : String(value) }); }
export function tableRow(values) { return el('tr', {}, values.map((value) => value instanceof Node ? value : textCell(value))); }
export function button(label, options = {}) { return el('button', { type: 'button', className: 'btn', text: label, ...options }); }
