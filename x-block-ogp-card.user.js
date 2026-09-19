// ==UserScript==
// @name         X: Block OGP Cards
// @namespace    https://github.com/aiya000/tampermonky-x-block-ogp-card
// @version      0.1.2
// @description  Replace link preview (OGP) cards of the specified domains with a placeholder on X (Twitter)
// @author       aiya000
// @license      MIT
// @homepageURL  https://github.com/aiya000/tampermonky-x-block-ogp-card
// @supportURL   https://github.com/aiya000/tampermonky-x-block-ogp-card/issues
// @downloadURL  https://raw.githubusercontent.com/aiya000/tampermonky-x-block-ogp-card/main/x-block-ogp-card.user.js
// @updateURL    https://raw.githubusercontent.com/aiya000/tampermonky-x-block-ogp-card/main/x-block-ogp-card.user.js
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// ==/UserScript==

/**
 * @typedef {Object} Config
 * @property {ReadonlyArray<string>} blockedDomains - Registrable domains whose cards are replaced. A subdomain of them is also blocked (e.g. `gist.github.com` for `github.com`).
 * @property {string} placeholder - Text shown instead of the card.
 * @property {boolean} clickToOpen - Open the original link in a new tab when the placeholder is clicked.
 */

;(function () {
  'use strict'

  /** @type {Config} */
  const config = {
    blockedDomains: ['github.com'],
    placeholder: '[  OGP ❌️  ]',
    clickToOpen: true
  }

  /**
   * The attribute marking an already replaced card. A `data-*` attribute is used
   * because X (React) does not manage it, so it survives re-renders.
   */
  const BLOCKED_ATTRIBUTE = 'data-ogp-blocked'

  const CARD_SELECTOR = `[data-testid="card.wrapper"]:not([${BLOCKED_ATTRIBUTE}])`

  /** A text node holding only a bare host name, like `github.com` */
  const HOST_NAME_PATTERN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/

  /**
   * @returns {void}
   */
  function main() {
    injectStyle()

    /** @type {NodeListOf<HTMLElement>} */
    const cards = document.querySelectorAll(CARD_SELECTOR)
    cards.forEach(card => {
      const host = findCardHost(card)
      if (host === null || !isBlocked(host)) {
        return
      }
      blockCard(card)
    })
  }

  /** Attributes that may carry the host name when the card does not render it as text */
  const LABEL_ATTRIBUTES = ['aria-label', 'alt', 'title']

  /**
   * Finds the host name that the card shows as its source.
   *
   * A card that names no host (a poll card, for example) yields `null`.
   *
   * @param {HTMLElement} card
   * @returns {string | null}
   */
  function findCardHost(card) {
    return findHostInText(card) ?? findHostInLabels(card)
  }

  /**
   * Looks for the host name X prints under the card, as seen on a timeline.
   *
   * Every text node is walked rather than the `span`s alone, because X does not
   * wrap the host name in an element of its own -- the card title is a `span`,
   * but the host name below it is not.
   *
   * @param {HTMLElement} card
   * @returns {string | null}
   */
  function findHostInText(card) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const host = toHost(node.textContent ?? '')
      if (host !== null) {
        return host
      }
    }
    return null
  }

  /**
   * Looks for the host name in the card's accessible labels.
   *
   * A tweet detail page (`/status/...`) prints no host under the card, but still
   * labels it `'<host> <title>'`, so the label is the only source left there.
   *
   * @param {HTMLElement} card
   * @returns {string | null}
   */
  function findHostInLabels(card) {
    /** @type {ReadonlyArray<Element>} */
    const elements = [card, ...card.querySelectorAll('*')]
    for (const element of elements) {
      for (const attribute of LABEL_ATTRIBUTES) {
        const label = element.getAttribute(attribute) ?? ''
        const host = toHost(label.trim().split(/\s+/)[0] ?? '')
        if (host !== null) {
          return host
        }
      }
    }
    return null
  }

  /**
   * Reads a text that is nothing but a host name, or `null` when it is anything
   * else. Requiring the whole text to match keeps a card description that opens
   * with something like `Node.js` from being taken for a host.
   *
   * @param {string} text
   * @returns {string | null}
   */
  function toHost(text) {
    const candidate = text.trim().toLowerCase()
    if (!HOST_NAME_PATTERN.test(candidate)) {
      return null
    }
    return candidate.replace(/^www\./, '')
  }

  /**
   * @param {string} host
   * @returns {boolean}
   */
  function isBlocked(host) {
    return config.blockedDomains.some(domain => host === domain || host.endsWith(`.${domain}`))
  }

  /**
   * Hides the card contents by CSS and shows the placeholder instead.
   *
   * The DOM structure is left untouched on purpose, otherwise React would
   * restore the card on its next re-render.
   *
   * @param {HTMLElement} card
   * @returns {void}
   */
  function blockCard(card) {
    card.setAttribute(BLOCKED_ATTRIBUTE, 'true')

    if (!config.clickToOpen) {
      return
    }

    card.addEventListener('click', event => {
      /** @type {HTMLAnchorElement | null} */
      const anchor = card.querySelector('a[href]')
      if (anchor === null) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      window.open(anchor.href, '_blank', 'noopener,noreferrer')
    })
  }

  const STYLE_ID = 'x-block-ogp-card-style'

  /**
   * @returns {void}
   */
  function injectStyle() {
    if (document.getElementById(STYLE_ID) !== null) {
      return
    }

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      [${BLOCKED_ATTRIBUTE}] > * {
        display: none !important;
      }

      [${BLOCKED_ATTRIBUTE}]::after {
        content: '${config.placeholder}';
        display: block;
        box-sizing: border-box;
        width: 100%;
        padding: 12px;
        border: 1px solid rgb(113, 118, 123);
        border-radius: 16px;
        color: rgb(113, 118, 123);
        font-size: 15px;
        line-height: 20px;
        text-align: center;
        cursor: ${config.clickToOpen ? 'pointer' : 'default'};
      }
    `
    document.head.appendChild(style)
  }

  /** @type {number | null} */
  let scheduled = null

  /**
   * Coalesces the many mutations X fires while scrolling into one run.
   *
   * @returns {void}
   */
  function scheduleMain() {
    if (scheduled !== null) {
      return
    }
    scheduled = requestAnimationFrame(() => {
      scheduled = null
      main()
    })
  }

  new MutationObserver(() => {
    scheduleMain()
  }).observe(document.body, { childList: true, subtree: true })
  main()
})()

// The MIT License (MIT)
//
// Copyright (c) 2026 aiya000
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
