// Creates an element in a namespace with attributes.
function createElement(
  tag: string,
  ns: string,
  attributes?: Record<string, string>,
): Element {
  const el = document.createElementNS(ns, tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

// Creates an SVG element with attributes.
export function createSvgElement<T extends SVGElement>(
  tag: string,
  attributes?: Record<string, string>,
): T {
  return createElement(tag, "http://www.w3.org/2000/svg", attributes) as T;
}

// Creates an XHTML element with attributes.
export function createXhtmlElement<T extends HTMLElement>(
  tag: string,
  attributes?: Record<string, string>,
): T {
  return createElement(tag, "http://www.w3.org/1999/xhtml", attributes) as T;
}
