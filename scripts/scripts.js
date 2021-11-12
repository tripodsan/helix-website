/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * Log RUM if part of the sample.
 * @param {string} checkpoint identifies the checkpoint in funnel
 * @param {Object} data additional data for RUM sample
 */
export function sampleRUM(checkpoint, data = {}) {
  try {
    window.hlx = window.hlx || {};
    if (!window.hlx.rum) {
      const usp = new URLSearchParams(window.location.search);
      const weight = (usp.get('rum') === 'on') ? 1 : 100; // with parameter, weight is 1. Defaults to 100.
      // eslint-disable-next-line no-bitwise
      const hashCode = (s) => s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);
      const id = `${hashCode(window.location.href)}-${new Date().getTime()}-${Math.random().toString(16).substr(2, 14)}`;
      const random = Math.random();
      const isSelected = (random * weight < 1);
      // eslint-disable-next-line object-curly-newline
      window.hlx.rum = { weight, id, random, isSelected };
    }
    const { random, weight, id } = window.hlx.rum;
    if (random && (random * weight < 1)) {
      const sendPing = () => {
        // eslint-disable-next-line object-curly-newline
        const body = JSON.stringify({ weight, id, referer: window.location.href, generation: 'biz-gen1', checkpoint, ...data });
        const url = `https://rum.hlx3.page/.rum/${weight}`;
        // eslint-disable-next-line no-unused-expressions
        navigator.sendBeacon(url, body);
      };
      sendPing();
      // special case CWV
      if (checkpoint === 'cwv') {
        // eslint-disable-next-line import/no-unresolved
        import('./web-vitals-module-2-1-2.js').then((mod) => {
          const storeCWV = (measurement) => {
            data.cwv = {};
            data.cwv[measurement.name] = measurement.value;
            sendPing();
          };
          mod.getCLS(storeCWV);
          mod.getFID(storeCWV);
          mod.getLCP(storeCWV);
        });
      }
    }
  } catch (e) {
    // something went wrong
  }
}

sampleRUM('top');
window.addEventListener('load', () => sampleRUM('load'));
document.addEventListener('click', () => sampleRUM('click'));

/**
 * Loads a CSS file.
 * @param {string} href The path to the CSS file
 */
export function loadStyle(href) {
  if (!document.head.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    link.onload = () => { };
    link.onerror = () => { };
    document.head.appendChild(link);
  }
}

/**
 * loads a script by adding a script tag to the head.
 * @param {string} url URL of the js file
 * @param {Function} callback callback on load
 * @param {string} type type attribute of script tag
 * @returns {Element} script element
 */
export function loadScript(url, callback, type) {
  const head = document.querySelector('head');
  const script = document.createElement('script');
  script.setAttribute('src', url);
  if (type) {
    script.setAttribute('type', type);
  }
  head.append(script);
  script.onload = callback;
  return script;
}

/**
 * Retrieves the content of a metadata tag.
 * @param {string} name The metadata name (or property)
 * @returns {string} The metadata value
 */
export function getMetadata(name) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = [...document.head.querySelectorAll(`meta[${attr}="${name}"]`)].map((el) => el.content).join(', ');
  return meta;
}

/**
 * Decorates a block.
 * @param {Element} block The block element
 */
export function decorateBlock(block) {
  const classes = Array.from(block.classList.values());
  const blockName = classes[0];
  if (!blockName) return;
  block.classList.add('block');
  block.setAttribute('data-block-name', blockName);
}

/**
 * Decorates all blocks in a container element.
 * @param {Element} main The container element
 */
function decorateBlocks() {
  document.querySelectorAll('header, footer, [class]')
    .forEach((block) => decorateBlock(block));
}

