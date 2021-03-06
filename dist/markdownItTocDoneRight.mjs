/*! markdown-it-toc-done-right 4.2.0-4 https://github.com//GerHobbelt/markdown-it-toc-done-right @license MIT */

function slugify(x) {
  return encodeURIComponent(String(x).trim().toLowerCase().replace(/\s+/g, '-'));
}

function htmlencode(x) {
  /*
    // safest, delegate task to native -- IMPORTANT: enabling this breaks both jest and runkit, but with browserify it's fine
    if (document && document.createElement) {
      const el = document.createElement("div")
      el.innerText = x
      return el.innerHTML
    }
  */
  return String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tocPlugin(md, options) {
  options = Object.assign({}, {
    placeholder: '(\\$\\{toc\\}|\\[\\[?_?toc_?\\]?\\]|\\$\\<toc(\\{[^}]*\\})\\>)',
    slugify: slugify,
    uniqueSlugStartIndex: 1,
    containerClass: 'table-of-contents',
    containerId: undefined,
    listClass: undefined,
    itemClass: undefined,
    linkClass: undefined,
    level: 6,
    // same as @gerhobbelt/markdown-it-anchor: **max** level or array of levels
    listType: 'ol',
    format: undefined,
    callback: undefined
    /* function(html, ast, state) {} */

  }, options);
  let ast;
  const pattern = new RegExp('^' + options.placeholder + '$', 'i');

  function toc(state, startLine, endLine, silent) {
    let token;
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine]; // use whitespace as a line tokenizer and extract the first token
    // to test against the placeholder anchored pattern, rejecting if false

    const lineFirstToken = state.src.slice(pos, max).split(' ')[0];
    if (!pattern.test(lineFirstToken)) return false;
    if (silent) return true;
    const matches = pattern.exec(lineFirstToken);
    let inlineOptions = {};

    if (matches !== null && matches.length === 3) {
      try {
        inlineOptions = JSON.parse(matches[2]);
      } catch (ex) {// silently ignore inline options
      }
    }

    state.line = startLine + 1;
    token = state.push('tocOpen', 'nav', 1);
    token.markup = '';
    token.map = [startLine, state.line];
    token.inlineOptions = inlineOptions;
    token = state.push('tocBody', '', 0);
    token.markup = '';
    token.map = [startLine, state.line];
    token.inlineOptions = inlineOptions;
    token.children = [];
    token = state.push('tocClose', 'nav', -1);
    token.markup = '';
    return true;
  }

  md.renderer.rules.tocOpen = function (tokens, idx
  /* , options, env, renderer */
  ) {
    const token = tokens[idx];

    let _options = Object.assign({}, options, token.inlineOptions);

    const id = _options.containerId ? ` id="${htmlencode(_options.containerId)}"` : '';
    return `<nav${id} class="${htmlencode(_options.containerClass)}">`;
  };

  md.renderer.rules.tocClose = function ()
  /* tokens, idx, options, env, renderer */
  {
    return '</nav>';
  };

  md.renderer.rules.tocBody = function (tokens, idx
  /* , options, env, renderer */
  ) {
    const token = tokens[idx];

    let _options = Object.assign({}, options, token.inlineOptions);

    const uniques = new Map();

    function unique(slug, failOnNonUnique) {
      // If first slug, return as is.
      let key = slug;
      let n = _options.uniqueSlugStartIndex;

      while (uniques.has(key)) {
        // Duplicate slug, add a `-2`, `-3`, etc. to keep ID unique.
        key = `${slug}-${n++}`;
      }

      if (n > 2 && failOnNonUnique) {
        throw new Error(`The ID attribute '${slug}' defined by user or other markdown-it plugin is not unique. Please fix it in your markdown to continue.`);
      } // Mark this slug as used in the environment.


      uniques.set(key, true);
      return key;
    }

    const isLevelSelectedNumber = selection => level => level <= selection;

    const isLevelSelectedArray = selection => level => selection.includes(level);

    const isLevelSelected = Array.isArray(_options.level) ? isLevelSelectedArray(_options.level) : isLevelSelectedNumber(_options.level);

    function ast2html(tree, level) {
      const listClass = _options.listClass ? ` class="${htmlencode(_options.listClass)}"` : '';
      const itemClass = _options.itemClass ? ` class="${htmlencode(_options.itemClass)}"` : '';
      const linkClass = _options.linkClass ? ` class="${htmlencode(_options.linkClass)}"` : '';
      if (tree.c.length === 0) return '';
      let buffer = '';

      if (tree.l === 0 || isLevelSelected(tree.l + 1)) {
        buffer += `<${htmlencode(_options.listType) + listClass}>`;
      }

      tree.c.forEach(node => {
        // first, check if the heading already has an ID attribute:
        // if it has, use that one!
        let slug = node.token.attrGet('id');

        if (isLevelSelected(node.l)) {
          if (slug == null) {
            slug = unique(options.slugify(node.n), false); // and register the ID for this heading,
            // so it won't have to be re-generated by other plugins,
            // resulting in consistent ID usage in the page:

            node.token.attrSet('id', slug);
          }

          buffer += `<li${itemClass}><a${linkClass} href="#${slug}">${typeof _options.format === 'function' ? _options.format(node.n, htmlencode) : htmlencode(node.n)}</a>${ast2html(node)}</li>`;
        } else {
          buffer += ast2html(node);
        }
      });

      if (tree.l === 0 || isLevelSelected(tree.l + 1)) {
        buffer += `</${htmlencode(_options.listType)}>`;
      }

      return buffer;
    }

    tokens.filter(token => token.type === 'heading_open').forEach(token => {
      // Before we do anything, we must collect all previously defined ID attributes to ensure we won't generate any duplicates:
      let slug = token.attrGet('id');

      if (slug != null) {
        // mark existing slug/ID as unique, at least.
        // IFF it collides, FAIL!
        unique(slug, true);
      }
    });
    return ast2html(ast);
  };

  function headings2ast(tokens) {
    const ast = {
      l: 0,
      n: '',
      c: []
    };
    const stack = [ast];

    for (let i = 0, iK = tokens.length; i < iK; i++) {
      const token = tokens[i];

      if (token.type === 'heading_open') {
        let keyparts = [];

        for (let j = i + 1; j < iK; j++) {
          const token = tokens[j];

          if (token.type === 'heading_close') {
            break;
          }

          if (!token.children) {
            continue;
          }

          const keypart = token.children.filter(token => token.type === 'text' || token.type === 'code_inline').reduce((acc, t) => acc + t.content, '').trim();

          if (keypart.length > 0) {
            keyparts.push(keypart);
          }
        }

        const key = keyparts.join(' ');
        const node = {
          l: parseInt(token.tag.substr(1), 10),
          n: key,
          c: [],
          token
        };

        if (node.l > stack[0].l) {
          stack[0].c.push(node);
          stack.unshift(node);
        } else if (node.l === stack[0].l) {
          stack[1].c.push(node);
          stack[0] = node;
        } else {
          while (node.l <= stack[0].l) stack.shift();

          stack[0].c.push(node);
          stack.unshift(node);
        }
      }
    }

    return ast;
  }

  md.core.ruler.push('generateTocAst', function (state) {
    const tokens = state.tokens;
    ast = headings2ast(tokens);

    if (typeof options.callback === 'function') {
      for (let i = 0, iK = tokens.length; i < iK; i++) {
        const token = tokens[i];

        if (token.type === 'tocOpen') {
          options.callback(md.renderer.rules.tocOpen(tokens, i) + md.renderer.rules.tocBody(tokens, i) + md.renderer.rules.tocClose(), ast, state);
        }
      }
    }
  });
  md.block.ruler.before('heading', 'toc', toc, {
    alt: ['paragraph', 'reference', 'blockquote']
  });
}

export default tocPlugin;
//# sourceMappingURL=markdownItTocDoneRight.mjs.map
