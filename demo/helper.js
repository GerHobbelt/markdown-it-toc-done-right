// this file will be processed by rollup/microbundle to produce assets/demo.js,
// which will contain everything we import here for direct use  in a web page

/* global window */

import markdownit from '@gerhobbelt/markdown-it';
import * as markdownItAnchor from '@gerhobbelt/markdown-it-anchor';
import uslug from 'uslug';
import * as markdownItTocDoneRight from '../';

let demo = {
  markdownit,
  markdownItAnchor,
  uslug,
  markdownItTocDoneRight
};

// set up the global `window` object as well:
for (let key of Object.keys(demo)) {
  window[key] = demo[key];
}

// dummy export to appease microbundle:
export default demo;