function removeEmptyDivs() {
  document.body.querySelectorAll('div:empty').forEach((div) => { div.remove(); });
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
export async function loadBlock(block, eager = false) {
  if (!block.getAttribute('data-block-loaded')) {
    block.setAttribute('data-block-loaded', true);
    const blockName = block.getAttribute('data-block-name');
    try {
      loadStyle(`/blocks/${blockName}/${blockName}.css`);
      const mod = await import(`/blocks/${blockName}/${blockName}.js`);
      if (mod.default) {
        await mod.default(block, blockName, document, eager);
      }
    } catch (err) {
      debug(`failed to load module for ${blockName}`, err);
    }
  }
}

/**
 * Loads JS and CSS for all blocks.
 * @param {Element} main The container element
 */
async function loadBlocks(main) {
  main.querySelectorAll('.block').forEach(async (block) => loadBlock(block));
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decoratePage() {
  removeEmptyDivs();
  decorateBlocks();
}

/**
 * Load everything needed to get to LCP.
 */
async function loadEager() {
  const main = document.querySelector('main');
  if (main) {
    decorateMain(main);
    const block = document.querySelector('.block');
    const hasLCPBlock = (block && lcpBlocks.includes(block.getAttribute('data-block-name')));
    if (hasLCPBlock) await loadBlock(block, true);
    const lcpCandidate = document.querySelector('main img');
    const loaded = {
      then: (resolve) => {
        if (lcpCandidate && !lcpCandidate.complete) {
          lcpCandidate.addEventListener('load', () => resolve());
          lcpCandidate.addEventListener('error', () => resolve());
        } else {
          resolve();
        }
      },
    };
    await loaded;
  }
}

/**
 * loads everything that doesn't need to be delayed.
 */
async function loadLazy() {
  const main = document.querySelector('main');

  // post LCP actions go here
  sampleRUM('lcp');

  /* load gnav */
  const header = document.querySelector('header');
  header.setAttribute('data-block-name', 'gnav');
  loadBlock(header);

  /* load footer */
  const footer = document.querySelector('footer');
  footer.setAttribute('data-block-name', 'footer');
  loadBlock(footer);

  loadBlocks(main);
  loadStyle('/styles/lazy-styles.css');
}

/**
 * Decorates the page.
 */
async function decoratePage() {
  await loadEager();
  loadLazy();
}

decoratePage();

/*
 * lighthouse performance instrumentation helper
 * (needs a refactor)
 */
export function stamp(message) {
  if (window.name.includes('performance')) {
    debug(`${new Date() - performance.timing.navigationStart}:${message}`);
  }
}

stamp('start');

function registerPerformanceLogger() {
  try {
    const polcp = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      stamp(JSON.stringify(entries));
      debug(entries[0].element);
    });
    polcp.observe({ type: 'largest-contentful-paint', buffered: true });

    const pols = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      stamp(JSON.stringify(entries));
      debug(entries[0].sources[0].node);
    });
    pols.observe({ type: 'layout-shift', buffered: true });

    const pores = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry) => {
        stamp(`resource loaded: ${entry.name} - [${Math.round(entry.startTime + entry.duration)}]`);
      });
    });

    pores.observe({ type: 'resource', buffered: true });
  } catch (e) {
    // no output
  }
}

if (window.name.includes('performance')) registerPerformanceLogger();

// const LIVE_DOMAIN = 'https://www.hlx.live';

// export const config = {
//   blocks: {
//     header: {
//       location: '/blocks/header/',
//       scripts: 'header.js',
//       styles: 'header.css',
//     },
//     '.columns': {
//       location: '/blocks/columns/',
//       styles: 'columns.css',
//     },
//     '.feature-list': {
//       location: '/blocks/feature-list/',
//       styles: 'feature-list.css',
//     },
//     '.accordion': {
//       location: '/blocks/accordion/',
//       scripts: 'accordion.js',
//       styles: 'accordion.css',
//     },
//     '.get-started': {
//       location: '/blocks/get-started/',
//       styles: 'get-started.css',
//     },
//     '.z-pattern': {
//       location: '/blocks/z-pattern/',
//       styles: 'z-pattern.css',
//       scripts: 'z-pattern.js',
//     },
//     '.fragment': {
//       location: '/blocks/fragment/',
//       scripts: 'fragment.js',
//     },
//     '.sidekick-generator': {
//       location: '/blocks/sidekick/',
//       scripts: 'generator.js',
//       styles: 'generator.css',
//     },
//     '.service-status': {
//       lazy: true,
//       location: '/blocks/service-status/',
//       scripts: 'service-status.js',
//       styles: 'service-status.css',
//     },
//     'a[href^="https://www.youtube.com"]': {
//       lazy: true,
//       location: '/blocks/embed/',
//       styles: 'youtube.css',
//       scripts: 'youtube.js',
//     },
//     'a[href^="https://gist.github.com"]': {
//       lazy: true,
//       location: '/blocks/embed/',
//       styles: 'gist.css',
//       scripts: 'gist.js',
//     },
//   },
// };

// export function getCurrentDomain(location) {
//   const { protocol, hostname, port } = location || window.location;
//   const domain = `${protocol}//${hostname}`;
//   return port ? `${domain}:${port}` : domain;
// }

// export function setDomain(anchor, currentDomain) {
//   const { href, textContent } = anchor;
//   if (!href.includes(LIVE_DOMAIN)) return href;
//   anchor.href = href.replace(LIVE_DOMAIN, currentDomain);
//   anchor.textContent = textContent.replace(LIVE_DOMAIN, currentDomain);
//   return anchor.href;
// }

// export function setSVG(anchor) {
//   const { href, textContent } = anchor;
//   const ext = textContent.substr(textContent.lastIndexOf('.') + 1);
//   if (ext !== 'svg') return;
//   const img = document.createElement('img');
//   img.src = textContent;
//   if (textContent === href) {
//     anchor.parentElement.append(img);
//     anchor.remove();
//   } else {
//     anchor.textContent = '';
//     anchor.append(img);
//   }
// }

// export function forceDownload(anchor) {
//   const { href } = anchor;
//   const filename = href.split('/').pop();
//   const ext = filename.split('.')[1];
//   if (ext && ['crx'].includes(ext)) {
//     anchor.setAttribute('download', filename);
//   }
// }

// export function decorateAnchors(element) {
//   const anchors = element.getElementsByTagName('a');
//   const currentDomain = getCurrentDomain();
//   return Array.from(anchors).map((anchor) => {
//     setDomain(anchor, currentDomain);
//     setSVG(anchor);
//     forceDownload(anchor);
//     return anchor;
//   });
// }

// export function getMetadata(name) {
//   const meta = document.head.querySelector(`meta[name="${name}"]`);
//   return meta && meta.content;
// }

// export function loadScript(url, callback, type) {
//   const script = document.createElement('script');
//   script.onload = callback;
//   script.setAttribute('src', url);
//   if (type) { script.setAttribute('type', type); }
//   document.head.append(script);
//   return script;
// }

// export async function loadStyle(url, onLoad) {
//   const duplicate = document.head.querySelector(`link[href^="${url}"]`);
//   if (duplicate) {
//     if (onLoad) { onLoad(); }
//     return duplicate;
//   }
//   const element = document.createElement('link');
//   element.setAttribute('rel', 'stylesheet');
//   element.setAttribute('href', url);
//   if (onLoad) {
//     element.addEventListener('load', onLoad);
//   }
//   document.querySelector('head').appendChild(element);
//   return element;
// }

// /**
//  * Clean up variant classes
//  * Ex: marquee--small--contained- -> marquee small contained
//  * @param {HTMLElement} parent
//  */
// export function cleanVariations(parent) {
//   const variantBlocks = parent.querySelectorAll('[class$="-"]');
//   return Array.from(variantBlocks).map((variant) => {
//     const { className } = variant;
//     const classNameClipped = className.slice(0, -1);
//     variant.classList.remove(className);
//     const classNames = classNameClipped.split('--');
//     variant.classList.add(...classNames);
//     return variant;
//   });
// }

// export function loadTemplate() {
//   const template = getMetadata('template');
//   if (!template) return;
//   document.body.classList.add(`${template}-template`);
// }

// export function setupBlocks(element, cfg) {
//   const isDoc = element instanceof Document;
//   const parent = isDoc ? document.body : element;
//   cleanVariations(parent);
//   // Return the elements that match each block config
//   return Object.keys(cfg.blocks).reduce((decoratedBlocks, block) => {
//     const elements = parent.querySelectorAll(block);
//     elements.forEach((el) => {
//       el.setAttribute('data-block-select', block);
//       decoratedBlocks.push(el);
//     });
//     return decoratedBlocks;
//   }, []);
// }

// async function initJs(element, block) {
//   if (!block.module) {
//     block.module = await import(`${block.location}${block.scripts}`);
//   }
//   // If this block type has scripts and they're already imported
//   if (block.module) {
//     block.module.default(element);
//   }
//   return element;
// }

// /**
//  * Load each element
//  * @param {HTMLElement} element
//  */
// export async function loadElement(el, blockConf) {
//   return new Promise((resolve) => {
//     function blockLoaded() {
//       blockConf.loaded = true;
//       el.dataset.blockLoaded = true;
//       resolve(el);
//     }
//     if (el.dataset.blockLoaded) {
//       resolve(el);
//     } else {
//       if (blockConf.scripts) {
//         initJs(el, blockConf);
//       }
//       if (blockConf.styles) {
//         loadStyle(`${blockConf.location}${blockConf.styles}`, () => {
//           blockLoaded();
//         });
//       } else {
//         blockLoaded();
//       }
//     }
//   });
// }

// export async function loadBlocks(blocks) {
//   /**
//      * Iterate through all entries to determine if they are intersecting.
//      * @param {IntersectionObserverEntry} entries
//      * @param {IntersectionObserver} observer
//      */
//   const onIntersection = (entries, observer) => {
//     entries.forEach((entry) => {
//       if (entry.isIntersecting) {
//         const { blockSelect } = entry.target.dataset;
//         const blockConf = config.blocks[blockSelect];
//         observer.unobserve(entry.target);
//         loadElement(entry.target, blockConf);
//       }
//     });
//   };

//   const options = { rootMargin: config.lazyMargin || '1200px 0px' };
//   const observer = new IntersectionObserver(onIntersection, options);
//   return Promise.all(blocks.map(async (block) => {
//     const { blockSelect } = block.dataset;
//     const blockConf = config.blocks[blockSelect];
//     if (blockConf?.lazy) {
//       observer.observe(block);
//     } else {
//       return loadElement(block, blockConf);
//     }
//     return null;
//   }));
// }

// function postLCP(blocks, message) {
//   loadBlocks(blocks);
//   loadStyle('/fonts/fonts.css');
//   window.lcp = window.lcp || {};
//   window.lcp[message] = true;
// }

// export function setLCPTrigger(lcp, blocks) {
//   if (lcp) {
//     if (lcp.complete) { postLCP(blocks, 'complete'); return; }
//     lcp.addEventListener('load', () => { postLCP(blocks, 'load'); });
//     lcp.addEventListener('error', () => { postLCP(blocks, 'error'); });
//     return;
//   }
//   postLCP(blocks, 'none');
// }
// loadTemplate();
// decorateAnchors(document);
// const blocks = setupBlocks(document, config);
// const lcp = document.querySelector(config.lcp);
// setLCPTrigger(lcp, blocks);
