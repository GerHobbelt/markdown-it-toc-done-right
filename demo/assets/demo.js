var demo = (function () {

  function _unsupportedIterableToArray(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _arrayLikeToArray(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(o);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
  }

  function _arrayLikeToArray(arr, len) {
    if (len == null || len > arr.length) len = arr.length;

    for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

    return arr2;
  }

  function _createForOfIteratorHelperLoose(o, allowArrayLike) {
    var it;

    if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) {
      if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") {
        if (it) o = it;
        var i = 0;
        return function () {
          if (i >= o.length) return {
            done: true
          };
          return {
            done: false,
            value: o[i++]
          };
        };
      }

      throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
    }

    it = o[Symbol.iterator]();
    return it.next.bind(it);
  }

  var maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

  /** Bootstring parameters */

  var base = 36;
  var tMin = 1;
  var tMax = 26;
  var skew = 38;
  var damp = 700;
  var initialBias = 72;
  var initialN = 128; // 0x80

  var delimiter = '-'; // '\x2D'

  /** Regular expressions */

  var regexPunycode = /^xn--/;
  var regexNonASCII = /[^\0-\x7E]/; // non-ASCII chars

  var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

  /** Error messages */

  var errors = {
    'overflow': 'Overflow: input needs wider integers to process',
    'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
    'invalid-input': 'Invalid input'
  };
  /** Convenience shortcuts */

  var baseMinusTMin = base - tMin;
  var floor = Math.floor;
  var stringFromCharCode = String.fromCharCode;
  /*--------------------------------------------------------------------------*/

  /**
   * A generic error utility function.
   * @private
   * @param {String} type The error type.
   * @returns {Error} Throws a `RangeError` with the applicable error message.
   */

  function error(type) {
    throw new RangeError(errors[type]);
  }
  /**
   * A generic `Array#map` utility function.
   * @private
   * @param {Array} array The array to iterate over.
   * @param {Function} callback The function that gets called for every array
   * item.
   * @returns {Array} A new array of values returned by the callback function.
   */


  function map(array, fn) {
    var result = [];
    var length = array.length;

    while (length--) {
      result[length] = fn(array[length]);
    }

    return result;
  }
  /**
   * A simple `Array#map`-like wrapper to work with domain name strings or email
   * addresses.
   * @private
   * @param {String} domain The domain name or email address.
   * @param {Function} callback The function that gets called for every
   * character.
   * @returns {Array} A new string of characters returned by the callback
   * function.
   */


  function mapDomain(string, fn) {
    var parts = string.split('@');
    var result = '';

    if (parts.length > 1) {
      // In email addresses, only the domain name should be punycoded. Leave
      // the local part (i.e. everything up to `@`) intact.
      result = parts[0] + '@';
      string = parts[1];
    } // Avoid `split(regex)` for IE8 compatibility. See #17.


    string = string.replace(regexSeparators, '\x2E');
    var labels = string.split('.');
    var encoded = map(labels, fn).join('.');
    return result + encoded;
  }
  /**
   * Creates an array containing the numeric code points of each Unicode
   * character in the string. While JavaScript uses UCS-2 internally,
   * this function will convert a pair of surrogate halves (each of which
   * UCS-2 exposes as separate characters) into a single code point,
   * matching UTF-16.
   * @see `punycode.ucs2.encode`
   * @see <https://mathiasbynens.be/notes/javascript-encoding>
   * @memberOf punycode.ucs2
   * @name decode
   * @param {String} string The Unicode input string (UCS-2).
   * @returns {Array} The new array of code points.
   */


  function ucs2decode(string) {
    var output = [];
    var counter = 0;
    var length = string.length;

    while (counter < length) {
      var value = string.charCodeAt(counter++);

      if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
        // It's a high surrogate, and there is a next character.
        var extra = string.charCodeAt(counter++);

        if ((extra & 0xFC00) == 0xDC00) {
          // Low surrogate.
          output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
        } else {
          // It's an unmatched surrogate; only append this code unit, in case the
          // next code unit is the high surrogate of a surrogate pair.
          output.push(value);
          counter--;
        }
      } else {
        output.push(value);
      }
    }

    return output;
  }
  /**
   * Creates a string based on an array of numeric code points.
   * @see `punycode.ucs2.decode`
   * @memberOf punycode.ucs2
   * @name encode
   * @param {Array} codePoints The array of numeric code points.
   * @returns {String} The new Unicode string (UCS-2).
   */


  var ucs2encode = function ucs2encode(array) {
    return String.fromCodePoint.apply(String, array);
  };
  /**
   * Converts a basic code point into a digit/integer.
   * @see `digitToBasic()`
   * @private
   * @param {Number} codePoint The basic numeric code point value.
   * @returns {Number} The numeric value of a basic code point (for use in
   * representing integers) in the range `0` to `base - 1`, or `base` if
   * the code point does not represent a value.
   */


  var basicToDigit = function basicToDigit(codePoint) {
    if (codePoint - 0x30 < 0x0A) {
      return codePoint - 0x16;
    }

    if (codePoint - 0x41 < 0x1A) {
      return codePoint - 0x41;
    }

    if (codePoint - 0x61 < 0x1A) {
      return codePoint - 0x61;
    }

    return base;
  };
  /**
   * Converts a digit/integer into a basic code point.
   * @see `basicToDigit()`
   * @private
   * @param {Number} digit The numeric value of a basic code point.
   * @returns {Number} The basic code point whose value (when used for
   * representing integers) is `digit`, which needs to be in the range
   * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
   * used; else, the lowercase form is used. The behavior is undefined
   * if `flag` is non-zero and `digit` has no uppercase form.
   */


  var digitToBasic = function digitToBasic(digit, flag) {
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  };
  /**
   * Bias adaptation function as per section 3.4 of RFC 3492.
   * https://tools.ietf.org/html/rfc3492#section-3.4
   * @private
   */


  var adapt = function adapt(delta, numPoints, firstTime) {
    var k = 0;
    delta = firstTime ? floor(delta / damp) : delta >> 1;
    delta += floor(delta / numPoints);

    for (;
    /* no initialization */
    delta > baseMinusTMin * tMax >> 1; k += base) {
      delta = floor(delta / baseMinusTMin);
    }

    return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  };
  /**
   * Converts a Punycode string of ASCII-only symbols to a string of Unicode
   * symbols.
   * @memberOf punycode
   * @param {String} input The Punycode string of ASCII-only symbols.
   * @returns {String} The resulting string of Unicode symbols.
   */


  var decode = function decode(input) {
    // Don't use UCS-2.
    var output = [];
    var inputLength = input.length;
    var i = 0;
    var n = initialN;
    var bias = initialBias; // Handle the basic code points: let `basic` be the number of input code
    // points before the last delimiter, or `0` if there is none, then copy
    // the first basic code points to the output.

    var basic = input.lastIndexOf(delimiter);

    if (basic < 0) {
      basic = 0;
    }

    for (var j = 0; j < basic; ++j) {
      // if it's not a basic code point
      if (input.charCodeAt(j) >= 0x80) {
        error('not-basic');
      }

      output.push(input.charCodeAt(j));
    } // Main decoding loop: start just after the last delimiter if any basic code
    // points were copied; start at the beginning otherwise.


    for (var index = basic > 0 ? basic + 1 : 0; index < inputLength;)
    /* no final expression */
    {
      // `index` is the index of the next character to be consumed.
      // Decode a generalized variable-length integer into `delta`,
      // which gets added to `i`. The overflow checking is easier
      // if we increase `i` as we go, then subtract off its starting
      // value at the end to obtain `delta`.
      var oldi = i;

      for (var w = 1, k = base;;
      /* no condition */
      k += base) {
        if (index >= inputLength) {
          error('invalid-input');
        }

        var digit = basicToDigit(input.charCodeAt(index++));

        if (digit >= base || digit > floor((maxInt - i) / w)) {
          error('overflow');
        }

        i += digit * w;
        var t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

        if (digit < t) {
          break;
        }

        var baseMinusT = base - t;

        if (w > floor(maxInt / baseMinusT)) {
          error('overflow');
        }

        w *= baseMinusT;
      }

      var out = output.length + 1;
      bias = adapt(i - oldi, out, oldi == 0); // `i` was supposed to wrap around from `out` to `0`,
      // incrementing `n` each time, so we'll fix that now:

      if (floor(i / out) > maxInt - n) {
        error('overflow');
      }

      n += floor(i / out);
      i %= out; // Insert `n` at position `i` of the output.

      output.splice(i++, 0, n);
    }

    return String.fromCodePoint.apply(String, output);
  };
  /**
   * Converts a string of Unicode symbols (e.g. a domain name label) to a
   * Punycode string of ASCII-only symbols.
   * @memberOf punycode
   * @param {String} input The string of Unicode symbols.
   * @returns {String} The resulting Punycode string of ASCII-only symbols.
   */


  var encode = function encode(input) {
    var output = []; // Convert the input in UCS-2 to an array of Unicode code points.

    input = ucs2decode(input); // Cache the length.

    var inputLength = input.length; // Initialize the state.

    var n = initialN;
    var delta = 0;
    var bias = initialBias; // Handle the basic code points.

    for (var _iterator = _createForOfIteratorHelperLoose(input), _step; !(_step = _iterator()).done;) {
      var _currentValue2 = _step.value;

      if (_currentValue2 < 0x80) {
        output.push(stringFromCharCode(_currentValue2));
      }
    }

    var basicLength = output.length;
    var handledCPCount = basicLength; // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.
    // Finish the basic string with a delimiter unless it's empty.

    if (basicLength) {
      output.push(delimiter);
    } // Main encoding loop:


    while (handledCPCount < inputLength) {
      // All non-basic code points < n have been handled already. Find the next
      // larger one:
      var m = maxInt;

      for (var _iterator2 = _createForOfIteratorHelperLoose(input), _step2; !(_step2 = _iterator2()).done;) {
        var currentValue = _step2.value;

        if (currentValue >= n && currentValue < m) {
          m = currentValue;
        }
      } // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
      // but guard against overflow.


      var handledCPCountPlusOne = handledCPCount + 1;

      if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
        error('overflow');
      }

      delta += (m - n) * handledCPCountPlusOne;
      n = m;

      for (var _iterator3 = _createForOfIteratorHelperLoose(input), _step3; !(_step3 = _iterator3()).done;) {
        var _currentValue = _step3.value;

        if (_currentValue < n && ++delta > maxInt) {
          error('overflow');
        }

        if (_currentValue == n) {
          // Represent delta as a generalized variable-length integer.
          var q = delta;

          for (var k = base;;
          /* no condition */
          k += base) {
            var t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;

            if (q < t) {
              break;
            }

            var qMinusT = q - t;
            var baseMinusT = base - t;
            output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
            q = floor(qMinusT / baseMinusT);
          }

          output.push(stringFromCharCode(digitToBasic(q, 0)));
          bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
          delta = 0;
          ++handledCPCount;
        }
      }

      ++delta;
      ++n;
    }

    return output.join('');
  };
  /**
   * Converts a Punycode string representing a domain name or an email address
   * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
   * it doesn't matter if you call it on a string that has already been
   * converted to Unicode.
   * @memberOf punycode
   * @param {String} input The Punycoded domain name or email address to
   * convert to Unicode.
   * @returns {String} The Unicode representation of the given Punycode
   * string.
   */


  var toUnicode = function toUnicode(input) {
    return mapDomain(input, function (string) {
      return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
    });
  };
  /**
   * Converts a Unicode string representing a domain name or an email address to
   * Punycode. Only the non-ASCII parts of the domain name will be converted,
   * i.e. it doesn't matter if you call it with a domain that's already in
   * ASCII.
   * @memberOf punycode
   * @param {String} input The domain name or email address to convert, as a
   * Unicode string.
   * @returns {String} The Punycode representation of the given domain name or
   * email address.
   */


  var toASCII = function toASCII(input) {
    return mapDomain(input, function (string) {
      return regexNonASCII.test(string) ? 'xn--' + encode(string) : string;
    });
  };
  /*--------------------------------------------------------------------------*/

  /** Define the public API */


  var punycode = {
    /**
     * A string representing the current Punycode.js version number.
     * @memberOf punycode
     * @type String
     */
    'version': '2.1.0',

    /**
     * An object of methods to convert from JavaScript's internal character
     * representation (UCS-2) to Unicode code points, and back.
     * @see <https://mathiasbynens.be/notes/javascript-encoding>
     * @memberOf punycode
     * @type Object
     */
    'ucs2': {
      'decode': ucs2decode,
      'encode': ucs2encode
    },
    'decode': decode,
    'encode': encode,
    'toASCII': toASCII,
    'toUnicode': toUnicode
  };

  /*! @gerhobbelt/markdown-it 12.0.4-53 https://github.com/GerHobbelt/markdown-it @license MIT */

  function createCommonjsModule(fn) {
    var module = {
      exports: {}
    };
    return fn(module, module.exports), module.exports;
  }

  var require$$0 = {
    Aacute: "\xc1",
    aacute: "\xe1",
    Abreve: "\u0102",
    abreve: "\u0103",
    ac: "\u223E",
    acd: "\u223F",
    acE: "\u223E\u0333",
    Acirc: "\xc2",
    acirc: "\xe2",
    acute: "\xb4",
    Acy: "\u0410",
    acy: "\u0430",
    AElig: "\xc6",
    aelig: "\xe6",
    af: "\u2061",
    Afr: "\uD835\uDD04",
    afr: "\uD835\uDD1E",
    Agrave: "\xc0",
    agrave: "\xe0",
    alefsym: "\u2135",
    aleph: "\u2135",
    Alpha: "\u0391",
    alpha: "\u03B1",
    Amacr: "\u0100",
    amacr: "\u0101",
    amalg: "\u2A3F",
    amp: "&",
    AMP: "&",
    andand: "\u2A55",
    And: "\u2A53",
    and: "\u2227",
    andd: "\u2A5C",
    andslope: "\u2A58",
    andv: "\u2A5A",
    ang: "\u2220",
    ange: "\u29A4",
    angle: "\u2220",
    angmsdaa: "\u29A8",
    angmsdab: "\u29A9",
    angmsdac: "\u29AA",
    angmsdad: "\u29AB",
    angmsdae: "\u29AC",
    angmsdaf: "\u29AD",
    angmsdag: "\u29AE",
    angmsdah: "\u29AF",
    angmsd: "\u2221",
    angrt: "\u221F",
    angrtvb: "\u22BE",
    angrtvbd: "\u299D",
    angsph: "\u2222",
    angst: "\xc5",
    angzarr: "\u237C",
    Aogon: "\u0104",
    aogon: "\u0105",
    Aopf: "\uD835\uDD38",
    aopf: "\uD835\uDD52",
    apacir: "\u2A6F",
    ap: "\u2248",
    apE: "\u2A70",
    ape: "\u224A",
    apid: "\u224B",
    apos: "'",
    ApplyFunction: "\u2061",
    approx: "\u2248",
    approxeq: "\u224A",
    Aring: "\xc5",
    aring: "\xe5",
    Ascr: "\uD835\uDC9C",
    ascr: "\uD835\uDCB6",
    Assign: "\u2254",
    ast: "*",
    asymp: "\u2248",
    asympeq: "\u224D",
    Atilde: "\xc3",
    atilde: "\xe3",
    Auml: "\xc4",
    auml: "\xe4",
    awconint: "\u2233",
    awint: "\u2A11",
    backcong: "\u224C",
    backepsilon: "\u03F6",
    backprime: "\u2035",
    backsim: "\u223D",
    backsimeq: "\u22CD",
    Backslash: "\u2216",
    Barv: "\u2AE7",
    barvee: "\u22BD",
    barwed: "\u2305",
    Barwed: "\u2306",
    barwedge: "\u2305",
    bbrk: "\u23B5",
    bbrktbrk: "\u23B6",
    bcong: "\u224C",
    Bcy: "\u0411",
    bcy: "\u0431",
    bdquo: "\u201E",
    becaus: "\u2235",
    because: "\u2235",
    Because: "\u2235",
    bemptyv: "\u29B0",
    bepsi: "\u03F6",
    bernou: "\u212C",
    Bernoullis: "\u212C",
    Beta: "\u0392",
    beta: "\u03B2",
    beth: "\u2136",
    between: "\u226C",
    Bfr: "\uD835\uDD05",
    bfr: "\uD835\uDD1F",
    bigcap: "\u22C2",
    bigcirc: "\u25EF",
    bigcup: "\u22C3",
    bigodot: "\u2A00",
    bigoplus: "\u2A01",
    bigotimes: "\u2A02",
    bigsqcup: "\u2A06",
    bigstar: "\u2605",
    bigtriangledown: "\u25BD",
    bigtriangleup: "\u25B3",
    biguplus: "\u2A04",
    bigvee: "\u22C1",
    bigwedge: "\u22C0",
    bkarow: "\u290D",
    blacklozenge: "\u29EB",
    blacksquare: "\u25AA",
    blacktriangle: "\u25B4",
    blacktriangledown: "\u25BE",
    blacktriangleleft: "\u25C2",
    blacktriangleright: "\u25B8",
    blank: "\u2423",
    blk12: "\u2592",
    blk14: "\u2591",
    blk34: "\u2593",
    block: "\u2588",
    bne: "=\u20E5",
    bnequiv: "\u2261\u20E5",
    bNot: "\u2AED",
    bnot: "\u2310",
    Bopf: "\uD835\uDD39",
    bopf: "\uD835\uDD53",
    bot: "\u22A5",
    bottom: "\u22A5",
    bowtie: "\u22C8",
    boxbox: "\u29C9",
    boxdl: "\u2510",
    boxdL: "\u2555",
    boxDl: "\u2556",
    boxDL: "\u2557",
    boxdr: "\u250C",
    boxdR: "\u2552",
    boxDr: "\u2553",
    boxDR: "\u2554",
    boxh: "\u2500",
    boxH: "\u2550",
    boxhd: "\u252C",
    boxHd: "\u2564",
    boxhD: "\u2565",
    boxHD: "\u2566",
    boxhu: "\u2534",
    boxHu: "\u2567",
    boxhU: "\u2568",
    boxHU: "\u2569",
    boxminus: "\u229F",
    boxplus: "\u229E",
    boxtimes: "\u22A0",
    boxul: "\u2518",
    boxuL: "\u255B",
    boxUl: "\u255C",
    boxUL: "\u255D",
    boxur: "\u2514",
    boxuR: "\u2558",
    boxUr: "\u2559",
    boxUR: "\u255A",
    boxv: "\u2502",
    boxV: "\u2551",
    boxvh: "\u253C",
    boxvH: "\u256A",
    boxVh: "\u256B",
    boxVH: "\u256C",
    boxvl: "\u2524",
    boxvL: "\u2561",
    boxVl: "\u2562",
    boxVL: "\u2563",
    boxvr: "\u251C",
    boxvR: "\u255E",
    boxVr: "\u255F",
    boxVR: "\u2560",
    bprime: "\u2035",
    breve: "\u02D8",
    Breve: "\u02D8",
    brvbar: "\xa6",
    bscr: "\uD835\uDCB7",
    Bscr: "\u212C",
    bsemi: "\u204F",
    bsim: "\u223D",
    bsime: "\u22CD",
    bsolb: "\u29C5",
    bsol: "\\",
    bsolhsub: "\u27C8",
    bull: "\u2022",
    bullet: "\u2022",
    bump: "\u224E",
    bumpE: "\u2AAE",
    bumpe: "\u224F",
    Bumpeq: "\u224E",
    bumpeq: "\u224F",
    Cacute: "\u0106",
    cacute: "\u0107",
    capand: "\u2A44",
    capbrcup: "\u2A49",
    capcap: "\u2A4B",
    cap: "\u2229",
    Cap: "\u22D2",
    capcup: "\u2A47",
    capdot: "\u2A40",
    CapitalDifferentialD: "\u2145",
    caps: "\u2229\uFE00",
    caret: "\u2041",
    caron: "\u02C7",
    Cayleys: "\u212D",
    ccaps: "\u2A4D",
    Ccaron: "\u010C",
    ccaron: "\u010D",
    Ccedil: "\xc7",
    ccedil: "\xe7",
    Ccirc: "\u0108",
    ccirc: "\u0109",
    Cconint: "\u2230",
    ccups: "\u2A4C",
    ccupssm: "\u2A50",
    Cdot: "\u010A",
    cdot: "\u010B",
    cedil: "\xb8",
    Cedilla: "\xb8",
    cemptyv: "\u29B2",
    cent: "\xa2",
    centerdot: "\xb7",
    CenterDot: "\xb7",
    cfr: "\uD835\uDD20",
    Cfr: "\u212D",
    CHcy: "\u0427",
    chcy: "\u0447",
    check: "\u2713",
    checkmark: "\u2713",
    Chi: "\u03A7",
    chi: "\u03C7",
    circ: "\u02C6",
    circeq: "\u2257",
    circlearrowleft: "\u21BA",
    circlearrowright: "\u21BB",
    circledast: "\u229B",
    circledcirc: "\u229A",
    circleddash: "\u229D",
    CircleDot: "\u2299",
    circledR: "\xae",
    circledS: "\u24C8",
    CircleMinus: "\u2296",
    CirclePlus: "\u2295",
    CircleTimes: "\u2297",
    cir: "\u25CB",
    cirE: "\u29C3",
    cire: "\u2257",
    cirfnint: "\u2A10",
    cirmid: "\u2AEF",
    cirscir: "\u29C2",
    ClockwiseContourIntegral: "\u2232",
    CloseCurlyDoubleQuote: "\u201D",
    CloseCurlyQuote: "\u2019",
    clubs: "\u2663",
    clubsuit: "\u2663",
    colon: ":",
    Colon: "\u2237",
    Colone: "\u2A74",
    colone: "\u2254",
    coloneq: "\u2254",
    comma: ",",
    commat: "@",
    comp: "\u2201",
    compfn: "\u2218",
    complement: "\u2201",
    complexes: "\u2102",
    cong: "\u2245",
    congdot: "\u2A6D",
    Congruent: "\u2261",
    conint: "\u222E",
    Conint: "\u222F",
    ContourIntegral: "\u222E",
    copf: "\uD835\uDD54",
    Copf: "\u2102",
    coprod: "\u2210",
    Coproduct: "\u2210",
    copy: "\xa9",
    COPY: "\xa9",
    copysr: "\u2117",
    CounterClockwiseContourIntegral: "\u2233",
    crarr: "\u21B5",
    cross: "\u2717",
    Cross: "\u2A2F",
    Cscr: "\uD835\uDC9E",
    cscr: "\uD835\uDCB8",
    csub: "\u2ACF",
    csube: "\u2AD1",
    csup: "\u2AD0",
    csupe: "\u2AD2",
    ctdot: "\u22EF",
    cudarrl: "\u2938",
    cudarrr: "\u2935",
    cuepr: "\u22DE",
    cuesc: "\u22DF",
    cularr: "\u21B6",
    cularrp: "\u293D",
    cupbrcap: "\u2A48",
    cupcap: "\u2A46",
    CupCap: "\u224D",
    cup: "\u222A",
    Cup: "\u22D3",
    cupcup: "\u2A4A",
    cupdot: "\u228D",
    cupor: "\u2A45",
    cups: "\u222A\uFE00",
    curarr: "\u21B7",
    curarrm: "\u293C",
    curlyeqprec: "\u22DE",
    curlyeqsucc: "\u22DF",
    curlyvee: "\u22CE",
    curlywedge: "\u22CF",
    curren: "\xa4",
    curvearrowleft: "\u21B6",
    curvearrowright: "\u21B7",
    cuvee: "\u22CE",
    cuwed: "\u22CF",
    cwconint: "\u2232",
    cwint: "\u2231",
    cylcty: "\u232D",
    dagger: "\u2020",
    Dagger: "\u2021",
    daleth: "\u2138",
    darr: "\u2193",
    Darr: "\u21A1",
    dArr: "\u21D3",
    dash: "\u2010",
    Dashv: "\u2AE4",
    dashv: "\u22A3",
    dbkarow: "\u290F",
    dblac: "\u02DD",
    Dcaron: "\u010E",
    dcaron: "\u010F",
    Dcy: "\u0414",
    dcy: "\u0434",
    ddagger: "\u2021",
    ddarr: "\u21CA",
    DD: "\u2145",
    dd: "\u2146",
    DDotrahd: "\u2911",
    ddotseq: "\u2A77",
    deg: "\xb0",
    Del: "\u2207",
    Delta: "\u0394",
    delta: "\u03B4",
    demptyv: "\u29B1",
    dfisht: "\u297F",
    Dfr: "\uD835\uDD07",
    dfr: "\uD835\uDD21",
    dHar: "\u2965",
    dharl: "\u21C3",
    dharr: "\u21C2",
    DiacriticalAcute: "\xb4",
    DiacriticalDot: "\u02D9",
    DiacriticalDoubleAcute: "\u02DD",
    DiacriticalGrave: "`",
    DiacriticalTilde: "\u02DC",
    diam: "\u22C4",
    diamond: "\u22C4",
    Diamond: "\u22C4",
    diamondsuit: "\u2666",
    diams: "\u2666",
    die: "\xa8",
    DifferentialD: "\u2146",
    digamma: "\u03DD",
    disin: "\u22F2",
    div: "\xf7",
    divide: "\xf7",
    divideontimes: "\u22C7",
    divonx: "\u22C7",
    DJcy: "\u0402",
    djcy: "\u0452",
    dlcorn: "\u231E",
    dlcrop: "\u230D",
    dollar: "$",
    Dopf: "\uD835\uDD3B",
    dopf: "\uD835\uDD55",
    Dot: "\xa8",
    dot: "\u02D9",
    DotDot: "\u20DC",
    doteq: "\u2250",
    doteqdot: "\u2251",
    DotEqual: "\u2250",
    dotminus: "\u2238",
    dotplus: "\u2214",
    dotsquare: "\u22A1",
    doublebarwedge: "\u2306",
    DoubleContourIntegral: "\u222F",
    DoubleDot: "\xa8",
    DoubleDownArrow: "\u21D3",
    DoubleLeftArrow: "\u21D0",
    DoubleLeftRightArrow: "\u21D4",
    DoubleLeftTee: "\u2AE4",
    DoubleLongLeftArrow: "\u27F8",
    DoubleLongLeftRightArrow: "\u27FA",
    DoubleLongRightArrow: "\u27F9",
    DoubleRightArrow: "\u21D2",
    DoubleRightTee: "\u22A8",
    DoubleUpArrow: "\u21D1",
    DoubleUpDownArrow: "\u21D5",
    DoubleVerticalBar: "\u2225",
    DownArrowBar: "\u2913",
    downarrow: "\u2193",
    DownArrow: "\u2193",
    Downarrow: "\u21D3",
    DownArrowUpArrow: "\u21F5",
    DownBreve: "\u0311",
    downdownarrows: "\u21CA",
    downharpoonleft: "\u21C3",
    downharpoonright: "\u21C2",
    DownLeftRightVector: "\u2950",
    DownLeftTeeVector: "\u295E",
    DownLeftVectorBar: "\u2956",
    DownLeftVector: "\u21BD",
    DownRightTeeVector: "\u295F",
    DownRightVectorBar: "\u2957",
    DownRightVector: "\u21C1",
    DownTeeArrow: "\u21A7",
    DownTee: "\u22A4",
    drbkarow: "\u2910",
    drcorn: "\u231F",
    drcrop: "\u230C",
    Dscr: "\uD835\uDC9F",
    dscr: "\uD835\uDCB9",
    DScy: "\u0405",
    dscy: "\u0455",
    dsol: "\u29F6",
    Dstrok: "\u0110",
    dstrok: "\u0111",
    dtdot: "\u22F1",
    dtri: "\u25BF",
    dtrif: "\u25BE",
    duarr: "\u21F5",
    duhar: "\u296F",
    dwangle: "\u29A6",
    DZcy: "\u040F",
    dzcy: "\u045F",
    dzigrarr: "\u27FF",
    Eacute: "\xc9",
    eacute: "\xe9",
    easter: "\u2A6E",
    Ecaron: "\u011A",
    ecaron: "\u011B",
    Ecirc: "\xca",
    ecirc: "\xea",
    ecir: "\u2256",
    ecolon: "\u2255",
    Ecy: "\u042D",
    ecy: "\u044D",
    eDDot: "\u2A77",
    Edot: "\u0116",
    edot: "\u0117",
    eDot: "\u2251",
    ee: "\u2147",
    efDot: "\u2252",
    Efr: "\uD835\uDD08",
    efr: "\uD835\uDD22",
    eg: "\u2A9A",
    Egrave: "\xc8",
    egrave: "\xe8",
    egs: "\u2A96",
    egsdot: "\u2A98",
    el: "\u2A99",
    Element: "\u2208",
    elinters: "\u23E7",
    ell: "\u2113",
    els: "\u2A95",
    elsdot: "\u2A97",
    Emacr: "\u0112",
    emacr: "\u0113",
    empty: "\u2205",
    emptyset: "\u2205",
    EmptySmallSquare: "\u25FB",
    emptyv: "\u2205",
    EmptyVerySmallSquare: "\u25AB",
    emsp13: "\u2004",
    emsp14: "\u2005",
    emsp: "\u2003",
    ENG: "\u014A",
    eng: "\u014B",
    ensp: "\u2002",
    Eogon: "\u0118",
    eogon: "\u0119",
    Eopf: "\uD835\uDD3C",
    eopf: "\uD835\uDD56",
    epar: "\u22D5",
    eparsl: "\u29E3",
    eplus: "\u2A71",
    epsi: "\u03B5",
    Epsilon: "\u0395",
    epsilon: "\u03B5",
    epsiv: "\u03F5",
    eqcirc: "\u2256",
    eqcolon: "\u2255",
    eqsim: "\u2242",
    eqslantgtr: "\u2A96",
    eqslantless: "\u2A95",
    Equal: "\u2A75",
    equals: "=",
    EqualTilde: "\u2242",
    equest: "\u225F",
    Equilibrium: "\u21CC",
    equiv: "\u2261",
    equivDD: "\u2A78",
    eqvparsl: "\u29E5",
    erarr: "\u2971",
    erDot: "\u2253",
    escr: "\u212F",
    Escr: "\u2130",
    esdot: "\u2250",
    Esim: "\u2A73",
    esim: "\u2242",
    Eta: "\u0397",
    eta: "\u03B7",
    ETH: "\xd0",
    eth: "\xf0",
    Euml: "\xcb",
    euml: "\xeb",
    euro: "\u20AC",
    excl: "!",
    exist: "\u2203",
    Exists: "\u2203",
    expectation: "\u2130",
    exponentiale: "\u2147",
    ExponentialE: "\u2147",
    fallingdotseq: "\u2252",
    Fcy: "\u0424",
    fcy: "\u0444",
    female: "\u2640",
    ffilig: "\uFB03",
    fflig: "\uFB00",
    ffllig: "\uFB04",
    Ffr: "\uD835\uDD09",
    ffr: "\uD835\uDD23",
    filig: "\uFB01",
    FilledSmallSquare: "\u25FC",
    FilledVerySmallSquare: "\u25AA",
    fjlig: "fj",
    flat: "\u266D",
    fllig: "\uFB02",
    fltns: "\u25B1",
    fnof: "\u0192",
    Fopf: "\uD835\uDD3D",
    fopf: "\uD835\uDD57",
    forall: "\u2200",
    ForAll: "\u2200",
    fork: "\u22D4",
    forkv: "\u2AD9",
    Fouriertrf: "\u2131",
    fpartint: "\u2A0D",
    frac12: "\xbd",
    frac13: "\u2153",
    frac14: "\xbc",
    frac15: "\u2155",
    frac16: "\u2159",
    frac18: "\u215B",
    frac23: "\u2154",
    frac25: "\u2156",
    frac34: "\xbe",
    frac35: "\u2157",
    frac38: "\u215C",
    frac45: "\u2158",
    frac56: "\u215A",
    frac58: "\u215D",
    frac78: "\u215E",
    frasl: "\u2044",
    frown: "\u2322",
    fscr: "\uD835\uDCBB",
    Fscr: "\u2131",
    gacute: "\u01F5",
    Gamma: "\u0393",
    gamma: "\u03B3",
    Gammad: "\u03DC",
    gammad: "\u03DD",
    gap: "\u2A86",
    Gbreve: "\u011E",
    gbreve: "\u011F",
    Gcedil: "\u0122",
    Gcirc: "\u011C",
    gcirc: "\u011D",
    Gcy: "\u0413",
    gcy: "\u0433",
    Gdot: "\u0120",
    gdot: "\u0121",
    ge: "\u2265",
    gE: "\u2267",
    gEl: "\u2A8C",
    gel: "\u22DB",
    geq: "\u2265",
    geqq: "\u2267",
    geqslant: "\u2A7E",
    gescc: "\u2AA9",
    ges: "\u2A7E",
    gesdot: "\u2A80",
    gesdoto: "\u2A82",
    gesdotol: "\u2A84",
    gesl: "\u22DB\uFE00",
    gesles: "\u2A94",
    Gfr: "\uD835\uDD0A",
    gfr: "\uD835\uDD24",
    gg: "\u226B",
    Gg: "\u22D9",
    ggg: "\u22D9",
    gimel: "\u2137",
    GJcy: "\u0403",
    gjcy: "\u0453",
    gla: "\u2AA5",
    gl: "\u2277",
    glE: "\u2A92",
    glj: "\u2AA4",
    gnap: "\u2A8A",
    gnapprox: "\u2A8A",
    gne: "\u2A88",
    gnE: "\u2269",
    gneq: "\u2A88",
    gneqq: "\u2269",
    gnsim: "\u22E7",
    Gopf: "\uD835\uDD3E",
    gopf: "\uD835\uDD58",
    grave: "`",
    GreaterEqual: "\u2265",
    GreaterEqualLess: "\u22DB",
    GreaterFullEqual: "\u2267",
    GreaterGreater: "\u2AA2",
    GreaterLess: "\u2277",
    GreaterSlantEqual: "\u2A7E",
    GreaterTilde: "\u2273",
    Gscr: "\uD835\uDCA2",
    gscr: "\u210A",
    gsim: "\u2273",
    gsime: "\u2A8E",
    gsiml: "\u2A90",
    gtcc: "\u2AA7",
    gtcir: "\u2A7A",
    gt: ">",
    GT: ">",
    Gt: "\u226B",
    gtdot: "\u22D7",
    gtlPar: "\u2995",
    gtquest: "\u2A7C",
    gtrapprox: "\u2A86",
    gtrarr: "\u2978",
    gtrdot: "\u22D7",
    gtreqless: "\u22DB",
    gtreqqless: "\u2A8C",
    gtrless: "\u2277",
    gtrsim: "\u2273",
    gvertneqq: "\u2269\uFE00",
    gvnE: "\u2269\uFE00",
    Hacek: "\u02C7",
    hairsp: "\u200A",
    half: "\xbd",
    hamilt: "\u210B",
    HARDcy: "\u042A",
    hardcy: "\u044A",
    harrcir: "\u2948",
    harr: "\u2194",
    hArr: "\u21D4",
    harrw: "\u21AD",
    Hat: "^",
    hbar: "\u210F",
    Hcirc: "\u0124",
    hcirc: "\u0125",
    hearts: "\u2665",
    heartsuit: "\u2665",
    hellip: "\u2026",
    hercon: "\u22B9",
    hfr: "\uD835\uDD25",
    Hfr: "\u210C",
    HilbertSpace: "\u210B",
    hksearow: "\u2925",
    hkswarow: "\u2926",
    hoarr: "\u21FF",
    homtht: "\u223B",
    hookleftarrow: "\u21A9",
    hookrightarrow: "\u21AA",
    hopf: "\uD835\uDD59",
    Hopf: "\u210D",
    horbar: "\u2015",
    HorizontalLine: "\u2500",
    hscr: "\uD835\uDCBD",
    Hscr: "\u210B",
    hslash: "\u210F",
    Hstrok: "\u0126",
    hstrok: "\u0127",
    HumpDownHump: "\u224E",
    HumpEqual: "\u224F",
    hybull: "\u2043",
    hyphen: "\u2010",
    Iacute: "\xcd",
    iacute: "\xed",
    ic: "\u2063",
    Icirc: "\xce",
    icirc: "\xee",
    Icy: "\u0418",
    icy: "\u0438",
    Idot: "\u0130",
    IEcy: "\u0415",
    iecy: "\u0435",
    iexcl: "\xa1",
    iff: "\u21D4",
    ifr: "\uD835\uDD26",
    Ifr: "\u2111",
    Igrave: "\xcc",
    igrave: "\xec",
    ii: "\u2148",
    iiiint: "\u2A0C",
    iiint: "\u222D",
    iinfin: "\u29DC",
    iiota: "\u2129",
    IJlig: "\u0132",
    ijlig: "\u0133",
    Imacr: "\u012A",
    imacr: "\u012B",
    image: "\u2111",
    ImaginaryI: "\u2148",
    imagline: "\u2110",
    imagpart: "\u2111",
    imath: "\u0131",
    Im: "\u2111",
    imof: "\u22B7",
    imped: "\u01B5",
    Implies: "\u21D2",
    incare: "\u2105",
    "in": "\u2208",
    infin: "\u221E",
    infintie: "\u29DD",
    inodot: "\u0131",
    intcal: "\u22BA",
    "int": "\u222B",
    Int: "\u222C",
    integers: "\u2124",
    Integral: "\u222B",
    intercal: "\u22BA",
    Intersection: "\u22C2",
    intlarhk: "\u2A17",
    intprod: "\u2A3C",
    InvisibleComma: "\u2063",
    InvisibleTimes: "\u2062",
    IOcy: "\u0401",
    iocy: "\u0451",
    Iogon: "\u012E",
    iogon: "\u012F",
    Iopf: "\uD835\uDD40",
    iopf: "\uD835\uDD5A",
    Iota: "\u0399",
    iota: "\u03B9",
    iprod: "\u2A3C",
    iquest: "\xbf",
    iscr: "\uD835\uDCBE",
    Iscr: "\u2110",
    isin: "\u2208",
    isindot: "\u22F5",
    isinE: "\u22F9",
    isins: "\u22F4",
    isinsv: "\u22F3",
    isinv: "\u2208",
    it: "\u2062",
    Itilde: "\u0128",
    itilde: "\u0129",
    Iukcy: "\u0406",
    iukcy: "\u0456",
    Iuml: "\xcf",
    iuml: "\xef",
    Jcirc: "\u0134",
    jcirc: "\u0135",
    Jcy: "\u0419",
    jcy: "\u0439",
    Jfr: "\uD835\uDD0D",
    jfr: "\uD835\uDD27",
    jmath: "\u0237",
    Jopf: "\uD835\uDD41",
    jopf: "\uD835\uDD5B",
    Jscr: "\uD835\uDCA5",
    jscr: "\uD835\uDCBF",
    Jsercy: "\u0408",
    jsercy: "\u0458",
    Jukcy: "\u0404",
    jukcy: "\u0454",
    Kappa: "\u039A",
    kappa: "\u03BA",
    kappav: "\u03F0",
    Kcedil: "\u0136",
    kcedil: "\u0137",
    Kcy: "\u041A",
    kcy: "\u043A",
    Kfr: "\uD835\uDD0E",
    kfr: "\uD835\uDD28",
    kgreen: "\u0138",
    KHcy: "\u0425",
    khcy: "\u0445",
    KJcy: "\u040C",
    kjcy: "\u045C",
    Kopf: "\uD835\uDD42",
    kopf: "\uD835\uDD5C",
    Kscr: "\uD835\uDCA6",
    kscr: "\uD835\uDCC0",
    lAarr: "\u21DA",
    Lacute: "\u0139",
    lacute: "\u013A",
    laemptyv: "\u29B4",
    lagran: "\u2112",
    Lambda: "\u039B",
    lambda: "\u03BB",
    lang: "\u27E8",
    Lang: "\u27EA",
    langd: "\u2991",
    langle: "\u27E8",
    lap: "\u2A85",
    Laplacetrf: "\u2112",
    laquo: "\xab",
    larrb: "\u21E4",
    larrbfs: "\u291F",
    larr: "\u2190",
    Larr: "\u219E",
    lArr: "\u21D0",
    larrfs: "\u291D",
    larrhk: "\u21A9",
    larrlp: "\u21AB",
    larrpl: "\u2939",
    larrsim: "\u2973",
    larrtl: "\u21A2",
    latail: "\u2919",
    lAtail: "\u291B",
    lat: "\u2AAB",
    late: "\u2AAD",
    lates: "\u2AAD\uFE00",
    lbarr: "\u290C",
    lBarr: "\u290E",
    lbbrk: "\u2772",
    lbrace: "{",
    lbrack: "[",
    lbrke: "\u298B",
    lbrksld: "\u298F",
    lbrkslu: "\u298D",
    Lcaron: "\u013D",
    lcaron: "\u013E",
    Lcedil: "\u013B",
    lcedil: "\u013C",
    lceil: "\u2308",
    lcub: "{",
    Lcy: "\u041B",
    lcy: "\u043B",
    ldca: "\u2936",
    ldquo: "\u201C",
    ldquor: "\u201E",
    ldrdhar: "\u2967",
    ldrushar: "\u294B",
    ldsh: "\u21B2",
    le: "\u2264",
    lE: "\u2266",
    LeftAngleBracket: "\u27E8",
    LeftArrowBar: "\u21E4",
    leftarrow: "\u2190",
    LeftArrow: "\u2190",
    Leftarrow: "\u21D0",
    LeftArrowRightArrow: "\u21C6",
    leftarrowtail: "\u21A2",
    LeftCeiling: "\u2308",
    LeftDoubleBracket: "\u27E6",
    LeftDownTeeVector: "\u2961",
    LeftDownVectorBar: "\u2959",
    LeftDownVector: "\u21C3",
    LeftFloor: "\u230A",
    leftharpoondown: "\u21BD",
    leftharpoonup: "\u21BC",
    leftleftarrows: "\u21C7",
    leftrightarrow: "\u2194",
    LeftRightArrow: "\u2194",
    Leftrightarrow: "\u21D4",
    leftrightarrows: "\u21C6",
    leftrightharpoons: "\u21CB",
    leftrightsquigarrow: "\u21AD",
    LeftRightVector: "\u294E",
    LeftTeeArrow: "\u21A4",
    LeftTee: "\u22A3",
    LeftTeeVector: "\u295A",
    leftthreetimes: "\u22CB",
    LeftTriangleBar: "\u29CF",
    LeftTriangle: "\u22B2",
    LeftTriangleEqual: "\u22B4",
    LeftUpDownVector: "\u2951",
    LeftUpTeeVector: "\u2960",
    LeftUpVectorBar: "\u2958",
    LeftUpVector: "\u21BF",
    LeftVectorBar: "\u2952",
    LeftVector: "\u21BC",
    lEg: "\u2A8B",
    leg: "\u22DA",
    leq: "\u2264",
    leqq: "\u2266",
    leqslant: "\u2A7D",
    lescc: "\u2AA8",
    les: "\u2A7D",
    lesdot: "\u2A7F",
    lesdoto: "\u2A81",
    lesdotor: "\u2A83",
    lesg: "\u22DA\uFE00",
    lesges: "\u2A93",
    lessapprox: "\u2A85",
    lessdot: "\u22D6",
    lesseqgtr: "\u22DA",
    lesseqqgtr: "\u2A8B",
    LessEqualGreater: "\u22DA",
    LessFullEqual: "\u2266",
    LessGreater: "\u2276",
    lessgtr: "\u2276",
    LessLess: "\u2AA1",
    lesssim: "\u2272",
    LessSlantEqual: "\u2A7D",
    LessTilde: "\u2272",
    lfisht: "\u297C",
    lfloor: "\u230A",
    Lfr: "\uD835\uDD0F",
    lfr: "\uD835\uDD29",
    lg: "\u2276",
    lgE: "\u2A91",
    lHar: "\u2962",
    lhard: "\u21BD",
    lharu: "\u21BC",
    lharul: "\u296A",
    lhblk: "\u2584",
    LJcy: "\u0409",
    ljcy: "\u0459",
    llarr: "\u21C7",
    ll: "\u226A",
    Ll: "\u22D8",
    llcorner: "\u231E",
    Lleftarrow: "\u21DA",
    llhard: "\u296B",
    lltri: "\u25FA",
    Lmidot: "\u013F",
    lmidot: "\u0140",
    lmoustache: "\u23B0",
    lmoust: "\u23B0",
    lnap: "\u2A89",
    lnapprox: "\u2A89",
    lne: "\u2A87",
    lnE: "\u2268",
    lneq: "\u2A87",
    lneqq: "\u2268",
    lnsim: "\u22E6",
    loang: "\u27EC",
    loarr: "\u21FD",
    lobrk: "\u27E6",
    longleftarrow: "\u27F5",
    LongLeftArrow: "\u27F5",
    Longleftarrow: "\u27F8",
    longleftrightarrow: "\u27F7",
    LongLeftRightArrow: "\u27F7",
    Longleftrightarrow: "\u27FA",
    longmapsto: "\u27FC",
    longrightarrow: "\u27F6",
    LongRightArrow: "\u27F6",
    Longrightarrow: "\u27F9",
    looparrowleft: "\u21AB",
    looparrowright: "\u21AC",
    lopar: "\u2985",
    Lopf: "\uD835\uDD43",
    lopf: "\uD835\uDD5D",
    loplus: "\u2A2D",
    lotimes: "\u2A34",
    lowast: "\u2217",
    lowbar: "_",
    LowerLeftArrow: "\u2199",
    LowerRightArrow: "\u2198",
    loz: "\u25CA",
    lozenge: "\u25CA",
    lozf: "\u29EB",
    lpar: "(",
    lparlt: "\u2993",
    lrarr: "\u21C6",
    lrcorner: "\u231F",
    lrhar: "\u21CB",
    lrhard: "\u296D",
    lrm: "\u200E",
    lrtri: "\u22BF",
    lsaquo: "\u2039",
    lscr: "\uD835\uDCC1",
    Lscr: "\u2112",
    lsh: "\u21B0",
    Lsh: "\u21B0",
    lsim: "\u2272",
    lsime: "\u2A8D",
    lsimg: "\u2A8F",
    lsqb: "[",
    lsquo: "\u2018",
    lsquor: "\u201A",
    Lstrok: "\u0141",
    lstrok: "\u0142",
    ltcc: "\u2AA6",
    ltcir: "\u2A79",
    lt: "<",
    LT: "<",
    Lt: "\u226A",
    ltdot: "\u22D6",
    lthree: "\u22CB",
    ltimes: "\u22C9",
    ltlarr: "\u2976",
    ltquest: "\u2A7B",
    ltri: "\u25C3",
    ltrie: "\u22B4",
    ltrif: "\u25C2",
    ltrPar: "\u2996",
    lurdshar: "\u294A",
    luruhar: "\u2966",
    lvertneqq: "\u2268\uFE00",
    lvnE: "\u2268\uFE00",
    macr: "\xaf",
    male: "\u2642",
    malt: "\u2720",
    maltese: "\u2720",
    Map: "\u2905",
    map: "\u21A6",
    mapsto: "\u21A6",
    mapstodown: "\u21A7",
    mapstoleft: "\u21A4",
    mapstoup: "\u21A5",
    marker: "\u25AE",
    mcomma: "\u2A29",
    Mcy: "\u041C",
    mcy: "\u043C",
    mdash: "\u2014",
    mDDot: "\u223A",
    measuredangle: "\u2221",
    MediumSpace: "\u205F",
    Mellintrf: "\u2133",
    Mfr: "\uD835\uDD10",
    mfr: "\uD835\uDD2A",
    mho: "\u2127",
    micro: "\xb5",
    midast: "*",
    midcir: "\u2AF0",
    mid: "\u2223",
    middot: "\xb7",
    minusb: "\u229F",
    minus: "\u2212",
    minusd: "\u2238",
    minusdu: "\u2A2A",
    MinusPlus: "\u2213",
    mlcp: "\u2ADB",
    mldr: "\u2026",
    mnplus: "\u2213",
    models: "\u22A7",
    Mopf: "\uD835\uDD44",
    mopf: "\uD835\uDD5E",
    mp: "\u2213",
    mscr: "\uD835\uDCC2",
    Mscr: "\u2133",
    mstpos: "\u223E",
    Mu: "\u039C",
    mu: "\u03BC",
    multimap: "\u22B8",
    mumap: "\u22B8",
    nabla: "\u2207",
    Nacute: "\u0143",
    nacute: "\u0144",
    nang: "\u2220\u20D2",
    nap: "\u2249",
    napE: "\u2A70\u0338",
    napid: "\u224B\u0338",
    napos: "\u0149",
    napprox: "\u2249",
    natural: "\u266E",
    naturals: "\u2115",
    natur: "\u266E",
    nbsp: "\xa0",
    nbump: "\u224E\u0338",
    nbumpe: "\u224F\u0338",
    ncap: "\u2A43",
    Ncaron: "\u0147",
    ncaron: "\u0148",
    Ncedil: "\u0145",
    ncedil: "\u0146",
    ncong: "\u2247",
    ncongdot: "\u2A6D\u0338",
    ncup: "\u2A42",
    Ncy: "\u041D",
    ncy: "\u043D",
    ndash: "\u2013",
    nearhk: "\u2924",
    nearr: "\u2197",
    neArr: "\u21D7",
    nearrow: "\u2197",
    ne: "\u2260",
    nedot: "\u2250\u0338",
    NegativeMediumSpace: "\u200B",
    NegativeThickSpace: "\u200B",
    NegativeThinSpace: "\u200B",
    NegativeVeryThinSpace: "\u200B",
    nequiv: "\u2262",
    nesear: "\u2928",
    nesim: "\u2242\u0338",
    NestedGreaterGreater: "\u226B",
    NestedLessLess: "\u226A",
    NewLine: "\n",
    nexist: "\u2204",
    nexists: "\u2204",
    Nfr: "\uD835\uDD11",
    nfr: "\uD835\uDD2B",
    ngE: "\u2267\u0338",
    nge: "\u2271",
    ngeq: "\u2271",
    ngeqq: "\u2267\u0338",
    ngeqslant: "\u2A7E\u0338",
    nges: "\u2A7E\u0338",
    nGg: "\u22D9\u0338",
    ngsim: "\u2275",
    nGt: "\u226B\u20D2",
    ngt: "\u226F",
    ngtr: "\u226F",
    nGtv: "\u226B\u0338",
    nharr: "\u21AE",
    nhArr: "\u21CE",
    nhpar: "\u2AF2",
    ni: "\u220B",
    nis: "\u22FC",
    nisd: "\u22FA",
    niv: "\u220B",
    NJcy: "\u040A",
    njcy: "\u045A",
    nlarr: "\u219A",
    nlArr: "\u21CD",
    nldr: "\u2025",
    nlE: "\u2266\u0338",
    nle: "\u2270",
    nleftarrow: "\u219A",
    nLeftarrow: "\u21CD",
    nleftrightarrow: "\u21AE",
    nLeftrightarrow: "\u21CE",
    nleq: "\u2270",
    nleqq: "\u2266\u0338",
    nleqslant: "\u2A7D\u0338",
    nles: "\u2A7D\u0338",
    nless: "\u226E",
    nLl: "\u22D8\u0338",
    nlsim: "\u2274",
    nLt: "\u226A\u20D2",
    nlt: "\u226E",
    nltri: "\u22EA",
    nltrie: "\u22EC",
    nLtv: "\u226A\u0338",
    nmid: "\u2224",
    NoBreak: "\u2060",
    NonBreakingSpace: "\xa0",
    nopf: "\uD835\uDD5F",
    Nopf: "\u2115",
    Not: "\u2AEC",
    not: "\xac",
    NotCongruent: "\u2262",
    NotCupCap: "\u226D",
    NotDoubleVerticalBar: "\u2226",
    NotElement: "\u2209",
    NotEqual: "\u2260",
    NotEqualTilde: "\u2242\u0338",
    NotExists: "\u2204",
    NotGreater: "\u226F",
    NotGreaterEqual: "\u2271",
    NotGreaterFullEqual: "\u2267\u0338",
    NotGreaterGreater: "\u226B\u0338",
    NotGreaterLess: "\u2279",
    NotGreaterSlantEqual: "\u2A7E\u0338",
    NotGreaterTilde: "\u2275",
    NotHumpDownHump: "\u224E\u0338",
    NotHumpEqual: "\u224F\u0338",
    notin: "\u2209",
    notindot: "\u22F5\u0338",
    notinE: "\u22F9\u0338",
    notinva: "\u2209",
    notinvb: "\u22F7",
    notinvc: "\u22F6",
    NotLeftTriangleBar: "\u29CF\u0338",
    NotLeftTriangle: "\u22EA",
    NotLeftTriangleEqual: "\u22EC",
    NotLess: "\u226E",
    NotLessEqual: "\u2270",
    NotLessGreater: "\u2278",
    NotLessLess: "\u226A\u0338",
    NotLessSlantEqual: "\u2A7D\u0338",
    NotLessTilde: "\u2274",
    NotNestedGreaterGreater: "\u2AA2\u0338",
    NotNestedLessLess: "\u2AA1\u0338",
    notni: "\u220C",
    notniva: "\u220C",
    notnivb: "\u22FE",
    notnivc: "\u22FD",
    NotPrecedes: "\u2280",
    NotPrecedesEqual: "\u2AAF\u0338",
    NotPrecedesSlantEqual: "\u22E0",
    NotReverseElement: "\u220C",
    NotRightTriangleBar: "\u29D0\u0338",
    NotRightTriangle: "\u22EB",
    NotRightTriangleEqual: "\u22ED",
    NotSquareSubset: "\u228F\u0338",
    NotSquareSubsetEqual: "\u22E2",
    NotSquareSuperset: "\u2290\u0338",
    NotSquareSupersetEqual: "\u22E3",
    NotSubset: "\u2282\u20D2",
    NotSubsetEqual: "\u2288",
    NotSucceeds: "\u2281",
    NotSucceedsEqual: "\u2AB0\u0338",
    NotSucceedsSlantEqual: "\u22E1",
    NotSucceedsTilde: "\u227F\u0338",
    NotSuperset: "\u2283\u20D2",
    NotSupersetEqual: "\u2289",
    NotTilde: "\u2241",
    NotTildeEqual: "\u2244",
    NotTildeFullEqual: "\u2247",
    NotTildeTilde: "\u2249",
    NotVerticalBar: "\u2224",
    nparallel: "\u2226",
    npar: "\u2226",
    nparsl: "\u2AFD\u20E5",
    npart: "\u2202\u0338",
    npolint: "\u2A14",
    npr: "\u2280",
    nprcue: "\u22E0",
    nprec: "\u2280",
    npreceq: "\u2AAF\u0338",
    npre: "\u2AAF\u0338",
    nrarrc: "\u2933\u0338",
    nrarr: "\u219B",
    nrArr: "\u21CF",
    nrarrw: "\u219D\u0338",
    nrightarrow: "\u219B",
    nRightarrow: "\u21CF",
    nrtri: "\u22EB",
    nrtrie: "\u22ED",
    nsc: "\u2281",
    nsccue: "\u22E1",
    nsce: "\u2AB0\u0338",
    Nscr: "\uD835\uDCA9",
    nscr: "\uD835\uDCC3",
    nshortmid: "\u2224",
    nshortparallel: "\u2226",
    nsim: "\u2241",
    nsime: "\u2244",
    nsimeq: "\u2244",
    nsmid: "\u2224",
    nspar: "\u2226",
    nsqsube: "\u22E2",
    nsqsupe: "\u22E3",
    nsub: "\u2284",
    nsubE: "\u2AC5\u0338",
    nsube: "\u2288",
    nsubset: "\u2282\u20D2",
    nsubseteq: "\u2288",
    nsubseteqq: "\u2AC5\u0338",
    nsucc: "\u2281",
    nsucceq: "\u2AB0\u0338",
    nsup: "\u2285",
    nsupE: "\u2AC6\u0338",
    nsupe: "\u2289",
    nsupset: "\u2283\u20D2",
    nsupseteq: "\u2289",
    nsupseteqq: "\u2AC6\u0338",
    ntgl: "\u2279",
    Ntilde: "\xd1",
    ntilde: "\xf1",
    ntlg: "\u2278",
    ntriangleleft: "\u22EA",
    ntrianglelefteq: "\u22EC",
    ntriangleright: "\u22EB",
    ntrianglerighteq: "\u22ED",
    Nu: "\u039D",
    nu: "\u03BD",
    num: "#",
    numero: "\u2116",
    numsp: "\u2007",
    nvap: "\u224D\u20D2",
    nvdash: "\u22AC",
    nvDash: "\u22AD",
    nVdash: "\u22AE",
    nVDash: "\u22AF",
    nvge: "\u2265\u20D2",
    nvgt: ">\u20D2",
    nvHarr: "\u2904",
    nvinfin: "\u29DE",
    nvlArr: "\u2902",
    nvle: "\u2264\u20D2",
    nvlt: "<\u20D2",
    nvltrie: "\u22B4\u20D2",
    nvrArr: "\u2903",
    nvrtrie: "\u22B5\u20D2",
    nvsim: "\u223C\u20D2",
    nwarhk: "\u2923",
    nwarr: "\u2196",
    nwArr: "\u21D6",
    nwarrow: "\u2196",
    nwnear: "\u2927",
    Oacute: "\xd3",
    oacute: "\xf3",
    oast: "\u229B",
    Ocirc: "\xd4",
    ocirc: "\xf4",
    ocir: "\u229A",
    Ocy: "\u041E",
    ocy: "\u043E",
    odash: "\u229D",
    Odblac: "\u0150",
    odblac: "\u0151",
    odiv: "\u2A38",
    odot: "\u2299",
    odsold: "\u29BC",
    OElig: "\u0152",
    oelig: "\u0153",
    ofcir: "\u29BF",
    Ofr: "\uD835\uDD12",
    ofr: "\uD835\uDD2C",
    ogon: "\u02DB",
    Ograve: "\xd2",
    ograve: "\xf2",
    ogt: "\u29C1",
    ohbar: "\u29B5",
    ohm: "\u03A9",
    oint: "\u222E",
    olarr: "\u21BA",
    olcir: "\u29BE",
    olcross: "\u29BB",
    oline: "\u203E",
    olt: "\u29C0",
    Omacr: "\u014C",
    omacr: "\u014D",
    Omega: "\u03A9",
    omega: "\u03C9",
    Omicron: "\u039F",
    omicron: "\u03BF",
    omid: "\u29B6",
    ominus: "\u2296",
    Oopf: "\uD835\uDD46",
    oopf: "\uD835\uDD60",
    opar: "\u29B7",
    OpenCurlyDoubleQuote: "\u201C",
    OpenCurlyQuote: "\u2018",
    operp: "\u29B9",
    oplus: "\u2295",
    orarr: "\u21BB",
    Or: "\u2A54",
    or: "\u2228",
    ord: "\u2A5D",
    order: "\u2134",
    orderof: "\u2134",
    ordf: "\xaa",
    ordm: "\xba",
    origof: "\u22B6",
    oror: "\u2A56",
    orslope: "\u2A57",
    orv: "\u2A5B",
    oS: "\u24C8",
    Oscr: "\uD835\uDCAA",
    oscr: "\u2134",
    Oslash: "\xd8",
    oslash: "\xf8",
    osol: "\u2298",
    Otilde: "\xd5",
    otilde: "\xf5",
    otimesas: "\u2A36",
    Otimes: "\u2A37",
    otimes: "\u2297",
    Ouml: "\xd6",
    ouml: "\xf6",
    ovbar: "\u233D",
    OverBar: "\u203E",
    OverBrace: "\u23DE",
    OverBracket: "\u23B4",
    OverParenthesis: "\u23DC",
    para: "\xb6",
    parallel: "\u2225",
    par: "\u2225",
    parsim: "\u2AF3",
    parsl: "\u2AFD",
    part: "\u2202",
    PartialD: "\u2202",
    Pcy: "\u041F",
    pcy: "\u043F",
    percnt: "%",
    period: ".",
    permil: "\u2030",
    perp: "\u22A5",
    pertenk: "\u2031",
    Pfr: "\uD835\uDD13",
    pfr: "\uD835\uDD2D",
    Phi: "\u03A6",
    phi: "\u03C6",
    phiv: "\u03D5",
    phmmat: "\u2133",
    phone: "\u260E",
    Pi: "\u03A0",
    pi: "\u03C0",
    pitchfork: "\u22D4",
    piv: "\u03D6",
    planck: "\u210F",
    planckh: "\u210E",
    plankv: "\u210F",
    plusacir: "\u2A23",
    plusb: "\u229E",
    pluscir: "\u2A22",
    plus: "+",
    plusdo: "\u2214",
    plusdu: "\u2A25",
    pluse: "\u2A72",
    PlusMinus: "\xb1",
    plusmn: "\xb1",
    plussim: "\u2A26",
    plustwo: "\u2A27",
    pm: "\xb1",
    Poincareplane: "\u210C",
    pointint: "\u2A15",
    popf: "\uD835\uDD61",
    Popf: "\u2119",
    pound: "\xa3",
    prap: "\u2AB7",
    Pr: "\u2ABB",
    pr: "\u227A",
    prcue: "\u227C",
    precapprox: "\u2AB7",
    prec: "\u227A",
    preccurlyeq: "\u227C",
    Precedes: "\u227A",
    PrecedesEqual: "\u2AAF",
    PrecedesSlantEqual: "\u227C",
    PrecedesTilde: "\u227E",
    preceq: "\u2AAF",
    precnapprox: "\u2AB9",
    precneqq: "\u2AB5",
    precnsim: "\u22E8",
    pre: "\u2AAF",
    prE: "\u2AB3",
    precsim: "\u227E",
    prime: "\u2032",
    Prime: "\u2033",
    primes: "\u2119",
    prnap: "\u2AB9",
    prnE: "\u2AB5",
    prnsim: "\u22E8",
    prod: "\u220F",
    Product: "\u220F",
    profalar: "\u232E",
    profline: "\u2312",
    profsurf: "\u2313",
    prop: "\u221D",
    Proportional: "\u221D",
    Proportion: "\u2237",
    propto: "\u221D",
    prsim: "\u227E",
    prurel: "\u22B0",
    Pscr: "\uD835\uDCAB",
    pscr: "\uD835\uDCC5",
    Psi: "\u03A8",
    psi: "\u03C8",
    puncsp: "\u2008",
    Qfr: "\uD835\uDD14",
    qfr: "\uD835\uDD2E",
    qint: "\u2A0C",
    qopf: "\uD835\uDD62",
    Qopf: "\u211A",
    qprime: "\u2057",
    Qscr: "\uD835\uDCAC",
    qscr: "\uD835\uDCC6",
    quaternions: "\u210D",
    quatint: "\u2A16",
    quest: "?",
    questeq: "\u225F",
    quot: '"',
    QUOT: '"',
    rAarr: "\u21DB",
    race: "\u223D\u0331",
    Racute: "\u0154",
    racute: "\u0155",
    radic: "\u221A",
    raemptyv: "\u29B3",
    rang: "\u27E9",
    Rang: "\u27EB",
    rangd: "\u2992",
    range: "\u29A5",
    rangle: "\u27E9",
    raquo: "\xbb",
    rarrap: "\u2975",
    rarrb: "\u21E5",
    rarrbfs: "\u2920",
    rarrc: "\u2933",
    rarr: "\u2192",
    Rarr: "\u21A0",
    rArr: "\u21D2",
    rarrfs: "\u291E",
    rarrhk: "\u21AA",
    rarrlp: "\u21AC",
    rarrpl: "\u2945",
    rarrsim: "\u2974",
    Rarrtl: "\u2916",
    rarrtl: "\u21A3",
    rarrw: "\u219D",
    ratail: "\u291A",
    rAtail: "\u291C",
    ratio: "\u2236",
    rationals: "\u211A",
    rbarr: "\u290D",
    rBarr: "\u290F",
    RBarr: "\u2910",
    rbbrk: "\u2773",
    rbrace: "}",
    rbrack: "]",
    rbrke: "\u298C",
    rbrksld: "\u298E",
    rbrkslu: "\u2990",
    Rcaron: "\u0158",
    rcaron: "\u0159",
    Rcedil: "\u0156",
    rcedil: "\u0157",
    rceil: "\u2309",
    rcub: "}",
    Rcy: "\u0420",
    rcy: "\u0440",
    rdca: "\u2937",
    rdldhar: "\u2969",
    rdquo: "\u201D",
    rdquor: "\u201D",
    rdsh: "\u21B3",
    real: "\u211C",
    realine: "\u211B",
    realpart: "\u211C",
    reals: "\u211D",
    Re: "\u211C",
    rect: "\u25AD",
    reg: "\xae",
    REG: "\xae",
    ReverseElement: "\u220B",
    ReverseEquilibrium: "\u21CB",
    ReverseUpEquilibrium: "\u296F",
    rfisht: "\u297D",
    rfloor: "\u230B",
    rfr: "\uD835\uDD2F",
    Rfr: "\u211C",
    rHar: "\u2964",
    rhard: "\u21C1",
    rharu: "\u21C0",
    rharul: "\u296C",
    Rho: "\u03A1",
    rho: "\u03C1",
    rhov: "\u03F1",
    RightAngleBracket: "\u27E9",
    RightArrowBar: "\u21E5",
    rightarrow: "\u2192",
    RightArrow: "\u2192",
    Rightarrow: "\u21D2",
    RightArrowLeftArrow: "\u21C4",
    rightarrowtail: "\u21A3",
    RightCeiling: "\u2309",
    RightDoubleBracket: "\u27E7",
    RightDownTeeVector: "\u295D",
    RightDownVectorBar: "\u2955",
    RightDownVector: "\u21C2",
    RightFloor: "\u230B",
    rightharpoondown: "\u21C1",
    rightharpoonup: "\u21C0",
    rightleftarrows: "\u21C4",
    rightleftharpoons: "\u21CC",
    rightrightarrows: "\u21C9",
    rightsquigarrow: "\u219D",
    RightTeeArrow: "\u21A6",
    RightTee: "\u22A2",
    RightTeeVector: "\u295B",
    rightthreetimes: "\u22CC",
    RightTriangleBar: "\u29D0",
    RightTriangle: "\u22B3",
    RightTriangleEqual: "\u22B5",
    RightUpDownVector: "\u294F",
    RightUpTeeVector: "\u295C",
    RightUpVectorBar: "\u2954",
    RightUpVector: "\u21BE",
    RightVectorBar: "\u2953",
    RightVector: "\u21C0",
    ring: "\u02DA",
    risingdotseq: "\u2253",
    rlarr: "\u21C4",
    rlhar: "\u21CC",
    rlm: "\u200F",
    rmoustache: "\u23B1",
    rmoust: "\u23B1",
    rnmid: "\u2AEE",
    roang: "\u27ED",
    roarr: "\u21FE",
    robrk: "\u27E7",
    ropar: "\u2986",
    ropf: "\uD835\uDD63",
    Ropf: "\u211D",
    roplus: "\u2A2E",
    rotimes: "\u2A35",
    RoundImplies: "\u2970",
    rpar: ")",
    rpargt: "\u2994",
    rppolint: "\u2A12",
    rrarr: "\u21C9",
    Rrightarrow: "\u21DB",
    rsaquo: "\u203A",
    rscr: "\uD835\uDCC7",
    Rscr: "\u211B",
    rsh: "\u21B1",
    Rsh: "\u21B1",
    rsqb: "]",
    rsquo: "\u2019",
    rsquor: "\u2019",
    rthree: "\u22CC",
    rtimes: "\u22CA",
    rtri: "\u25B9",
    rtrie: "\u22B5",
    rtrif: "\u25B8",
    rtriltri: "\u29CE",
    RuleDelayed: "\u29F4",
    ruluhar: "\u2968",
    rx: "\u211E",
    Sacute: "\u015A",
    sacute: "\u015B",
    sbquo: "\u201A",
    scap: "\u2AB8",
    Scaron: "\u0160",
    scaron: "\u0161",
    Sc: "\u2ABC",
    sc: "\u227B",
    sccue: "\u227D",
    sce: "\u2AB0",
    scE: "\u2AB4",
    Scedil: "\u015E",
    scedil: "\u015F",
    Scirc: "\u015C",
    scirc: "\u015D",
    scnap: "\u2ABA",
    scnE: "\u2AB6",
    scnsim: "\u22E9",
    scpolint: "\u2A13",
    scsim: "\u227F",
    Scy: "\u0421",
    scy: "\u0441",
    sdotb: "\u22A1",
    sdot: "\u22C5",
    sdote: "\u2A66",
    searhk: "\u2925",
    searr: "\u2198",
    seArr: "\u21D8",
    searrow: "\u2198",
    sect: "\xa7",
    semi: ";",
    seswar: "\u2929",
    setminus: "\u2216",
    setmn: "\u2216",
    sext: "\u2736",
    Sfr: "\uD835\uDD16",
    sfr: "\uD835\uDD30",
    sfrown: "\u2322",
    sharp: "\u266F",
    SHCHcy: "\u0429",
    shchcy: "\u0449",
    SHcy: "\u0428",
    shcy: "\u0448",
    ShortDownArrow: "\u2193",
    ShortLeftArrow: "\u2190",
    shortmid: "\u2223",
    shortparallel: "\u2225",
    ShortRightArrow: "\u2192",
    ShortUpArrow: "\u2191",
    shy: "\xad",
    Sigma: "\u03A3",
    sigma: "\u03C3",
    sigmaf: "\u03C2",
    sigmav: "\u03C2",
    sim: "\u223C",
    simdot: "\u2A6A",
    sime: "\u2243",
    simeq: "\u2243",
    simg: "\u2A9E",
    simgE: "\u2AA0",
    siml: "\u2A9D",
    simlE: "\u2A9F",
    simne: "\u2246",
    simplus: "\u2A24",
    simrarr: "\u2972",
    slarr: "\u2190",
    SmallCircle: "\u2218",
    smallsetminus: "\u2216",
    smashp: "\u2A33",
    smeparsl: "\u29E4",
    smid: "\u2223",
    smile: "\u2323",
    smt: "\u2AAA",
    smte: "\u2AAC",
    smtes: "\u2AAC\uFE00",
    SOFTcy: "\u042C",
    softcy: "\u044C",
    solbar: "\u233F",
    solb: "\u29C4",
    sol: "/",
    Sopf: "\uD835\uDD4A",
    sopf: "\uD835\uDD64",
    spades: "\u2660",
    spadesuit: "\u2660",
    spar: "\u2225",
    sqcap: "\u2293",
    sqcaps: "\u2293\uFE00",
    sqcup: "\u2294",
    sqcups: "\u2294\uFE00",
    Sqrt: "\u221A",
    sqsub: "\u228F",
    sqsube: "\u2291",
    sqsubset: "\u228F",
    sqsubseteq: "\u2291",
    sqsup: "\u2290",
    sqsupe: "\u2292",
    sqsupset: "\u2290",
    sqsupseteq: "\u2292",
    square: "\u25A1",
    Square: "\u25A1",
    SquareIntersection: "\u2293",
    SquareSubset: "\u228F",
    SquareSubsetEqual: "\u2291",
    SquareSuperset: "\u2290",
    SquareSupersetEqual: "\u2292",
    SquareUnion: "\u2294",
    squarf: "\u25AA",
    squ: "\u25A1",
    squf: "\u25AA",
    srarr: "\u2192",
    Sscr: "\uD835\uDCAE",
    sscr: "\uD835\uDCC8",
    ssetmn: "\u2216",
    ssmile: "\u2323",
    sstarf: "\u22C6",
    Star: "\u22C6",
    star: "\u2606",
    starf: "\u2605",
    straightepsilon: "\u03F5",
    straightphi: "\u03D5",
    strns: "\xaf",
    sub: "\u2282",
    Sub: "\u22D0",
    subdot: "\u2ABD",
    subE: "\u2AC5",
    sube: "\u2286",
    subedot: "\u2AC3",
    submult: "\u2AC1",
    subnE: "\u2ACB",
    subne: "\u228A",
    subplus: "\u2ABF",
    subrarr: "\u2979",
    subset: "\u2282",
    Subset: "\u22D0",
    subseteq: "\u2286",
    subseteqq: "\u2AC5",
    SubsetEqual: "\u2286",
    subsetneq: "\u228A",
    subsetneqq: "\u2ACB",
    subsim: "\u2AC7",
    subsub: "\u2AD5",
    subsup: "\u2AD3",
    succapprox: "\u2AB8",
    succ: "\u227B",
    succcurlyeq: "\u227D",
    Succeeds: "\u227B",
    SucceedsEqual: "\u2AB0",
    SucceedsSlantEqual: "\u227D",
    SucceedsTilde: "\u227F",
    succeq: "\u2AB0",
    succnapprox: "\u2ABA",
    succneqq: "\u2AB6",
    succnsim: "\u22E9",
    succsim: "\u227F",
    SuchThat: "\u220B",
    sum: "\u2211",
    Sum: "\u2211",
    sung: "\u266A",
    sup1: "\xb9",
    sup2: "\xb2",
    sup3: "\xb3",
    sup: "\u2283",
    Sup: "\u22D1",
    supdot: "\u2ABE",
    supdsub: "\u2AD8",
    supE: "\u2AC6",
    supe: "\u2287",
    supedot: "\u2AC4",
    Superset: "\u2283",
    SupersetEqual: "\u2287",
    suphsol: "\u27C9",
    suphsub: "\u2AD7",
    suplarr: "\u297B",
    supmult: "\u2AC2",
    supnE: "\u2ACC",
    supne: "\u228B",
    supplus: "\u2AC0",
    supset: "\u2283",
    Supset: "\u22D1",
    supseteq: "\u2287",
    supseteqq: "\u2AC6",
    supsetneq: "\u228B",
    supsetneqq: "\u2ACC",
    supsim: "\u2AC8",
    supsub: "\u2AD4",
    supsup: "\u2AD6",
    swarhk: "\u2926",
    swarr: "\u2199",
    swArr: "\u21D9",
    swarrow: "\u2199",
    swnwar: "\u292A",
    szlig: "\xdf",
    Tab: "\t",
    target: "\u2316",
    Tau: "\u03A4",
    tau: "\u03C4",
    tbrk: "\u23B4",
    Tcaron: "\u0164",
    tcaron: "\u0165",
    Tcedil: "\u0162",
    tcedil: "\u0163",
    Tcy: "\u0422",
    tcy: "\u0442",
    tdot: "\u20DB",
    telrec: "\u2315",
    Tfr: "\uD835\uDD17",
    tfr: "\uD835\uDD31",
    there4: "\u2234",
    therefore: "\u2234",
    Therefore: "\u2234",
    Theta: "\u0398",
    theta: "\u03B8",
    thetasym: "\u03D1",
    thetav: "\u03D1",
    thickapprox: "\u2248",
    thicksim: "\u223C",
    ThickSpace: "\u205F\u200A",
    ThinSpace: "\u2009",
    thinsp: "\u2009",
    thkap: "\u2248",
    thksim: "\u223C",
    THORN: "\xde",
    thorn: "\xfe",
    tilde: "\u02DC",
    Tilde: "\u223C",
    TildeEqual: "\u2243",
    TildeFullEqual: "\u2245",
    TildeTilde: "\u2248",
    timesbar: "\u2A31",
    timesb: "\u22A0",
    times: "\xd7",
    timesd: "\u2A30",
    tint: "\u222D",
    toea: "\u2928",
    topbot: "\u2336",
    topcir: "\u2AF1",
    top: "\u22A4",
    Topf: "\uD835\uDD4B",
    topf: "\uD835\uDD65",
    topfork: "\u2ADA",
    tosa: "\u2929",
    tprime: "\u2034",
    trade: "\u2122",
    TRADE: "\u2122",
    triangle: "\u25B5",
    triangledown: "\u25BF",
    triangleleft: "\u25C3",
    trianglelefteq: "\u22B4",
    triangleq: "\u225C",
    triangleright: "\u25B9",
    trianglerighteq: "\u22B5",
    tridot: "\u25EC",
    trie: "\u225C",
    triminus: "\u2A3A",
    TripleDot: "\u20DB",
    triplus: "\u2A39",
    trisb: "\u29CD",
    tritime: "\u2A3B",
    trpezium: "\u23E2",
    Tscr: "\uD835\uDCAF",
    tscr: "\uD835\uDCC9",
    TScy: "\u0426",
    tscy: "\u0446",
    TSHcy: "\u040B",
    tshcy: "\u045B",
    Tstrok: "\u0166",
    tstrok: "\u0167",
    twixt: "\u226C",
    twoheadleftarrow: "\u219E",
    twoheadrightarrow: "\u21A0",
    Uacute: "\xda",
    uacute: "\xfa",
    uarr: "\u2191",
    Uarr: "\u219F",
    uArr: "\u21D1",
    Uarrocir: "\u2949",
    Ubrcy: "\u040E",
    ubrcy: "\u045E",
    Ubreve: "\u016C",
    ubreve: "\u016D",
    Ucirc: "\xdb",
    ucirc: "\xfb",
    Ucy: "\u0423",
    ucy: "\u0443",
    udarr: "\u21C5",
    Udblac: "\u0170",
    udblac: "\u0171",
    udhar: "\u296E",
    ufisht: "\u297E",
    Ufr: "\uD835\uDD18",
    ufr: "\uD835\uDD32",
    Ugrave: "\xd9",
    ugrave: "\xf9",
    uHar: "\u2963",
    uharl: "\u21BF",
    uharr: "\u21BE",
    uhblk: "\u2580",
    ulcorn: "\u231C",
    ulcorner: "\u231C",
    ulcrop: "\u230F",
    ultri: "\u25F8",
    Umacr: "\u016A",
    umacr: "\u016B",
    uml: "\xa8",
    UnderBar: "_",
    UnderBrace: "\u23DF",
    UnderBracket: "\u23B5",
    UnderParenthesis: "\u23DD",
    Union: "\u22C3",
    UnionPlus: "\u228E",
    Uogon: "\u0172",
    uogon: "\u0173",
    Uopf: "\uD835\uDD4C",
    uopf: "\uD835\uDD66",
    UpArrowBar: "\u2912",
    uparrow: "\u2191",
    UpArrow: "\u2191",
    Uparrow: "\u21D1",
    UpArrowDownArrow: "\u21C5",
    updownarrow: "\u2195",
    UpDownArrow: "\u2195",
    Updownarrow: "\u21D5",
    UpEquilibrium: "\u296E",
    upharpoonleft: "\u21BF",
    upharpoonright: "\u21BE",
    uplus: "\u228E",
    UpperLeftArrow: "\u2196",
    UpperRightArrow: "\u2197",
    upsi: "\u03C5",
    Upsi: "\u03D2",
    upsih: "\u03D2",
    Upsilon: "\u03A5",
    upsilon: "\u03C5",
    UpTeeArrow: "\u21A5",
    UpTee: "\u22A5",
    upuparrows: "\u21C8",
    urcorn: "\u231D",
    urcorner: "\u231D",
    urcrop: "\u230E",
    Uring: "\u016E",
    uring: "\u016F",
    urtri: "\u25F9",
    Uscr: "\uD835\uDCB0",
    uscr: "\uD835\uDCCA",
    utdot: "\u22F0",
    Utilde: "\u0168",
    utilde: "\u0169",
    utri: "\u25B5",
    utrif: "\u25B4",
    uuarr: "\u21C8",
    Uuml: "\xdc",
    uuml: "\xfc",
    uwangle: "\u29A7",
    vangrt: "\u299C",
    varepsilon: "\u03F5",
    varkappa: "\u03F0",
    varnothing: "\u2205",
    varphi: "\u03D5",
    varpi: "\u03D6",
    varpropto: "\u221D",
    varr: "\u2195",
    vArr: "\u21D5",
    varrho: "\u03F1",
    varsigma: "\u03C2",
    varsubsetneq: "\u228A\uFE00",
    varsubsetneqq: "\u2ACB\uFE00",
    varsupsetneq: "\u228B\uFE00",
    varsupsetneqq: "\u2ACC\uFE00",
    vartheta: "\u03D1",
    vartriangleleft: "\u22B2",
    vartriangleright: "\u22B3",
    vBar: "\u2AE8",
    Vbar: "\u2AEB",
    vBarv: "\u2AE9",
    Vcy: "\u0412",
    vcy: "\u0432",
    vdash: "\u22A2",
    vDash: "\u22A8",
    Vdash: "\u22A9",
    VDash: "\u22AB",
    Vdashl: "\u2AE6",
    veebar: "\u22BB",
    vee: "\u2228",
    Vee: "\u22C1",
    veeeq: "\u225A",
    vellip: "\u22EE",
    verbar: "|",
    Verbar: "\u2016",
    vert: "|",
    Vert: "\u2016",
    VerticalBar: "\u2223",
    VerticalLine: "|",
    VerticalSeparator: "\u2758",
    VerticalTilde: "\u2240",
    VeryThinSpace: "\u200A",
    Vfr: "\uD835\uDD19",
    vfr: "\uD835\uDD33",
    vltri: "\u22B2",
    vnsub: "\u2282\u20D2",
    vnsup: "\u2283\u20D2",
    Vopf: "\uD835\uDD4D",
    vopf: "\uD835\uDD67",
    vprop: "\u221D",
    vrtri: "\u22B3",
    Vscr: "\uD835\uDCB1",
    vscr: "\uD835\uDCCB",
    vsubnE: "\u2ACB\uFE00",
    vsubne: "\u228A\uFE00",
    vsupnE: "\u2ACC\uFE00",
    vsupne: "\u228B\uFE00",
    Vvdash: "\u22AA",
    vzigzag: "\u299A",
    Wcirc: "\u0174",
    wcirc: "\u0175",
    wedbar: "\u2A5F",
    wedge: "\u2227",
    Wedge: "\u22C0",
    wedgeq: "\u2259",
    weierp: "\u2118",
    Wfr: "\uD835\uDD1A",
    wfr: "\uD835\uDD34",
    Wopf: "\uD835\uDD4E",
    wopf: "\uD835\uDD68",
    wp: "\u2118",
    wr: "\u2240",
    wreath: "\u2240",
    Wscr: "\uD835\uDCB2",
    wscr: "\uD835\uDCCC",
    xcap: "\u22C2",
    xcirc: "\u25EF",
    xcup: "\u22C3",
    xdtri: "\u25BD",
    Xfr: "\uD835\uDD1B",
    xfr: "\uD835\uDD35",
    xharr: "\u27F7",
    xhArr: "\u27FA",
    Xi: "\u039E",
    xi: "\u03BE",
    xlarr: "\u27F5",
    xlArr: "\u27F8",
    xmap: "\u27FC",
    xnis: "\u22FB",
    xodot: "\u2A00",
    Xopf: "\uD835\uDD4F",
    xopf: "\uD835\uDD69",
    xoplus: "\u2A01",
    xotime: "\u2A02",
    xrarr: "\u27F6",
    xrArr: "\u27F9",
    Xscr: "\uD835\uDCB3",
    xscr: "\uD835\uDCCD",
    xsqcup: "\u2A06",
    xuplus: "\u2A04",
    xutri: "\u25B3",
    xvee: "\u22C1",
    xwedge: "\u22C0",
    Yacute: "\xdd",
    yacute: "\xfd",
    YAcy: "\u042F",
    yacy: "\u044F",
    Ycirc: "\u0176",
    ycirc: "\u0177",
    Ycy: "\u042B",
    ycy: "\u044B",
    yen: "\xa5",
    Yfr: "\uD835\uDD1C",
    yfr: "\uD835\uDD36",
    YIcy: "\u0407",
    yicy: "\u0457",
    Yopf: "\uD835\uDD50",
    yopf: "\uD835\uDD6A",
    Yscr: "\uD835\uDCB4",
    yscr: "\uD835\uDCCE",
    YUcy: "\u042E",
    yucy: "\u044E",
    yuml: "\xff",
    Yuml: "\u0178",
    Zacute: "\u0179",
    zacute: "\u017A",
    Zcaron: "\u017D",
    zcaron: "\u017E",
    Zcy: "\u0417",
    zcy: "\u0437",
    Zdot: "\u017B",
    zdot: "\u017C",
    zeetrf: "\u2128",
    ZeroWidthSpace: "\u200B",
    Zeta: "\u0396",
    zeta: "\u03B6",
    zfr: "\uD835\uDD37",
    Zfr: "\u2128",
    ZHcy: "\u0416",
    zhcy: "\u0436",
    zigrarr: "\u21DD",
    zopf: "\uD835\uDD6B",
    Zopf: "\u2124",
    Zscr: "\uD835\uDCB5",
    zscr: "\uD835\uDCCF",
    zwj: "\u200D",
    zwnj: "\u200C"
  }; // HTML5 entities map: { name -> utf16string }

  /*eslint quotes:0*/

  var entities = require$$0;
  var regex$4 = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4E\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDF55-\uDF59]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDF3C-\uDF3E]|\uD806[\uDC3B\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8]|\uD809[\uDC70-\uDC74]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;
  var encodeCache = {}; // Create a lookup array where anything but characters in `chars` string
  // and alphanumeric chars is percent-encoded.

  function getEncodeCache(exclude) {
    var i,
        ch,
        cache = encodeCache[exclude];

    if (cache) {
      return cache;
    }

    cache = encodeCache[exclude] = [];

    for (i = 0; i < 128; i++) {
      ch = String.fromCharCode(i);

      if (/^[0-9a-z]$/i.test(ch)) {
        // always allow unencoded alphanumeric characters
        cache.push(ch);
      } else {
        cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
      }
    }

    for (i = 0; i < exclude.length; i++) {
      cache[exclude.charCodeAt(i)] = exclude[i];
    }

    return cache;
  } // Encode unsafe characters with percent-encoding, skipping already
  // encoded sequences.
  //  - string       - string to encode
  //  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
  //  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)


  function encode$1(string, exclude, keepEscaped) {
    var i,
        l,
        code,
        nextCode,
        cache,
        result = "";

    if (typeof exclude !== "string") {
      // encode(string, keepEscaped)
      keepEscaped = exclude;
      exclude = encode$1.defaultChars;
    }

    if (typeof keepEscaped === "undefined") {
      keepEscaped = true;
    }

    cache = getEncodeCache(exclude);

    for (i = 0, l = string.length; i < l; i++) {
      code = string.charCodeAt(i);

      if (keepEscaped && code === 37
      /* % */
      && i + 2 < l) {
        if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
          result += string.slice(i, i + 3);
          i += 2;
          continue;
        }
      }

      if (code < 128) {
        result += cache[code];
        continue;
      }

      if (code >= 55296 && code <= 57343) {
        if (code >= 55296 && code <= 56319 && i + 1 < l) {
          nextCode = string.charCodeAt(i + 1);

          if (nextCode >= 56320 && nextCode <= 57343) {
            result += encodeURIComponent(string[i] + string[i + 1]);
            i++;
            continue;
          }
        }

        result += "%EF%BF%BD";
        continue;
      }

      result += encodeURIComponent(string[i]);
    }

    return result;
  }

  encode$1.defaultChars = ";/?:@&=+$,-_.!~*'()#";
  encode$1.componentChars = "-_.!~*'()";
  var encode_1 = encode$1;
  /* eslint-disable no-bitwise */

  var decodeCache = {};

  function getDecodeCache(exclude) {
    var i,
        ch,
        cache = decodeCache[exclude];

    if (cache) {
      return cache;
    }

    cache = decodeCache[exclude] = [];

    for (i = 0; i < 128; i++) {
      ch = String.fromCharCode(i);
      cache.push(ch);
    }

    for (i = 0; i < exclude.length; i++) {
      ch = exclude.charCodeAt(i);
      cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
    }

    return cache;
  } // Decode percent-encoded string.


  function decode$1(string, exclude) {
    var cache;

    if (typeof exclude !== "string") {
      exclude = decode$1.defaultChars;
    }

    cache = getDecodeCache(exclude);
    return string.replace(/(%[a-f0-9]{2})+/gi, function (seq) {
      var i,
          l,
          b1,
          b2,
          b3,
          b4,
          chr,
          result = "";

      for (i = 0, l = seq.length; i < l; i += 3) {
        b1 = parseInt(seq.slice(i + 1, i + 3), 16);

        if (b1 < 128) {
          result += cache[b1];
          continue;
        }

        if ((b1 & 224) === 192 && i + 3 < l) {
          // 110xxxxx 10xxxxxx
          b2 = parseInt(seq.slice(i + 4, i + 6), 16);

          if ((b2 & 192) === 128) {
            chr = b1 << 6 & 1984 | b2 & 63;

            if (chr < 128) {
              result += "\uFFFD\uFFFD";
            } else {
              result += String.fromCharCode(chr);
            }

            i += 3;
            continue;
          }
        }

        if ((b1 & 240) === 224 && i + 6 < l) {
          // 1110xxxx 10xxxxxx 10xxxxxx
          b2 = parseInt(seq.slice(i + 4, i + 6), 16);
          b3 = parseInt(seq.slice(i + 7, i + 9), 16);

          if ((b2 & 192) === 128 && (b3 & 192) === 128) {
            chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;

            if (chr < 2048 || chr >= 55296 && chr <= 57343) {
              result += "\uFFFD\uFFFD\uFFFD";
            } else {
              result += String.fromCharCode(chr);
            }

            i += 6;
            continue;
          }
        }

        if ((b1 & 248) === 240 && i + 9 < l) {
          // 111110xx 10xxxxxx 10xxxxxx 10xxxxxx
          b2 = parseInt(seq.slice(i + 4, i + 6), 16);
          b3 = parseInt(seq.slice(i + 7, i + 9), 16);
          b4 = parseInt(seq.slice(i + 10, i + 12), 16);

          if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
            chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;

            if (chr < 65536 || chr > 1114111) {
              result += "\uFFFD\uFFFD\uFFFD\uFFFD";
            } else {
              chr -= 65536;
              result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
            }

            i += 9;
            continue;
          }
        }

        result += "\uFFFD";
      }

      return result;
    });
  }

  decode$1.defaultChars = ";/?:@&=+$,#";
  decode$1.componentChars = "";
  var decode_1 = decode$1;

  var format$1 = function format(url) {
    var result = "";
    result += url.protocol || "";
    result += url.slashes ? "//" : "";
    result += url.auth ? url.auth + "@" : "";

    if (url.hostname && url.hostname.indexOf(":") !== -1) {
      // ipv6 address
      result += "[" + url.hostname + "]";
    } else {
      result += url.hostname || "";
    }

    result += url.port ? ":" + url.port : "";
    result += url.pathname || "";
    result += url.search || "";
    result += url.hash || "";
    return result;
  }; // Copyright Joyent, Inc. and other Node contributors.
  // Changes from joyent/node:
  // 1. No leading slash in paths,
  //    e.g. in `url.parse('http://foo?bar')` pathname is ``, not `/`
  // 2. Backslashes are not replaced with slashes,
  //    so `http:\\example.org\` is treated like a relative path
  // 3. Trailing colon is treated like a part of the path,
  //    i.e. in `http://example.org:foo` pathname is `:foo`
  // 4. Nothing is URL-encoded in the resulting object,
  //    (in joyent/node some chars in auth and paths are encoded)
  // 5. `url.parse()` does not have `parseQueryString` argument
  // 6. Removed extraneous result properties: `host`, `path`, `query`, etc.,
  //    which can be constructed using other parts of the url.


  function Url() {
    this.protocol = null;
    this.slashes = null;
    this.auth = null;
    this.port = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.pathname = null;
  } // Reference: RFC 3986, RFC 1808, RFC 2396
  // define these here so at least they only have to be
  // compiled once on the first module load.


  var protocolPattern = /^([a-z0-9.+-]+:)/i,
      portPattern = /:[0-9]*$/,
      // Special case for a simple path URL
  simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,
      // RFC 2396: characters reserved for delimiting URLs.
  // We actually just auto-escape these.
  delims = ["<", ">", '"', "`", " ", "\r", "\n", "\t"],
      // RFC 2396: characters not allowed for various reasons.
  unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims),
      // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
  autoEscape = ["'"].concat(unwise),
      // Characters that are never ever allowed in a hostname.
  // Note that any invalid chars are also handled, but these
  // are the ones that are *expected* to be seen, so we fast-path
  // them.
  nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape),
      hostEndingChars = ["/", "?", "#"],
      hostnameMaxLen = 255,
      hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
      hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
      // protocols that can allow "unsafe" and "unwise" chars.

  /* eslint-disable no-script-url */
  // protocols that never have a hostname.
  hostlessProtocol = {
    javascript: true,
    "javascript:": true
  },
      // protocols that always contain a // bit.
  slashedProtocol = {
    http: true,
    https: true,
    ftp: true,
    gopher: true,
    file: true,
    "http:": true,
    "https:": true,
    "ftp:": true,
    "gopher:": true,
    "file:": true
  };
  /* eslint-enable no-script-url */

  function urlParse(url, slashesDenoteHost) {
    if (url && url instanceof Url) {
      return url;
    }

    var u = new Url();
    u.parse(url, slashesDenoteHost);
    return u;
  }

  Url.prototype.parse = function (url, slashesDenoteHost) {
    var i,
        l,
        lowerProto,
        hec,
        slashes,
        rest = url; // trim before proceeding.
    // This is to support parse stuff like "  http://foo.com  \n"

    rest = rest.trim();

    if (!slashesDenoteHost && url.split("#").length === 1) {
      // Try fast path regexp
      var simplePath = simplePathPattern.exec(rest);

      if (simplePath) {
        this.pathname = simplePath[1];

        if (simplePath[2]) {
          this.search = simplePath[2];
        }

        return this;
      }
    }

    var proto = protocolPattern.exec(rest);

    if (proto) {
      proto = proto[0];
      lowerProto = proto.toLowerCase();
      this.protocol = proto;
      rest = rest.substr(proto.length);
    } // figure out if it's got a host
    // user@server is *always* interpreted as a hostname, and url
    // resolution will treat //foo/bar as host=foo,path=bar because that's
    // how the browser resolves relative URLs.


    if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
      slashes = rest.substr(0, 2) === "//";

      if (slashes && !(proto && hostlessProtocol[proto])) {
        rest = rest.substr(2);
        this.slashes = true;
      }
    }

    if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
      // there's a hostname.
      // the first instance of /, ?, ;, or # ends the host.
      // If there is an @ in the hostname, then non-host chars *are* allowed
      // to the left of the last @ sign, unless some host-ending character
      // comes *before* the @-sign.
      // URLs are obnoxious.
      // ex:
      // http://a@b@c/ => user:a@b host:c
      // http://a@b?@c => user:a host:c path:/?@c
      // v0.12 TODO(isaacs): This is not quite how Chrome does things.
      // Review our test case against browsers more comprehensively.
      // find the first instance of any hostEndingChars
      var hostEnd = -1;

      for (i = 0; i < hostEndingChars.length; i++) {
        hec = rest.indexOf(hostEndingChars[i]);

        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
          hostEnd = hec;
        }
      } // at this point, either we have an explicit point where the
      // auth portion cannot go past, or the last @ char is the decider.


      var auth, atSign;

      if (hostEnd === -1) {
        // atSign can be anywhere.
        atSign = rest.lastIndexOf("@");
      } else {
        // atSign must be in auth portion.
        // http://a@b/c@d => host:b auth:a path:/c@d
        atSign = rest.lastIndexOf("@", hostEnd);
      } // Now we have a portion which is definitely the auth.
      // Pull that off.


      if (atSign !== -1) {
        auth = rest.slice(0, atSign);
        rest = rest.slice(atSign + 1);
        this.auth = auth;
      } // the host is the remaining to the left of the first non-host char


      hostEnd = -1;

      for (i = 0; i < nonHostChars.length; i++) {
        hec = rest.indexOf(nonHostChars[i]);

        if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
          hostEnd = hec;
        }
      } // if we still have not hit it, then the entire thing is a host.


      if (hostEnd === -1) {
        hostEnd = rest.length;
      }

      if (rest[hostEnd - 1] === ":") {
        hostEnd--;
      }

      var host = rest.slice(0, hostEnd);
      rest = rest.slice(hostEnd); // pull out port.

      this.parseHost(host); // we've indicated that there is a hostname,
      // so even if it's empty, it has to be present.

      this.hostname = this.hostname || ""; // if hostname begins with [ and ends with ]
      // assume that it's an IPv6 address.

      var ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]"; // validate a little.

      if (!ipv6Hostname) {
        var hostparts = this.hostname.split(/\./);

        for (i = 0, l = hostparts.length; i < l; i++) {
          var part = hostparts[i];

          if (!part) {
            continue;
          }

          if (!part.match(hostnamePartPattern)) {
            var newpart = "";

            for (var j = 0, k = part.length; j < k; j++) {
              if (part.charCodeAt(j) > 127) {
                // we replace non-ASCII char with a temporary placeholder
                // we need this to make sure size of hostname is not
                // broken by replacing non-ASCII by nothing
                newpart += "x";
              } else {
                newpart += part[j];
              }
            } // we test again with ASCII char only


            if (!newpart.match(hostnamePartPattern)) {
              var validParts = hostparts.slice(0, i);
              var notHost = hostparts.slice(i + 1);
              var bit = part.match(hostnamePartStart);

              if (bit) {
                validParts.push(bit[1]);
                notHost.unshift(bit[2]);
              }

              if (notHost.length) {
                rest = notHost.join(".") + rest;
              }

              this.hostname = validParts.join(".");
              break;
            }
          }
        }
      }

      if (this.hostname.length > hostnameMaxLen) {
        this.hostname = "";
      } // strip [ and ] from the hostname
      // the host field still retains them, though


      if (ipv6Hostname) {
        this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      }
    } // chop off from the tail first.


    var hash = rest.indexOf("#");

    if (hash !== -1) {
      // got a fragment string.
      this.hash = rest.substr(hash);
      rest = rest.slice(0, hash);
    }

    var qm = rest.indexOf("?");

    if (qm !== -1) {
      this.search = rest.substr(qm);
      rest = rest.slice(0, qm);
    }

    if (rest) {
      this.pathname = rest;
    }

    if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
      this.pathname = "";
    }

    return this;
  };

  Url.prototype.parseHost = function (host) {
    var port = portPattern.exec(host);

    if (port) {
      port = port[0];

      if (port !== ":") {
        this.port = port.substr(1);
      }

      host = host.substr(0, host.length - port.length);
    }

    if (host) {
      this.hostname = host;
    }
  };

  var parse$1 = urlParse;
  var encode$2 = encode_1;
  var decode$2 = decode_1;
  var format = format$1;
  var parse = parse$1;
  var mdurl = {
    encode: encode$2,
    decode: decode$2,
    format: format,
    parse: parse
  };
  var regex$3 = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var regex$2 = /[\0-\x1F\x7F-\x9F]/;
  var regex$1 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;
  var regex = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
  var Any = regex$3;
  var Cc = regex$2;
  var Cf = regex$1;
  var P = regex$4;
  var Z = regex;
  var uc_micro = {
    Any: Any,
    Cc: Cc,
    Cf: Cf,
    P: P,
    Z: Z
  };
  var utils = createCommonjsModule(function (module, exports) {
    // Utilities
    function isNil(v) {
      return v === null || typeof v === "undefined";
    }

    function _class(obj) {
      return Object.prototype.toString.call(obj);
    }

    function isString(obj) {
      return _class(obj) === "[object String]";
    }

    var _hasOwnProperty = Object.prototype.hasOwnProperty;

    function has(object, key) {
      return _hasOwnProperty.call(object, key);
    } // Merge objects


    function assign(obj
    /*from1, from2, from3, ...*/
    ) {
      var sources = Array.prototype.slice.call(arguments, 1);
      sources.forEach(function (source) {
        if (!source) {
          return;
        }

        if (typeof source !== "object") {
          throw new TypeError(source + "must be object");
        }

        Object.keys(source).forEach(function (key) {
          obj[key] = source[key];
        });
      });
      return obj;
    } // Remove element from array and put another array at those position.
    // Useful for some operations with tokens


    function arrayReplaceAt(src, pos, newElements) {
      return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
    } ////////////////////////////////////////////////////////////////////////////////


    function isValidEntityCode(c) {
      /*eslint no-bitwise:0*/
      // broken sequence
      if (c >= 55296 && c <= 57343) {
        return false;
      } // never used


      if (c >= 64976 && c <= 65007) {
        return false;
      }

      if ((c & 65535) === 65535 || (c & 65535) === 65534) {
        return false;
      } // control codes


      if (c >= 0 && c <= 8) {
        return false;
      }

      if (c === 11) {
        return false;
      }

      if (c >= 14 && c <= 31) {
        return false;
      }

      if (c >= 127 && c <= 159) {
        return false;
      } // out of range


      if (c > 1114111) {
        return false;
      }

      return true;
    }

    function fromCodePoint(c) {
      /*eslint no-bitwise:0*/
      if (c > 65535) {
        c -= 65536;
        var surrogate1 = 55296 + (c >> 10),
            surrogate2 = 56320 + (c & 1023);
        return String.fromCharCode(surrogate1, surrogate2);
      }

      return String.fromCharCode(c);
    }

    var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~])/g;
    var ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
    var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + "|" + ENTITY_RE.source, "gi");
    var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;

    function replaceEntityPattern(match, name) {
      var code = 0;

      if (has(entities, name)) {
        return entities[name];
      }

      if (name.charCodeAt(0) === 35
      /* # */
      && DIGITAL_ENTITY_TEST_RE.test(name)) {
        code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);

        if (isValidEntityCode(code)) {
          return fromCodePoint(code);
        }
      }

      return match;
    }
    /*function replaceEntities(str) {
    if (str.indexOf('&') < 0) { return str; }
     return str.replace(ENTITY_RE, replaceEntityPattern);
    }*/


    function unescapeMd(str) {
      if (str.indexOf("\\") < 0) {
        return str;
      }

      return str.replace(UNESCAPE_MD_RE, "$1");
    }

    function unescapeAll(str) {
      if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) {
        return str;
      }

      return str.replace(UNESCAPE_ALL_RE, function (match, escaped, entity) {
        if (escaped) {
          return escaped;
        }

        return replaceEntityPattern(match, entity);
      });
    } ////////////////////////////////////////////////////////////////////////////////


    var HTML_ESCAPE_TEST_RE = /[&<>"]/;
    var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
    var HTML_REPLACEMENTS = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
      "`": "&#096;"
    };

    function replaceUnsafeChar(ch) {
      return HTML_REPLACEMENTS[ch];
    }

    function escapeHtml(str) {
      if (HTML_ESCAPE_TEST_RE.test(str)) {
        return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
      }

      return str;
    } ////////////////////////////////////////////////////////////////////////////////


    var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;

    function escapeRE(str) {
      return str.replace(REGEXP_ESCAPE_RE, "\\$&");
    } ////////////////////////////////////////////////////////////////////////////////


    function isSpace(code) {
      switch (code) {
        case 9:
        case 32:
          return true;
      }

      return false;
    } // Zs (unicode class) || [\t\f\v\r\n]


    function isWhiteSpace(code) {
      if (code >= 8192 && code <= 8202) {
        return true;
      }

      switch (code) {
        case 9: // \t

        case 10: // \n

        case 11: // \v

        case 12: // \f

        case 13: // \r

        case 32:
        case 160:
        case 5760:
        case 8239:
        case 8287:
        case 12288:
          return true;
      }

      return false;
    } ////////////////////////////////////////////////////////////////////////////////

    /*eslint-disable max-len*/
    // Currently without astral characters support.


    function isPunctChar(ch) {
      return regex$4.test(ch);
    } // Markdown ASCII punctuation characters.
    // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
    // http://spec.commonmark.org/0.15/#ascii-punctuation-character
    // Don't confuse with unicode punctuation !!! It lacks some chars in ascii range.


    function isMdAsciiPunct(ch) {
      switch (ch) {
        case 33
        /* ! */
        :
        case 34
        /* " */
        :
        case 35
        /* # */
        :
        case 36
        /* $ */
        :
        case 37
        /* % */
        :
        case 38
        /* & */
        :
        case 39
        /* ' */
        :
        case 40
        /* ( */
        :
        case 41
        /* ) */
        :
        case 42
        /* * */
        :
        case 43
        /* + */
        :
        case 44
        /* , */
        :
        case 45
        /* - */
        :
        case 46
        /* . */
        :
        case 47
        /* / */
        :
        case 58
        /* : */
        :
        case 59
        /* ; */
        :
        case 60
        /* < */
        :
        case 61
        /* = */
        :
        case 62
        /* > */
        :
        case 63
        /* ? */
        :
        case 64
        /* @ */
        :
        case 91
        /* [ */
        :
        case 92
        /* \ */
        :
        case 93
        /* ] */
        :
        case 94
        /* ^ */
        :
        case 95
        /* _ */
        :
        case 96
        /* ` */
        :
        case 123
        /* { */
        :
        case 124
        /* | */
        :
        case 125
        /* } */
        :
        case 126
        /* ~ */
        :
          return true;

        default:
          return false;
      }
    } // Helper to unify [reference labels].


    function normalizeReference(str) {
      // Trim and collapse whitespace
      str = str.trim().replace(/\s+/g, " "); // In node v10 'ẞ'.toLowerCase() === 'Ṿ', which is presumed to be a bug
      // fixed in v12 (couldn't find any details).
      // So treat this one as a special case
      // TODO: remove this when node v10 is no longer supported.

      if ("\u1E9E".toLowerCase() === "\u1E7E") {
        str = str.replace(/\u1e9e/g, "\xdf");
      } // .toLowerCase().toUpperCase() should get rid of all differences
      // between letter variants.
      // Simple .toLowerCase() doesn't normalize 125 code points correctly,
      // and .toUpperCase doesn't normalize 6 of them (list of exceptions:
      // İ, ϴ, ẞ, Ω, K, Å - those are already uppercased, but have differently
      // uppercased versions).
      // Here's an example showing how it happens. Lets take greek letter omega:
      // uppercase U+0398 (Θ), U+03f4 (ϴ) and lowercase U+03b8 (θ), U+03d1 (ϑ)
      // Unicode entries:
      // 0398;GREEK CAPITAL LETTER THETA;Lu;0;L;;;;;N;;;;03B8;
      // 03B8;GREEK SMALL LETTER THETA;Ll;0;L;;;;;N;;;0398;;0398
      // 03D1;GREEK THETA SYMBOL;Ll;0;L;<compat> 03B8;;;;N;GREEK SMALL LETTER SCRIPT THETA;;0398;;0398
      // 03F4;GREEK CAPITAL THETA SYMBOL;Lu;0;L;<compat> 0398;;;;N;;;;03B8;
      // Case-insensitive comparison should treat all of them as equivalent.
      // But .toLowerCase() doesn't change ϑ (it's already lowercase),
      // and .toUpperCase() doesn't change ϴ (already uppercase).
      // Applying first lower then upper case normalizes any character:
      // '\u0398\u03f4\u03b8\u03d1'.toLowerCase().toUpperCase() === '\u0398\u0398\u0398\u0398'
      // Note: this is equivalent to unicode case folding; unicode normalization
      // is a different step that is not required here.
      // Final result should be uppercased, because it's later stored in an object
      // (this avoid a conflict with Object.prototype members,
      // most notably, `__proto__`)


      return str.toLowerCase().toUpperCase();
    }

    function getLineOffset(state, tokenIdx) {
      var blockState = state.env.state_block;
      var parentToken = state.env.parentToken;
      var tokensBefore = typeof tokenIdx !== "undefined" ? state.tokens.slice(0, tokenIdx) : state.tokens;
      var lineOffset = 0;
      var linesBefore = tokensBefore.filter(function (t) {
        return t.type.includes("break");
      }).length;

      for (var i = 0; i < linesBefore; i++) {
        var startLine = i + parentToken.map[0] + 1;
        lineOffset += blockState.tShift[startLine];
      }

      return lineOffset;
    }

    function trimLeftOffset(str) {
      return str.length - str.trimLeft().length;
    } ////////////////////////////////////////////////////////////////////////////////
    // Re-export libraries commonly used in both markdown-it and its plugins,
    // so plugins won't have to depend on them explicitly, which reduces their
    // bundled size (e.g. a browser build).


    exports.lib = {};
    exports.lib.mdurl = mdurl;
    exports.lib.ucmicro = uc_micro;
    exports.isNil = isNil;
    exports.assign = assign;
    exports.isString = isString;
    exports.has = has;
    exports.unescapeMd = unescapeMd;
    exports.unescapeAll = unescapeAll;
    exports.isValidEntityCode = isValidEntityCode;
    exports.fromCodePoint = fromCodePoint; // exports.replaceEntities     = replaceEntities;

    exports.escapeHtml = escapeHtml;
    exports.arrayReplaceAt = arrayReplaceAt;
    exports.isSpace = isSpace;
    exports.isWhiteSpace = isWhiteSpace;
    exports.isMdAsciiPunct = isMdAsciiPunct;
    exports.isPunctChar = isPunctChar;
    exports.escapeRE = escapeRE;
    exports.normalizeReference = normalizeReference;
    exports.getLineOffset = getLineOffset;
    exports.trimLeftOffset = trimLeftOffset;
  }); // Parse link label
  // this function assumes that first character ("[") already matches;
  // returns the end of the label

  var parse_link_label = function parseLinkLabel(state, start, disableNested) {
    var level,
        found,
        marker,
        prevPos,
        labelEnd = -1,
        max = state.posMax,
        oldPos = state.pos;
    state.pos = start + 1;
    level = 1;

    while (state.pos < max) {
      marker = state.src.charCodeAt(state.pos);

      if (marker === 93
      /* ] */
      ) {
          level--;

          if (level === 0) {
            found = true;
            break;
          }
        }

      prevPos = state.pos;
      state.md.inline.skipToken(state);

      if (marker === 91
      /* [ */
      ) {
          if (prevPos === state.pos - 1) {
            // increase level if we find text `[`, which is not a part of any token
            level++;
          } else if (disableNested) {
            state.pos = oldPos;
            return -1;
          }
        }
    }

    if (found) {
      labelEnd = state.pos;
    } // restore old state


    state.pos = oldPos;
    return labelEnd;
  }; // Parse link destination


  var unescapeAll$2 = utils.unescapeAll;

  var parse_link_destination = function parseLinkDestination(str, pos, max) {
    var code,
        level,
        lines = 0,
        start = pos,
        result = {
      ok: false,
      pos: 0,
      lines: 0,
      str: ""
    };

    if (str.charCodeAt(pos) === 60
    /* < */
    ) {
        pos++;

        while (pos < max) {
          code = str.charCodeAt(pos);

          if (code === 10
          /* \n */
          ) {
              return result;
            }

          if (code === 60
          /* < */
          ) {
              return result;
            }

          if (code === 62
          /* > */
          ) {
              result.pos = pos + 1;
              result.str = unescapeAll$2(str.slice(start + 1, pos));
              result.ok = true;
              return result;
            }

          if (code === 92
          /* \ */
          && pos + 1 < max) {
            pos += 2;
            continue;
          }

          pos++;
        } // no closing '>'


        return result;
      } // this should be ... } else { ... branch


    level = 0;

    while (pos < max) {
      code = str.charCodeAt(pos);

      if (code === 32) {
        break;
      } // ascii control characters


      if (code < 32 || code === 127) {
        break;
      }

      if (code === 92
      /* \ */
      && pos + 1 < max) {
        if (str.charCodeAt(pos + 1) === 32) {
          break;
        }

        pos += 2;
        continue;
      }

      if (code === 40
      /* ( */
      ) {
          level++;

          if (level > 32) {
            return result;
          }
        }

      if (code === 41
      /* ) */
      ) {
          if (level === 0) {
            break;
          }

          level--;
        }

      pos++;
    }

    if (start === pos) {
      return result;
    }

    if (level !== 0) {
      return result;
    }

    result.str = unescapeAll$2(str.slice(start, pos));
    result.lines = lines;
    result.pos = pos;
    result.ok = true;
    return result;
  }; // Parse link title


  var unescapeAll$1 = utils.unescapeAll;

  var parse_link_title = function parseLinkTitle(str, pos, max) {
    var code,
        marker,
        lines = 0,
        start = pos,
        result = {
      ok: false,
      pos: 0,
      lines: 0,
      str: ""
    };

    if (pos >= max) {
      return result;
    }

    marker = str.charCodeAt(pos);

    if (marker !== 34
    /* " */
    && marker !== 39
    /* ' */
    && marker !== 40
    /* ( */
    ) {
        return result;
      }

    pos++; // if opening marker is "(", switch it to closing marker ")"

    if (marker === 40) {
      marker = 41;
    }

    while (pos < max) {
      code = str.charCodeAt(pos);

      if (code === marker) {
        result.pos = pos + 1;
        result.lines = lines;
        result.str = unescapeAll$1(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      } else if (code === 40
      /* ( */
      && marker === 41
      /* ) */
      ) {
          return result;
        } else if (code === 10) {
        lines++;
      } else if (code === 92
      /* \ */
      && pos + 1 < max) {
        pos++;

        if (str.charCodeAt(pos) === 10) {
          lines++;
        }
      }

      pos++;
    }

    return result;
  }; // Just a shortcut for bulk export


  var parseLinkLabel = parse_link_label;
  var parseLinkDestination = parse_link_destination;
  var parseLinkTitle = parse_link_title;
  var helpers = {
    parseLinkLabel: parseLinkLabel,
    parseLinkDestination: parseLinkDestination,
    parseLinkTitle: parseLinkTitle
  };
  /**
   * class Renderer
   *
   * Generates HTML from parsed token stream. Each instance has independent
   * copy of rules. Those can be rewritten with ease. Also, you can add new
   * rules if you create plugin and adds new token types.
   **/

  var assign$1 = utils.assign;
  var unescapeAll = utils.unescapeAll;
  var escapeHtml = utils.escapeHtml;
  var isNil = utils.isNil; ////////////////////////////////////////////////////////////////////////////////

  var default_rules = {};

  default_rules.code_inline = function (tokens, idx, options, env, slf) {
    var token = tokens[idx];
    return "<code" + slf.renderAttrs(token) + ">" + escapeHtml(tokens[idx].content) + "</code>";
  };

  default_rules.code_block = function (tokens, idx, options, env, slf) {
    var token = tokens[idx];
    return "<pre" + slf.renderAttrs(token) + "><code>" + escapeHtml(tokens[idx].content) + "</code></pre>\n";
  };

  default_rules.fence = function (tokens, idx, options, env, slf) {
    var token = tokens[idx],
        info = token.info ? unescapeAll(token.info).trim() : "",
        langName = "",
        langAttrs = [],
        highlighted,
        i,
        arr,
        tmpAttrs,
        tmpToken;

    if (info) {
      arr = info.split(/\s+/g);
      langName = arr[0];
      langAttrs = arr.slice(1);
    }

    if (options.highlight) {
      highlighted = options.highlight(token.content, langName, [].concat(token.attrs || [], langAttrs)) || escapeHtml(token.content);
    } else {
      highlighted = escapeHtml(token.content);
    }

    if (highlighted.indexOf("<pre") === 0) {
      return highlighted + "\n";
    } // If language exists, inject class gently, without modifying original token.
    // May be, one day we will add .deepClone() for token and simplify this part, but
    // now we prefer to keep things local.


    if (info) {
      i = token.attrIndex("class");
      tmpAttrs = token.attrs ? token.attrs.slice() : [];

      if (i < 0) {
        tmpAttrs.push(["class", options.langPrefix + langName]);
      } else {
        tmpAttrs[i] = tmpAttrs[i].slice();
        tmpAttrs[i][1] += " " + options.langPrefix + langName;
      } // Fake token just to render attributes


      tmpToken = {
        attrs: tmpAttrs
      };
      return "<pre><code" + slf.renderAttrs(tmpToken) + ">" + highlighted + "</code></pre>\n";
    }

    return "<pre><code" + slf.renderAttrs(token, options) + ">" + highlighted + "</code></pre>\n";
  };

  default_rules.image = function (tokens, idx, options, env, slf) {
    var token = tokens[idx]; // "alt" attr MUST be set, even if empty. Because it's mandatory and
    // should be placed on proper position for tests.
    // Replace content with actual value

    token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
    return slf.renderToken(tokens, idx, options);
  };

  default_rules.hardbreak = function (tokens, idx, options
  /*, env */
  ) {
    return options.xhtmlOut ? "<br />\n" : "<br>\n";
  };

  default_rules.softbreak = function (tokens, idx, options
  /*, env */
  ) {
    return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
  };

  default_rules.text = function (tokens, idx
  /*, options, env */
  ) {
    return escapeHtml(tokens[idx].content);
  };

  default_rules.html_block = function (tokens, idx
  /*, options, env */
  ) {
    return tokens[idx].content;
  };

  default_rules.html_inline = function (tokens, idx
  /*, options, env */
  ) {
    return tokens[idx].content;
  };
  /**
   * new Renderer()
   *
   * Creates new [[Renderer]] instance and fill [[Renderer#rules]] with defaults.
   **/


  function Renderer() {
    /**
     * Renderer#rules -> Object
     *
     * Contains render rules for tokens. Can be updated and extended.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * md.renderer.rules.strong_open  = function () { return '<b>'; };
     * md.renderer.rules.strong_close = function () { return '</b>'; };
     *
     * var result = md.renderInline(...);
     * ```
     *
     * Each rule is called as independent static function with fixed signature:
     *
     * ```javascript
     * function my_token_render(tokens, idx, options, env, renderer) {
     *   // ...
     *   return renderedHTML;
     * }
     * ```
     *
     * See [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js)
     * for more details and examples.
     **/
    this.rules = assign$1({}, default_rules);
  }
  /**
   * Renderer.renderAttrs(token) -> String
   *
   * Render token attributes to string.
   **/


  Renderer.prototype.renderAttrs = function renderAttrs(token, options) {
    var i, l, result;

    if (options && options.default_attributes && options.default_attributes[token.tag]) {
      token.attrs = (token.attrs || []).concat(options.default_attributes[token.tag]);
    }

    if (!token.attrs) {
      return "";
    }

    result = "";

    for (i = 0, l = token.attrs.length; i < l; i++) {
      var value = token.attrs[i][1];
      result += " " + escapeHtml(token.attrs[i][0]) + (isNil(value) ? "" : '="' + escapeHtml(value) + '"');
    }

    return result;
  };
  /**
   * Renderer.renderToken(tokens, idx, options) -> String
   * - tokens (Array): list of tokens
   * - idx (Numbed): token index to render
   * - options (Object): params of parser instance
   *
   * Default token renderer. Can be overriden by custom function
   * in [[Renderer#rules]].
   **/


  Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
    var nextToken,
        result = "",
        needLf = false,
        token = tokens[idx]; // Tight list paragraphs

    if (token.hidden) {
      return "";
    } // Insert a newline between hidden paragraph and subsequent opening
    // block-level tag.
    // For example, here we should insert a newline before blockquote:
    //  - a
    //    >


    if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
      result += "\n";
    } // Add token name, e.g. `<img`


    result += (token.nesting === -1 ? "</" : "<") + token.tag; // Encode attributes, e.g. `<img src="foo"`

    result += this.renderAttrs(token, options); // Add a slash for self-closing tags, e.g. `<img src="foo" /`

    if (token.nesting === 0 && options.xhtmlOut) {
      result += " /";
    } // Check if we need to add a newline after this tag


    if (token.block) {
      needLf = true;

      if (token.nesting === 1) {
        if (idx + 1 < tokens.length) {
          nextToken = tokens[idx + 1];

          if (nextToken.type === "inline" || nextToken.hidden) {
            // Block-level tag containing an inline tag.
            needLf = false;
          } else if (nextToken.tag === "blockquote" && nextToken.tag === token.tag) ;else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
            // Opening tag + closing tag of the same type. E.g. `<li></li>`.
            needLf = false;
          }
        }
      }
    }

    result += needLf ? ">\n" : ">";
    return result;
  };
  /**
   * Renderer.renderInline(tokens, options, env) -> String
   * - tokens (Array): list on block tokens to renter
   * - options (Object): params of parser instance
   * - env (Object): additional data from parsed input (references, for example)
   *
   * The same as [[Renderer.render]], but for single token of `inline` type.
   **/


  Renderer.prototype.renderInline = function (tokens, options, env) {
    var type,
        result = "",
        rules = this.rules;

    if (tokens) {
      for (var i = 0, len = tokens.length; i < len; i++) {
        type = tokens[i].type;

        if (typeof rules[type] !== "undefined") {
          result += rules[type](tokens, i, options, env, this);
        } else {
          result += this.renderToken(tokens, i, options);
        }
      }
    }

    return result;
  };
  /** internal
   * Renderer.renderInlineAsText(tokens, options, env) -> String
   * - tokens (Array): list on block tokens to renter
   * - options (Object): params of parser instance
   * - env (Object): additional data from parsed input (references, for example)
   *
   * Special kludge for image `alt` attributes to conform CommonMark spec.
   * Don't try to use it! Spec requires to show `alt` content with stripped markup,
   * instead of simple escaping.
   **/


  Renderer.prototype.renderInlineAsText = function (tokens, options, env) {
    var result = "";

    if (tokens) {
      for (var i = 0, len = tokens.length; i < len; i++) {
        if (tokens[i].type === "text") {
          result += tokens[i].content;
        } else if (tokens[i].type === "image") {
          result += this.renderInlineAsText(tokens[i].children, options, env);
        }
      }
    }

    return result;
  };
  /**
   * Renderer.render(tokens, options, env) -> String
   * - tokens (Array): list on block tokens to renter
   * - options (Object): params of parser instance
   * - env (Object): additional data from parsed input (references, for example)
   *
   * Takes token stream and generates HTML. Probably, you will never need to call
   * this method directly.
   **/


  Renderer.prototype.render = function (tokens, options, env) {
    if (options.ast) return tokens;
    var i,
        len,
        type,
        result = "",
        rules = this.rules;

    for (i = 0, len = tokens.length; i < len; i++) {
      type = tokens[i].type;

      if (type === "inline") {
        result += this.renderInline(tokens[i].children, options, env);
      } else if (typeof rules[type] !== "undefined") {
        result += rules[tokens[i].type](tokens, i, options, env, this);
      } else {
        result += this.renderToken(tokens, i, options, env);
      }
    }

    return result;
  };

  var renderer = Renderer;
  /**
   * class Ruler
   *
   * Helper class, used by [[MarkdownIt#core]], [[MarkdownIt#block]] and
   * [[MarkdownIt#inline]] to manage sequences of functions (rules):
   *
   * - keep rules in defined order
   * - assign the name to each rule
   * - enable/disable rules
   * - add/replace rules
   * - allow assign rules to additional named chains (in the same)
   * - cacheing lists of active rules
   *
   * You will not need use this class directly until write plugins. For simple
   * rules control use [[MarkdownIt.disable]], [[MarkdownIt.enable]] and
   * [[MarkdownIt.use]].
   **/

  /**
   * new Ruler()
   **/

  function Ruler() {
    // List of added rules. Each element is:
    // {
    //   name: XXX,
    //   enabled: Boolean,
    //   fn: Function(),
    //   alt: [ name2, name3 ]
    // }
    this.__rules__ = []; // Cached rule chains.
    // First level - chain name, '' for default.
    // Second level - diginal anchor for fast filtering by charcodes.

    this.__cache__ = null;
  } ////////////////////////////////////////////////////////////////////////////////
  // Helper methods, should not be used directly
  // Find rule index by name


  Ruler.prototype.__find__ = function (name) {
    return this.__rules__.findIndex(function (rule) {
      return rule.name === name;
    });
  }; // Build rules lookup cache


  Ruler.prototype.__compile__ = function () {
    var self = this;
    var chains = [""]; // collect unique names

    self.__rules__.forEach(function (rule) {
      if (!rule.enabled) {
        return;
      }

      rule.alt.forEach(function (altName) {
        if (chains.indexOf(altName) < 0) {
          chains.push(altName);
        }
      });
    });

    self.__cache__ = {};
    chains.forEach(function (chain) {
      self.__cache__[chain] = [];

      self.__rules__.forEach(function (rule) {
        if (!rule.enabled) {
          return;
        }

        if (chain && rule.alt.indexOf(chain) < 0) {
          return;
        }

        self.__cache__[chain].push(rule.fn);
      });
    });
  };
  /**
   * Ruler.at(name, fn [, options])
   * - name (String): rule name to replace.
   * - fn (Function): new rule function.
   * - options (Object): new rule options (not mandatory).
   *
   * Replace rule by name with new function & options. Throws error if name not
   * found.
   *
   * ##### Options:
   *
   * - __alt__ - array with names of "alternate" chains.
   *
   * ##### Example
   *
   * Replace existing typographer replacement rule with new one:
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.core.ruler.at('replacements', function replace(state) {
   *   //...
   * });
   * ```
   **/


  Ruler.prototype.at = function (name, fn, options) {
    var index = this.__find__(name);

    var opt = options || {};

    if (index === -1) {
      throw new Error("Parser rule not found: " + name);
    }

    this.__rules__[index].fn = fn;
    this.__rules__[index].alt = opt.alt || [];
    this.__cache__ = null;
  };
  /**
   * Ruler.before(beforeName, ruleName, fn [, options])
   * - beforeName (String): new rule will be added before this one.
   * - ruleName (String): name of added rule.
   * - fn (Function): rule function.
   * - options (Object): rule options (not mandatory).
   *
   * Add new rule to chain before one with given name. See also
   * [[Ruler.after]], [[Ruler.push]].
   *
   * ##### Options:
   *
   * - __alt__ - array with names of "alternate" chains.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.block.ruler.before('paragraph', 'my_rule', function replace(state) {
   *   //...
   * });
   * ```
   **/


  Ruler.prototype.before = function (beforeName, ruleName, fn, options) {
    var index = this.__find__(beforeName);

    var opt = options || {};

    if (index === -1) {
      throw new Error("Parser rule not found: " + beforeName);
    }

    this.__rules__.splice(index, 0, {
      name: ruleName,
      enabled: true,
      fn: fn,
      alt: opt.alt || []
    });

    this.__cache__ = null;
  };
  /**
   * Ruler.after(afterName, ruleName, fn [, options])
   * - afterName (String): new rule will be added after this one.
   * - ruleName (String): name of added rule.
   * - fn (Function): rule function.
   * - options (Object): rule options (not mandatory).
   *
   * Add new rule to chain after one with given name. See also
   * [[Ruler.before]], [[Ruler.push]].
   *
   * ##### Options:
   *
   * - __alt__ - array with names of "alternate" chains.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.inline.ruler.after('text', 'my_rule', function replace(state) {
   *   //...
   * });
   * ```
   **/


  Ruler.prototype.after = function (afterName, ruleName, fn, options) {
    var index = this.__find__(afterName);

    var opt = options || {};

    if (index === -1) {
      throw new Error("Parser rule not found: " + afterName);
    }

    this.__rules__.splice(index + 1, 0, {
      name: ruleName,
      enabled: true,
      fn: fn,
      alt: opt.alt || []
    });

    this.__cache__ = null;
  };
  /**
   * Ruler.push(ruleName, fn [, options])
   * - ruleName (String): name of added rule.
   * - fn (Function): rule function.
   * - options (Object): rule options (not mandatory).
   *
   * Push new rule to the end of chain. See also
   * [[Ruler.before]], [[Ruler.after]].
   *
   * ##### Options:
   *
   * - __alt__ - array with names of "alternate" chains.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')();
   *
   * md.core.ruler.push('my_rule', function replace(state) {
   *   //...
   * });
   * ```
   **/


  Ruler.prototype.push = function (ruleName, fn, options) {
    var opt = options || {};

    this.__rules__.push({
      name: ruleName,
      enabled: true,
      fn: fn,
      alt: opt.alt || []
    });

    this.__cache__ = null;
  };
  /**
   * Ruler.enable(list [, ignoreInvalid]) -> Array
   * - list (String|Array): list of rule names to enable.
   * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
   *
   * Enable rules with given names. If any rule name not found - throw Error.
   * Errors can be disabled by second param.
   *
   * Returns list of found rule names (if no exception happened).
   *
   * See also [[Ruler.disable]], [[Ruler.enableOnly]].
   **/


  Ruler.prototype.enable = function (list, ignoreInvalid) {
    if (!Array.isArray(list)) {
      list = [list];
    }

    var result = []; // Search by name and enable

    list.forEach(function (name) {
      var idx = this.__find__(name);

      if (idx < 0) {
        if (ignoreInvalid) {
          return;
        }

        throw new Error("Rules manager: invalid rule name " + name);
      }

      this.__rules__[idx].enabled = true;
      result.push(name);
    }, this);
    this.__cache__ = null;
    return result;
  };
  /**
   * Ruler.enableOnly(list [, ignoreInvalid])
   * - list (String|Array): list of rule names to enable (whitelist).
   * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
   *
   * Enable rules with given names, and disable everything else. If any rule name
   * not found - throw Error. Errors can be disabled by second param.
   *
   * See also [[Ruler.disable]], [[Ruler.enable]].
   **/


  Ruler.prototype.enableOnly = function (list, ignoreInvalid) {
    if (!Array.isArray(list)) {
      list = [list];
    }

    this.__rules__.forEach(function (rule) {
      rule.enabled = false;
    });

    this.enable(list, ignoreInvalid);
  };
  /**
   * Ruler.disable(list [, ignoreInvalid]) -> Array
   * - list (String|Array): list of rule names to disable.
   * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
   *
   * Disable rules with given names. If any rule name not found - throw Error.
   * Errors can be disabled by second param.
   *
   * Returns list of found rule names (if no exception happened).
   *
   * See also [[Ruler.enable]], [[Ruler.enableOnly]].
   **/


  Ruler.prototype.disable = function (list, ignoreInvalid) {
    if (!Array.isArray(list)) {
      list = [list];
    }

    var result = []; // Search by name and disable

    list.forEach(function (name) {
      var idx = this.__find__(name);

      if (idx < 0) {
        if (ignoreInvalid) {
          return;
        }

        throw new Error("Rules manager: invalid rule name " + name);
      }

      this.__rules__[idx].enabled = false;
      result.push(name);
    }, this);
    this.__cache__ = null;
    return result;
  };
  /**
   * Ruler.getRules(chainName) -> Array
   *
   * Return array of active functions (rules) for given chain name. It analyzes
   * rules configuration, compiles caches if not exists and returns result.
   *
   * Default chain name is `''` (empty string). It can't be skipped. That's
   * done intentionally, to keep signature monomorphic for high speed.
   **/


  Ruler.prototype.getRules = function (chainName) {
    if (this.__cache__ === null) {
      this.__compile__();
    } // Chain can be empty, if rules disabled. But we still have to return Array.


    return this.__cache__[chainName] || [];
  };

  var ruler = Ruler; // Normalize input string
  // https://spec.commonmark.org/0.29/#line-ending

  var NEWLINES_RE = /\r\n?|\n/g;
  var NULL_RE = /\0/g;

  var normalize = function normalize(state) {
    var str; // Normalize newlines

    str = state.src.replace(NEWLINES_RE, "\n"); // Replace NULL characters

    str = str.replace(NULL_RE, "\uFFFD");
    state.src = str;
  };

  var block = function block(state) {
    var token;

    if (state.inlineMode) {
      token = new state.Token("inline", "", 0);
      token.content = state.src;
      token.map = [0, 1];
      token.children = [];
      state.tokens.push(token);
    } else {
      state.md.block.parse(state.src, state.md, state.env, state.tokens);
    }
  };

  var inline = function inline(state, positionOffset) {
    var tokens = state.tokens,
        tok,
        i,
        l; // Parse inlines

    for (i = 0, l = tokens.length; i < l; i++) {
      tok = tokens[i];
      tok.position += positionOffset || 0;

      if (tok.type === "inline") {
        state.md.inline.parse(tok.content, state.md, Object.assign({}, state.env, {
          parentToken: tok,
          parentState: state,
          parentTokenIndex: i
        }), tok.children); // Update position of all children to be absolute

        for (var child = 0; child < tok.children.length; child++) {
          tok.children[child].position += tok.position;
        }
      }
    }
  }; // Simple typographic replacements
  // (c) (C) → ©
  // (tm) (TM) → ™
  // (r) (R) → ®
  // +- → ±
  // (p) (P) -> §
  // ... → … (also ?.... → ?.., !.... → !..)
  // ???????? → ???, !!!!! → !!!, `,,` → `,`
  // -- → &ndash;, --- → &mdash;
  // --> → →; <-- → ←; <--> → ↔
  // ==> → ⇒; <== → ⇐; <==> → ⇔
  // TODO:
  // - fractionals 1/2, 1/4, 3/4 -> ½, ¼, ¾
  // - miltiplication 2 x 4 -> 2 × 4


  var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--|==/;
  var ARROW_REPLACEMENTS = {
    "<--\x3e": "\u2194",
    "--\x3e": "\u2192",
    "<--": "\u2190",
    "<==>": "\u21D4",
    "==>": "\u21D2",
    "<==": "\u21D0"
  }; // Workaround for phantomjs - need regex without /g flag,
  // or root check will fail every second time

  var SCOPED_ABBR_TEST_RE = /\((c|tm|r|p)\)/i;
  var SCOPED_ABBR_RE = /\((c|tm|r|p)\)/gi;
  var SCOPED_ABBR = {
    c: "\xa9",
    r: "\xae",
    p: "\xa7",
    tm: "\u2122"
  };

  function replaceFn(match, name) {
    return SCOPED_ABBR[name.toLowerCase()];
  }

  function replace_scoped(inlineTokens) {
    var i,
        token,
        inside_autolink = 0;

    for (i = inlineTokens.length - 1; i >= 0; i--) {
      token = inlineTokens[i];

      if (token.type === "text" && !inside_autolink) {
        token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
      }

      if (token.type === "link_open" && token.info === "auto") {
        inside_autolink--;
      }

      if (token.type === "link_close" && token.info === "auto") {
        inside_autolink++;
      }
    }
  }

  function replace_rare(inlineTokens) {
    var i,
        token,
        inside_autolink = 0;

    function replace_arrow(m, p1, p2) {
      return p1 + (ARROW_REPLACEMENTS[p2] || p2);
    }

    for (i = inlineTokens.length - 1; i >= 0; i--) {
      token = inlineTokens[i];

      if (token.type === "text" && !inside_autolink) {
        if (RARE_RE.test(token.content)) {
          token.content = token.content.replace(/\+-/g, "\xb1").replace(/([?!])\.{4,}/g, "$1..").replace(/\.{3,}/g, "\u2026").replace(/\u2026\.+/g, "\u2026").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^<=-])([<]?(?:==|--)[>]?)(?=[^>=-]|$)/gm, replace_arrow).replace(/(^|[^<=-])([<]?(?:==|--)[>]?)(?=[^>=-]|$)/gm, replace_arrow).replace(/(^|[^-])---(?=[^-]|$)/gm, "$1\u2014").replace(/(^|\s)--(?=\s|$)/gm, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/gm, "$1\u2013");
        }
      }

      if (token.type === "link_open" && token.info === "auto") {
        inside_autolink--;
      }

      if (token.type === "link_close" && token.info === "auto") {
        inside_autolink++;
      }
    }
  }

  var replacements = function replace(state) {
    var blkIdx;

    if (!state.md.options.typographer) {
      return;
    }

    for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      if (state.tokens[blkIdx].type !== "inline") {
        continue;
      }

      if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
        replace_scoped(state.tokens[blkIdx].children);
      }

      if (RARE_RE.test(state.tokens[blkIdx].content)) {
        replace_rare(state.tokens[blkIdx].children);
      }
    }
  }; // Convert straight quotation marks to typographic ones


  var isWhiteSpace$1 = utils.isWhiteSpace;
  var isPunctChar$1 = utils.isPunctChar;
  var isMdAsciiPunct$1 = utils.isMdAsciiPunct;
  var QUOTE_TEST_RE = /['"]/;
  var QUOTE_RE = /['"]/g;
  var APOSTROPHE = "\u2019";
  /* ’ */

  function replaceAt(str, index, ch) {
    return str.substr(0, index) + ch + str.substr(index + 1);
  }

  function process_inlines(tokens, state) {
    var i, token, text, t, pos, max, thisLevel, item, lastChar, nextChar, isLastPunctChar, isNextPunctChar, isLastWhiteSpace, isNextWhiteSpace, canOpen, canClose, j, isSingle, stack, openQuote, closeQuote;
    stack = [];

    for (i = 0; i < tokens.length; i++) {
      token = tokens[i];
      thisLevel = tokens[i].level;

      for (j = stack.length - 1; j >= 0; j--) {
        if (stack[j].level <= thisLevel) {
          break;
        }
      }

      stack.length = j + 1;

      if (token.type !== "text") {
        continue;
      }

      text = token.content;
      pos = 0;
      max = text.length;
      /*eslint no-labels:0,block-scoped-var:0*/

      OUTER: while (pos < max) {
        QUOTE_RE.lastIndex = pos;
        t = QUOTE_RE.exec(text);

        if (!t) {
          break;
        }

        canOpen = canClose = true;
        pos = t.index + 1;
        isSingle = t[0] === "'"; // Find previous character,
        // default to space if it's the beginning of the line

        lastChar = 32;

        if (t.index - 1 >= 0) {
          lastChar = text.charCodeAt(t.index - 1);
        } else {
          for (j = i - 1; j >= 0; j--) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break; // lastChar defaults to 0x20

            if (!tokens[j].content) continue; // should skip all tokens except 'text', 'html_inline' or 'code_inline'

            lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
            break;
          }
        } // Find next character,
        // default to space if it's the end of the line


        nextChar = 32;

        if (pos < max) {
          nextChar = text.charCodeAt(pos);
        } else {
          for (j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break; // nextChar defaults to 0x20

            if (!tokens[j].content) continue; // should skip all tokens except 'text', 'html_inline' or 'code_inline'

            nextChar = tokens[j].content.charCodeAt(0);
            break;
          }
        }

        isLastPunctChar = isMdAsciiPunct$1(lastChar) || isPunctChar$1(String.fromCharCode(lastChar));
        isNextPunctChar = isMdAsciiPunct$1(nextChar) || isPunctChar$1(String.fromCharCode(nextChar));
        isLastWhiteSpace = isWhiteSpace$1(lastChar);
        isNextWhiteSpace = isWhiteSpace$1(nextChar);

        if (isNextWhiteSpace) {
          canOpen = false;
        } else if (isNextPunctChar) {
          if (!(isLastWhiteSpace || isLastPunctChar)) {
            canOpen = false;
          }
        }

        if (isLastWhiteSpace) {
          canClose = false;
        } else if (isLastPunctChar) {
          if (!(isNextWhiteSpace || isNextPunctChar)) {
            canClose = false;
          }
        }

        if (nextChar === 34
        /* " */
        && t[0] === '"') {
          if (lastChar >= 48
          /* 0 */
          && lastChar <= 57
          /* 9 */
          ) {
              // special case: 1"" - count first quote as an inch
              canClose = canOpen = false;
            }
        }

        if (canOpen && canClose) {
          // Replace quotes in the middle of punctuation sequence, but not
          // in the middle of the words, i.e.:
          // 1. foo " bar " baz - not replaced
          // 2. foo-"-bar-"-baz - replaced
          // 3. foo"bar"baz     - not replaced
          canOpen = isLastPunctChar;
          canClose = isNextPunctChar;
        }

        if (!canOpen && !canClose) {
          // middle of word
          if (isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }

          continue;
        }

        if (canClose) {
          // this could be a closing quote, rewind the stack to get a match
          for (j = stack.length - 1; j >= 0; j--) {
            item = stack[j];

            if (stack[j].level < thisLevel) {
              break;
            }

            if (item.single === isSingle && stack[j].level === thisLevel) {
              item = stack[j];

              if (isSingle) {
                openQuote = state.md.options.quotes[2];
                closeQuote = state.md.options.quotes[3];
              } else {
                openQuote = state.md.options.quotes[0];
                closeQuote = state.md.options.quotes[1];
              } // replace token.content *before* tokens[item.token].content,
              // because, if they are pointing at the same token, replaceAt
              // could mess up indices when quote length != 1


              token.content = replaceAt(token.content, t.index, closeQuote);
              tokens[item.token].content = replaceAt(tokens[item.token].content, item.pos, openQuote);
              pos += closeQuote.length - 1;

              if (item.token === i) {
                pos += openQuote.length - 1;
              }

              text = token.content;
              max = text.length;
              stack.length = j;
              continue OUTER;
            }
          }
        }

        if (canOpen) {
          stack.push({
            token: i,
            pos: t.index,
            single: isSingle,
            level: thisLevel
          });
        } else if (canClose && isSingle) {
          token.content = replaceAt(token.content, t.index, APOSTROPHE);
        }
      }
    }
  }

  var smartquotes = function smartquotes(state) {
    /*eslint max-depth:0*/
    var blkIdx;

    if (!state.md.options.typographer) {
      return;
    }

    for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
      if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
        continue;
      }

      process_inlines(state.tokens[blkIdx].children, state);
    }
  }; // Token class

  /**
   * class Token
   **/

  /**
   * new Token(type, tag, nesting)
   *
   * Create new token and fill passed properties.
   **/


  function Token(type, tag, nesting) {
    /**
     * Token#type -> String
     *
     * Type of the token (string, e.g. "paragraph_open")
     **/
    this.type = type;
    /**
     * Token#tag -> String
     *
     * html tag name, e.g. "p"
     **/

    this.tag = tag;
    /**
     * Token#attrs -> Array
     *
     * Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
     **/

    this.attrs = null;
    /**
     * Token#map -> Array
     *
     * Source map info. Format: `[ line_begin, line_end ]`
     **/

    this.map = null;
    /**
     * Token#nesting -> Number
     *
     * Level change (number in {-1, 0, 1} set), where:
     *
     * -  `1` means the tag is opening
     * -  `0` means the tag is self-closing
     * - `-1` means the tag is closing
     **/

    this.nesting = nesting;
    /**
     * Token#level -> Number
     *
     * nesting level, the same as `state.level`
     **/

    this.level = 0;
    /**
     * Token#children -> Array
     *
     * An array of child nodes (inline and img tokens)
     **/

    this.children = null;
    /**
     * Token#content -> String
     *
     * In a case of self-closing tag (code, html, fence, etc.),
     * it has contents of this tag.
     **/

    this.content = "";
    /**
     * Token#markup -> String
     *
     * '*' or '_' for emphasis, fence string for fence, etc.
     **/

    this.markup = "";
    /**
     * Token#info -> String
     *
     * fence infostring
     **/

    this.info = "";
    /**
     * Token#meta -> Object
     *
     * A place for plugins to store an arbitrary data
     **/

    this.meta = null;
    /**
     * Token#block -> Boolean
     *
     * True for block-level tokens, false for inline tokens.
     * Used in renderer to calculate line breaks
     **/

    this.block = false;
    /**
     * Token#hidden -> Boolean
     *
     * If it's true, ignore this element when rendering. Used for tight lists
     * to hide paragraphs.
     **/

    this.hidden = false;
    /**
     * Token#position -> Number
     *
     * Position in the original string
     **/

    this.position = 0;
    /**
     * Token#size -> Number
     *
     * Size of the token
     **/

    this.size = 0;
  }
  /**
   * Token.attrIndex(name) -> Number
   *
   * Search attribute index by name.
   **/


  Token.prototype.attrIndex = function attrIndex(name) {
    var attrs;

    if (!this.attrs) {
      return -1;
    }

    attrs = this.attrs;
    return attrs.findIndex(function (el) {
      return el[0] === name;
    });
  };
  /**
   * Token.attrPush(attrData)
   *
   * Add `[ name, value ]` attribute to list. Init attrs if necessary
   **/


  Token.prototype.attrPush = function attrPush(attrData) {
    if (this.attrs) {
      this.attrs.push(attrData);
    } else {
      this.attrs = [attrData];
    }
  };
  /**
   * Token.attrSet(name, value)
   *
   * Set `name` attribute to `value`. Override old value if exists.
   **/


  Token.prototype.attrSet = function attrSet(name, value) {
    var idx = this.attrIndex(name),
        attrData = [name, value];

    if (idx < 0) {
      this.attrPush(attrData);
    } else {
      this.attrs[idx] = attrData;
    }
  };
  /**
   * Token.attrGet(name)
   *
   * Get the value of attribute `name`, or null if it does not exist.
   **/


  Token.prototype.attrGet = function attrGet(name) {
    var idx = this.attrIndex(name),
        value = null;

    if (idx >= 0) {
      value = this.attrs[idx][1];
    }

    return value;
  };
  /**
   * Token.attrJoin(name, value)
   *
   * Join value to existing attribute via space. Or create new attribute if not
   * exists. Useful to operate with token classes.
   **/


  Token.prototype.attrJoin = function attrJoin(name, value) {
    var idx = this.attrIndex(name);

    if (idx < 0) {
      this.attrPush([name, value]);
    } else {
      this.attrs[idx][1] = this.attrs[idx][1] + " " + value;
    }
  };
  /**
   * Token.clone()
   *
   * Obtain a shallow clone of the token.  You can use this while rendering to
   * prevent modifying the token list while rendering.
   **/


  Token.prototype.clone = function clone() {
    var token = new Token(this.type, this.tag, this.nesting);
    token.attrs = this.attrs;
    token.level = this.level;
    token.children = this.children;
    token.content = this.content;
    token.map = this.map;
    token.markup = this.markup;
    token.info = this.info;
    token.meta = this.meta;
    token.block = this.block;
    token.hidden = this.hidden;
    return token;
  };

  var token = Token; // Core state object

  function StateCore(src, md, env) {
    this.src = src;
    this.env = env;
    this.tokens = [];
    this.inlineMode = false;
    this.md = md; // link to parser instance
  } // re-export Token class to use in core rules


  StateCore.prototype.Token = token;
  var state_core = StateCore;
  /** internal
   * class Core
   *
   * Top-level rules executor. Glues block/inline parsers and does intermediate
   * transformations.
   **/

  var _rules$2 = [["normalize", normalize], ["block", block], ["inline", inline], ["replacements", replacements], ["smartquotes", smartquotes]];
  /**
   * new Core()
   **/

  function Core() {
    /**
     * Core#ruler -> Ruler
     *
     * [[Ruler]] instance. Keep configuration of core rules.
     **/
    this.ruler = new ruler();

    for (var i = 0; i < _rules$2.length; i++) {
      this.ruler.push(_rules$2[i][0], _rules$2[i][1]);
    }
  }
  /**
   * Core.process(state)
   *
   * Executes core chain rules.
   **/


  Core.prototype.process = function (state) {
    var i, l, rules;
    rules = this.ruler.getRules("");

    for (i = 0, l = rules.length; i < l; i++) {
      rules[i](state);
    }
  };

  Core.prototype.State = state_core;
  var parser_core = Core; // GFM table, https://github.github.com/gfm/#tables-extension-

  var isSpace$a = utils.isSpace;
  var trimLeftOffset$3 = utils.trimLeftOffset;

  function getLine(state, line) {
    var pos = state.bMarks[line] + state.tShift[line],
        max = state.eMarks[line];
    return state.src.substr(pos, max - pos);
  }

  function escapedSplit(str, positions) {
    var result = [],
        pos = 0,
        max = str.length,
        ch,
        isEscaped = false,
        lastPos = 0,
        current = "";
    ch = str.charCodeAt(pos);

    while (pos < max) {
      if (ch === 124
      /* | */
      ) {
          if (!isEscaped) {
            // pipe separating cells, '|'
            result.push(current + str.substring(lastPos, pos));
            positions.push(lastPos);
            current = "";
            lastPos = pos + 1;
          } else {
            // escaped pipe, '\|'
            current += str.substring(lastPos, pos - 1);
            lastPos = pos;
          }
        }

      isEscaped = ch === 92
      /* \ */
      ;
      pos++;
      ch = str.charCodeAt(pos);
    }

    result.push(current + str.substring(lastPos));
    positions.push(lastPos);
    return result;
  }

  var table = function table(state, startLine, endLine, silent) {
    var ch, lineText, pos, i, l, nextLine, columns, columnCount, token, aligns, t, tableLines, tbodyLines, oldParentType, terminate, terminatorRules, positions, len, columnVIndex; // should have at least two lines

    if (startLine + 2 > endLine) {
      return false;
    }

    nextLine = startLine + 1;

    if (state.sCount[nextLine] < state.blkIndent) {
      return false;
    } // if it's indented more than 3 spaces, it should be a code block


    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      return false;
    } // first character of the second line should be '|', '-', ':',
    // and no other characters are allowed but spaces;
    // basically, this is the equivalent of /^[-:|][-:|\s]*$/ regexp


    pos = state.bMarks[nextLine] + state.tShift[nextLine];

    if (pos >= state.eMarks[nextLine]) {
      return false;
    }

    ch = state.src.charCodeAt(pos++);

    if (ch !== 124
    /* | */
    && ch !== 45
    /* - */
    && ch !== 58
    /* : */
    ) {
        return false;
      }

    while (pos < state.eMarks[nextLine]) {
      ch = state.src.charCodeAt(pos);

      if (ch !== 124
      /* | */
      && ch !== 45
      /* - */
      && ch !== 58
      /* : */
      && !isSpace$a(ch)) {
        return false;
      }

      pos++;
    }

    lineText = getLine(state, startLine + 1);
    columns = lineText.split("|");
    aligns = [];

    for (i = 0; i < columns.length; i++) {
      t = columns[i].trim();

      if (!t) {
        // allow empty columns before and after table, but not in between columns;
        // e.g. allow ` |---| `, disallow ` ---||--- `
        if (i === 0 || i === columns.length - 1) {
          continue;
        } else {
          return false;
        }
      }

      if (!/^:?-+:?$/.test(t)) {
        return false;
      }

      if (t.charCodeAt(t.length - 1) === 58
      /* : */
      ) {
          aligns.push(t.charCodeAt(0) === 58
          /* : */
          ? "center" : "right");
        } else if (t.charCodeAt(0) === 58
      /* : */
      ) {
          aligns.push("left");
        } else {
        aligns.push("");
      }
    }

    lineText = getLine(state, startLine).trim();

    if (lineText.indexOf("|") === -1) {
      return false;
    }

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    positions = [];
    columns = escapedSplit(lineText, positions);

    if (columns.length && columns[0] === "") {
      columns.shift();
      positions.shift();
    }

    if (columns.length && columns[columns.length - 1] === "") {
      columns.pop();
      positions.pop();
    } // header row will define an amount of columns in the entire table,
    // and align row should be exactly the same (the rest of the rows can differ)


    columnCount = columns.length;

    if (columnCount === 0 || columnCount !== aligns.length) {
      return false;
    }

    if (silent) {
      return true;
    }

    oldParentType = state.parentType;
    state.parentType = "table"; // use 'blockquote' lists for termination because it's
    // the most similar to tables

    terminatorRules = state.md.block.ruler.getRules("blockquote");
    token = state.push("table_open", "table", 1);
    token.map = tableLines = [startLine, 0];
    token.size = 0;
    token.position = state.bMarks[startLine];
    token = state.push("thead_open", "thead", 1);
    token.map = [startLine, startLine + 1];
    token.size = 0;
    token.position = state.bMarks[startLine];
    token = state.push("tr_open", "tr", 1);
    token.map = [startLine, startLine + 1];
    token.size = 0;
    token.position = state.bMarks[startLine];
    var headings = [];
    columnVIndex = state.bMarks[startLine] + state.tShift[startLine];

    for (i = 0; i < columns.length; i++) {
      token = state.push("th_open", "th", 1);
      token.size = 1;
      token.position = columnVIndex;
      columnVIndex += 1;

      if (aligns[i]) {
        token.attrs = [["style", "text-align:" + aligns[i]]];
      }

      token = state.push("inline", "", 0);
      token.content = columns[i].trim();
      token.children = [];
      token.position = columnVIndex + trimLeftOffset$3(columns[i]);
      token.size = token.content.length;
      columnVIndex += columns[i].length; // empty headings get the column index number as a data-label

      headings[i] = token.content || "col-" + (i + 1);
      token = state.push("th_close", "th", -1);
      token.position = columnVIndex;
      token.size = 0; // Last column?

      if (i === columns.length - 1) {
        token.size = 1;
        columnVIndex += 1;
      }
    }

    token = state.push("tr_close", "tr", -1);
    token.size = 0;
    token.position = state.eMarks[startLine];
    token = state.push("thead_close", "thead", -1);
    token.size = state.eMarks[startLine + 1] - state.bMarks[startLine + 1];
    token.position = state.bMarks[startLine + 1];

    for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      }

      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        break;
      }

      lineText = getLine(state, nextLine).trim();

      if (!lineText) {
        break;
      }

      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        break;
      }

      positions = [];
      columns = escapedSplit(lineText, positions);

      if (columns.length && columns[0] === "") {
        columns.shift();
        positions.shift();
      }

      if (columns.length && columns[columns.length - 1] === "") {
        columns.pop();
        positions.pop();
      }

      if (nextLine === startLine + 2) {
        token = state.push("tbody_open", "tbody", 1);
        token.map = tbodyLines = [startLine + 2, 0];
        token.size = 0;
        token.position = state.bMarks[startLine + 2];
      }

      token = state.push("tr_open", "tr", 1);
      token.map = [nextLine, nextLine + 1];
      token.size = 0;
      token.position = state.bMarks[nextLine];
      columnVIndex = state.bMarks[nextLine] + state.tShift[nextLine];
      len = Math.max(columns.length, columnCount);

      for (i = 0; i < len; i++) {
        token = state.push("td_open", "td", 1);
        token.size = 1;
        token.position = columnVIndex;
        columnVIndex++; // as MarkDown table rows MAY have more columns than originally set up in the table header
        // by the user, augment the data-label table as we go along:
        // empty headings get the column index number as a data-label

        if (!headings[i]) {
          headings[i] = "col-" + (i + 1);
        }

        token.attrs = [["data-label", headings[i]]];

        if (aligns[i]) {
          token.attrs.push(["style", "text-align:" + aligns[i]]);
        }

        var originalContent = columns[i] || "";
        token = state.push("inline", "", 0);
        token.content = originalContent.trim();
        token.children = [];
        token.size = token.content.length;
        token.position = columnVIndex + trimLeftOffset$3(originalContent);
        columnVIndex += originalContent.length;
        token.map = [nextLine, nextLine + 1];
        token = state.push("td_close", "td", -1);
        token.position = columnVIndex;
        token.size = 0; // Last column?

        if (i === columns.length - 1) {
          token.size = 1;
        }
      }

      token = state.push("tr_close", "tr", -1);
      token.size = 0;
      token.position = state.eMarks[nextLine];
    }

    if (tbodyLines) {
      token = state.push("tbody_close", "tbody", -1);
      token.size = 0;
      token.position = state.eMarks[nextLine];
      tbodyLines[1] = nextLine;
    }

    token = state.push("table_close", "table", -1);
    token.size = 0;
    token.position = state.eMarks[nextLine];
    tableLines[1] = nextLine;
    state.parentType = oldParentType;
    state.line = nextLine;
    return true;
  }; // Code block (4 spaces padded)


  var code = function code(state, startLine, endLine
  /*, silent*/
  ) {
    var nextLine,
        last,
        token,
        pos = state.bMarks[startLine],
        endPos;

    if (state.sCount[startLine] - state.blkIndent < 4) {
      return false;
    }

    last = nextLine = startLine + 1;

    while (nextLine < endLine) {
      if (state.isEmpty(nextLine)) {
        nextLine++;
        continue;
      }

      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        nextLine++;
        last = nextLine;
        continue;
      }

      break;
    }

    endPos = state.bMarks[last] + state.tShift[last];
    state.line = last;
    token = state.push("code_block", "code", 0);
    token.content = state.getLines(startLine, last, 4 + state.blkIndent, true);
    token.map = [startLine, state.line];
    token.position = pos;
    token.size = endPos - pos;
    return true;
  }; // fences (``` lang, ~~~ lang)


  var fence = function fence(state, startLine, endLine, silent) {
    var marker,
        len,
        params,
        nextLine,
        mem,
        token,
        markup,
        originalPos,
        haveEndMarker = false,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine]; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    if (pos + 3 > max) {
      return false;
    }

    marker = state.src.charCodeAt(pos);

    if (marker !== 126
    /* ~ */
    && marker !== 96
    /* ` */
    ) {
        return false;
      } // scan marker length


    mem = pos;
    pos = state.skipChars(pos, marker);
    len = pos - mem;

    if (len < 3) {
      return false;
    }

    originalPos = mem;
    markup = state.src.slice(mem, pos);
    params = state.src.slice(pos, max);

    if (marker === 96
    /* ` */
    ) {
        if (params.indexOf(String.fromCharCode(marker)) >= 0) {
          return false;
        }
      } // Since start is found, we can report success here in validation mode


    if (silent) {
      return true;
    } // search end of block


    nextLine = startLine;

    for (;;) {
      nextLine++;

      if (nextLine >= endLine) {
        // unclosed block should be autoclosed by end of document.
        // also block seems to be autoclosed by end of parent
        break;
      }

      pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos < max && state.sCount[nextLine] < state.blkIndent) {
        // non-empty line with negative indent should stop the list:
        // - ```
        //  test
        break;
      }

      if (state.src.charCodeAt(pos) !== marker) {
        continue;
      }

      if (state.sCount[nextLine] - state.blkIndent >= 4) {
        // closing fence should be indented less than 4 spaces
        continue;
      }

      pos = state.skipChars(pos, marker); // closing code fence must be at least as long as the opening one

      if (pos - mem < len) {
        continue;
      } // make sure tail has spaces only


      pos = state.skipSpaces(pos);

      if (pos < max) {
        continue;
      }

      haveEndMarker = true; // found!

      break;
    } // If a fence has heading spaces, they should be removed from its inner block


    len = state.sCount[startLine];
    state.line = nextLine + (haveEndMarker ? 1 : 0);
    token = state.push("fence", "code", 0);
    token.info = params;
    token.content = state.getLines(startLine + 1, nextLine, len, true);
    token.markup = markup;
    token.map = [startLine, state.line];
    token.position = originalPos;
    token.size = pos - originalPos;
    return true;
  }; // Block quotes


  var isSpace$9 = utils.isSpace;

  var blockquote = function blockquote(state, startLine, endLine, silent) {
    var adjustTab,
        ch,
        i,
        initial,
        blockStart,
        l,
        lastLineEmpty,
        lines,
        nextLine,
        offset,
        oldBMarks,
        oldBSCount,
        oldIndent,
        oldParentType,
        oldSCount,
        oldTShift,
        spaceAfterMarker,
        terminate,
        terminatorRules,
        token,
        isOutdented,
        oldLineMax = state.lineMax,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine]; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    } // check the block quote marker


    if (state.src.charCodeAt(pos++) !== 62
    /* > */
    ) {
        return false;
      } // we know that it's going to be a valid blockquote,
    // so no point trying to find the end of it in silent mode


    if (silent) {
      return true;
    } // store position for token position/size later on


    blockStart = pos; // set offset past spaces and ">"

    initial = offset = state.sCount[startLine] + 1; // skip one optional space after '>'

    if (state.src.charCodeAt(pos) === 32
    /* space */
    ) {
        // ' >   test '
        //     ^ -- position start of line here:
        pos++;
        initial++;
        offset++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 9
    /* tab */
    ) {
        spaceAfterMarker = true;

        if ((state.bsCount[startLine] + offset) % 4 === 3) {
          // '  >\t  test '
          //       ^ -- position start of line here (tab has width===1)
          pos++;
          initial++;
          offset++;
          adjustTab = false;
        } else {
          // ' >\t  test '
          //    ^ -- position start of line here + shift bsCount slightly
          //         to make extra space appear
          adjustTab = true;
        }
      } else {
      spaceAfterMarker = false;
    }

    oldBMarks = [state.bMarks[startLine]];
    state.bMarks[startLine] = pos;

    while (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (isSpace$9(ch)) {
        if (ch === 9) {
          offset += 4 - (offset + state.bsCount[startLine] + (adjustTab ? 1 : 0)) % 4;
        } else {
          offset++;
        }
      } else {
        break;
      }

      pos++;
    }

    oldBSCount = [state.bsCount[startLine]];
    state.bsCount[startLine] = state.sCount[startLine] + 1 + (spaceAfterMarker ? 1 : 0);
    lastLineEmpty = pos >= max;
    oldSCount = [state.sCount[startLine]];
    state.sCount[startLine] = offset - initial;
    oldTShift = [state.tShift[startLine]];
    state.tShift[startLine] = pos - state.bMarks[startLine];
    terminatorRules = state.md.block.ruler.getRules("blockquote");
    oldParentType = state.parentType;
    state.parentType = "blockquote"; // Search the end of the block
    // Block ends with either:
    //  1. an empty line outside:
    //     ```
    //     > test
    //     ```
    //  2. an empty line inside:
    //     ```
    //     >
    //     test
    //     ```
    //  3. another tag:
    //     ```
    //     > test
    //      - - -
    //     ```

    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      // check if it's outdented, i.e. it's inside list item and indented
      // less than said list item:
      // ```
      // 1. anything
      //    > current blockquote
      // 2. checking this line
      // ```
      isOutdented = state.sCount[nextLine] < state.blkIndent;
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos >= max) {
        // Case 1: line is not inside the blockquote, and this line is empty.
        break;
      }

      if (state.src.charCodeAt(pos++) === 62
      /* > */
      && !isOutdented) {
        // This line is inside the blockquote.
        // set offset past spaces and ">"
        initial = offset = state.sCount[nextLine] + 1; // skip one optional space after '>'

        if (state.src.charCodeAt(pos) === 32
        /* space */
        ) {
            // ' >   test '
            //     ^ -- position start of line here:
            pos++;
            initial++;
            offset++;
            adjustTab = false;
            spaceAfterMarker = true;
          } else if (state.src.charCodeAt(pos) === 9
        /* tab */
        ) {
            spaceAfterMarker = true;

            if ((state.bsCount[nextLine] + offset) % 4 === 3) {
              // '  >\t  test '
              //       ^ -- position start of line here (tab has width===1)
              pos++;
              initial++;
              offset++;
              adjustTab = false;
            } else {
              // ' >\t  test '
              //    ^ -- position start of line here + shift bsCount slightly
              //         to make extra space appear
              adjustTab = true;
            }
          } else {
          spaceAfterMarker = false;
        }

        oldBMarks.push(state.bMarks[nextLine]);
        state.bMarks[nextLine] = pos;

        while (pos < max) {
          ch = state.src.charCodeAt(pos);

          if (isSpace$9(ch)) {
            if (ch === 9) {
              offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
            } else {
              offset++;
            }
          } else {
            break;
          }

          pos++;
        }

        lastLineEmpty = pos >= max;
        oldBSCount.push(state.bsCount[nextLine]);
        state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] = offset - initial;
        oldTShift.push(state.tShift[nextLine]);
        state.tShift[nextLine] = pos - state.bMarks[nextLine];
        continue;
      } // Case 2: line is not inside the blockquote, and the last line was empty.


      if (lastLineEmpty) {
        break;
      } // Case 3: another tag found.


      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        // Quirk to enforce "hard termination mode" for paragraphs;
        // normally if you call `tokenize(state, startLine, nextLine)`,
        // paragraphs will look below nextLine for paragraph continuation,
        // but if blockquote is terminated by another tag, they shouldn't
        state.lineMax = nextLine;

        if (state.blkIndent !== 0) {
          // state.blkIndent was non-zero, we now set it to zero,
          // so we need to re-calculate all offsets to appear as
          // if indent wasn't changed
          oldBMarks.push(state.bMarks[nextLine]);
          oldBSCount.push(state.bsCount[nextLine]);
          oldTShift.push(state.tShift[nextLine]);
          oldSCount.push(state.sCount[nextLine]);
          state.sCount[nextLine] -= state.blkIndent;
        }

        break;
      }

      oldBMarks.push(state.bMarks[nextLine]);
      oldBSCount.push(state.bsCount[nextLine]);
      oldTShift.push(state.tShift[nextLine]);
      oldSCount.push(state.sCount[nextLine]); // A negative indentation means that this is a paragraph continuation

      state.sCount[nextLine] = -1;
    }

    oldIndent = state.blkIndent;
    state.blkIndent = 0;
    token = state.push("blockquote_open", "blockquote", 1);
    token.markup = ">";
    token.map = lines = [startLine, 0];
    token.position = blockStart;
    token.size = pos - blockStart;
    state.md.block.tokenize(state, startLine, nextLine);
    token = state.push("blockquote_close", "blockquote", -1);
    token.markup = ">";
    token.position = pos;
    token.size = 0;
    state.lineMax = oldLineMax;
    state.parentType = oldParentType;
    lines[1] = state.line; // Restore original tShift; this might not be necessary since the parser
    // has already been here, but just to make sure we can do that.

    for (i = 0; i < oldTShift.length; i++) {
      state.bMarks[i + startLine] = oldBMarks[i];
      state.tShift[i + startLine] = oldTShift[i];
      state.sCount[i + startLine] = oldSCount[i];
      state.bsCount[i + startLine] = oldBSCount[i];
    }

    state.blkIndent = oldIndent;
    return true;
  }; // Horizontal rule


  var isSpace$8 = utils.isSpace;

  var hr = function hr(state, startLine, endLine, silent) {
    var marker,
        cnt,
        ch,
        token,
        originalPos,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine]; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    originalPos = pos;
    marker = state.src.charCodeAt(pos++); // Check hr marker

    if (marker !== 42
    /* * */
    && marker !== 45
    /* - */
    && marker !== 95
    /* _ */
    ) {
        return false;
      } // markers can be mixed with spaces, but there should be at least 3 of them


    cnt = 1;

    while (pos < max) {
      ch = state.src.charCodeAt(pos++);

      if (ch !== marker && !isSpace$8(ch)) {
        return false;
      }

      if (ch === marker) {
        cnt++;
      }
    }

    if (cnt < 3) {
      return false;
    }

    if (silent) {
      return true;
    }

    state.line = startLine + 1;
    token = state.push("hr", "hr", 0);
    token.map = [startLine, state.line];
    token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
    token.position = originalPos;
    token.size = pos - originalPos;
    return true;
  }; // Lists


  var isSpace$7 = utils.isSpace; // Search `[-+*][\n ]`, returns next pos after marker on success
  // or -1 on fail.

  function skipBulletListMarker(state, startLine) {
    var marker, pos, max, ch;
    pos = state.bMarks[startLine] + state.tShift[startLine];
    max = state.eMarks[startLine];
    marker = state.src.charCodeAt(pos++); // Check bullet

    if (marker !== 42
    /* * */
    && marker !== 45
    /* - */
    && marker !== 43
    /* + */
    ) {
        return -1;
      }

    if (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (!isSpace$7(ch)) {
        // " -test " - is not a list item
        return -1;
      }
    }

    return pos;
  } // Search `\d+[.)][\n ]`, returns next pos after marker on success
  // or -1 on fail.


  function skipOrderedListMarker(state, startLine) {
    var ch,
        start = state.bMarks[startLine] + state.tShift[startLine],
        pos = start,
        max = state.eMarks[startLine]; // List marker should have at least 2 chars (digit + dot)

    if (pos + 1 >= max) {
      return -1;
    }

    ch = state.src.charCodeAt(pos++);

    if (ch < 48
    /* 0 */
    || ch > 57
    /* 9 */
    ) {
        return -1;
      }

    for (;;) {
      // EOL -> fail
      if (pos >= max) {
        return -1;
      }

      ch = state.src.charCodeAt(pos++);

      if (ch >= 48
      /* 0 */
      && ch <= 57
      /* 9 */
      ) {
          // List marker should have no more than 9 digits
          // (prevents integer overflow in browsers)
          if (pos - start >= 10) {
            return -1;
          }

          continue;
        } // found valid marker


      if (ch === 41
      /* ) */
      || ch === 46
      /* . */
      ) {
          break;
        }

      return -1;
    }

    if (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (!isSpace$7(ch)) {
        // " 1.test " - is not a list item
        return -1;
      }
    }

    return pos;
  }

  function markTightParagraphs(state, idx) {
    var i,
        l,
        level = state.level + 2;

    for (i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
      if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
        state.tokens[i + 2].hidden = true;
        state.tokens[i].hidden = true;
        i += 2;
      }
    }
  }

  var list = function list(state, startLine, endLine, silent) {
    var ch,
        contentStart,
        i,
        indent,
        indentAfterMarker,
        initial,
        isOrdered,
        itemLines,
        l,
        listLines,
        listTokIdx,
        markerCharCode,
        markerValue,
        max,
        nextLine,
        offset,
        oldListIndent,
        oldParentType,
        oldSCount,
        oldTShift,
        oldTight,
        pos,
        posAfterMarker,
        prevEmptyEnd,
        start,
        blockStart,
        terminate,
        terminatorRules,
        token,
        isTerminatingParagraph = false,
        tight = true; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    } // Special case:
    //  - item 1
    //   - item 2
    //    - item 3
    //     - item 4
    //      - this one is a paragraph continuation


    if (state.listIndent >= 0 && state.sCount[startLine] - state.listIndent >= 4 && state.sCount[startLine] < state.blkIndent) {
      return false;
    } // limit conditions when list can interrupt
    // a paragraph (validation mode only)


    if (silent && state.parentType === "paragraph") {
      // Next list item should still terminate previous list item;
      // This code can fail if plugins use blkIndent as well as lists,
      // but I hope the spec gets fixed long before that happens.
      if (state.tShift[startLine] >= state.blkIndent) {
        isTerminatingParagraph = true;
      }
    }

    blockStart = state.bMarks[startLine] + state.tShift[startLine]; // Detect list type and position after marker

    if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
      isOrdered = true;
      start = state.bMarks[startLine] + state.tShift[startLine];
      markerValue = Number(state.src.substr(start, posAfterMarker - start - 1)); // If we're starting a new ordered list right after
      // a paragraph, it should start with 1.

      if (isTerminatingParagraph && markerValue !== 1) return false;
    } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
      isOrdered = false;
    } else {
      return false;
    } // If we're starting a new unordered list right after
    // a paragraph, first line should not be empty.


    if (isTerminatingParagraph) {
      if (state.skipSpaces(posAfterMarker) >= state.eMarks[startLine]) return false;
    } // We should terminate list on style change. Remember first one to compare.


    markerCharCode = state.src.charCodeAt(posAfterMarker - 1); // For validation mode we can terminate immediately

    if (silent) {
      return true;
    } // Start list


    listTokIdx = state.tokens.length;

    if (isOrdered) {
      token = state.push("ordered_list_open", "ol", 1);

      if (markerValue !== 1) {
        token.attrs = [["start", markerValue]];
      }
    } else {
      token = state.push("bullet_list_open", "ul", 1);
    }

    token.map = listLines = [startLine, 0];
    token.markup = String.fromCharCode(markerCharCode);
    token.position = blockStart;
    token.size = state.eMarks[endLine] - blockStart; // Iterate list items

    nextLine = startLine;
    prevEmptyEnd = false;
    terminatorRules = state.md.block.ruler.getRules("list");
    oldParentType = state.parentType;
    state.parentType = "list";

    while (nextLine < endLine) {
      pos = posAfterMarker;
      max = state.eMarks[nextLine];
      initial = offset = state.sCount[nextLine] + posAfterMarker - (state.bMarks[startLine] + state.tShift[startLine]);

      while (pos < max) {
        ch = state.src.charCodeAt(pos);

        if (ch === 9) {
          offset += 4 - (offset + state.bsCount[nextLine]) % 4;
        } else if (ch === 32) {
          offset++;
        } else {
          break;
        }

        pos++;
      }

      contentStart = pos;

      if (contentStart >= max) {
        // trimming space in "-    \n  3" case, indent is 1 here
        indentAfterMarker = 1;
      } else {
        indentAfterMarker = offset - initial;
      } // If we have more than 4 spaces, the indent is 1
      // (the rest is just indented code block)


      if (indentAfterMarker > 4) {
        indentAfterMarker = 1;
      } // "  -  test"
      //  ^^^^^ - calculating total length of this thing


      indent = initial + indentAfterMarker; // Run subparser & write tokens

      token = state.push("list_item_open", "li", 1);
      token.markup = String.fromCharCode(markerCharCode);
      token.map = itemLines = [startLine, 0];
      token.position = contentStart;
      token.size = 0; // change current state, then restore it after parser subcall

      oldTight = state.tight;
      oldTShift = state.tShift[startLine];
      oldSCount = state.sCount[startLine]; //  - example list
      // ^ listIndent position will be here
      //   ^ blkIndent position will be here

      oldListIndent = state.listIndent;
      state.listIndent = state.blkIndent;
      state.blkIndent = indent;
      state.tight = true;
      state.tShift[startLine] = contentStart - state.bMarks[startLine];
      state.sCount[startLine] = offset;

      if (contentStart >= max && state.isEmpty(startLine + 1)) {
        // workaround for this case
        // (list item is empty, list terminates before "foo"):
        // ~~~~~~~~
        //   -
        //     foo
        // ~~~~~~~~
        state.line = Math.min(state.line + 2, endLine);
      } else {
        state.md.block.tokenize(state, startLine, endLine, true);
      } // If any of list item is tight, mark list as tight


      if (!state.tight || prevEmptyEnd) {
        tight = false;
      } // Item become loose if finish with empty line,
      // but we should filter last element, because it means list finish


      prevEmptyEnd = state.line - startLine > 1 && state.isEmpty(state.line - 1);
      state.blkIndent = state.listIndent;
      state.listIndent = oldListIndent;
      state.tShift[startLine] = oldTShift;
      state.sCount[startLine] = oldSCount;
      state.tight = oldTight;
      token = state.push("list_item_close", "li", -1);
      token.markup = String.fromCharCode(markerCharCode);
      token.position = state.bMarks[state.line];
      token.size = 0;
      nextLine = startLine = state.line;
      itemLines[1] = nextLine;
      contentStart = state.bMarks[startLine];

      if (nextLine >= endLine) {
        break;
      } // Try to check if list is terminated or continued.


      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      } // if it's indented more than 3 spaces, it should be a code block


      if (state.sCount[startLine] - state.blkIndent >= 4) {
        break;
      } // fail if terminating block found


      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        break;
      } // fail if list has another type


      if (isOrdered) {
        posAfterMarker = skipOrderedListMarker(state, nextLine);

        if (posAfterMarker < 0) {
          break;
        }
      } else {
        posAfterMarker = skipBulletListMarker(state, nextLine);

        if (posAfterMarker < 0) {
          break;
        }
      }

      if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
        break;
      }
    } // Finalize list


    if (isOrdered) {
      token = state.push("ordered_list_close", "ol", -1);
    } else {
      token = state.push("bullet_list_close", "ul", -1);
    }

    token.markup = String.fromCharCode(markerCharCode);
    token.position = state.bMarks[nextLine];
    token.size = 0;
    listLines[1] = nextLine;
    state.line = nextLine;
    state.parentType = oldParentType; // mark paragraphs tight if needed

    if (tight) {
      markTightParagraphs(state, listTokIdx);
    }

    return true;
  };

  var normalizeReference$2 = utils.normalizeReference;
  var isSpace$6 = utils.isSpace;

  var reference = function reference(state, startLine, _endLine, silent) {
    var ch,
        destEndPos,
        destEndLineNo,
        endLine,
        href,
        i,
        l,
        label,
        labelEnd,
        oldParentType,
        res,
        start,
        str,
        terminate,
        terminatorRules,
        title,
        lines = 0,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine],
        nextLine = startLine + 1; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    if (state.src.charCodeAt(pos) !== 91
    /* [ */
    ) {
        return false;
      } // Simple check to quickly interrupt scan on [link](url) at the start of line.
    // Can be useful on practice: https://github.com/markdown-it/markdown-it/issues/54


    while (++pos < max) {
      if (state.src.charCodeAt(pos) === 93
      /* ] */
      && state.src.charCodeAt(pos - 1) !== 92
      /* \ */
      ) {
          if (pos + 1 === max) {
            return false;
          }

          if (state.src.charCodeAt(pos + 1) !== 58
          /* : */
          ) {
              return false;
            }

          break;
        }
    }

    endLine = state.lineMax; // jump line-by-line until empty one or EOF

    terminatorRules = state.md.block.ruler.getRules("reference");
    oldParentType = state.parentType;
    state.parentType = "reference";

    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      // this would be a code block normally, but after paragraph
      // it's considered a lazy continuation regardless of what's there
      if (state.sCount[nextLine] - state.blkIndent > 3) {
        continue;
      } // quirk for blockquotes, this line should already be checked by that rule


      if (state.sCount[nextLine] < 0) {
        continue;
      } // Some tags can terminate paragraph without empty line.


      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        break;
      }
    }

    str = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
    max = str.length;

    for (pos = 1; pos < max; pos++) {
      ch = str.charCodeAt(pos);

      if (ch === 91
      /* [ */
      ) {
          return false;
        } else if (ch === 93
      /* ] */
      ) {
          labelEnd = pos;
          break;
        } else if (ch === 10
      /* \n */
      ) {
          lines++;
        } else if (ch === 92
      /* \ */
      ) {
          pos++;

          if (pos < max && str.charCodeAt(pos) === 10) {
            lines++;
          }
        }
    }

    if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58
    /* : */
    ) {
        return false;
      } // [label]:   destination   'title'
    //         ^^^ skip optional whitespace here


    for (pos = labelEnd + 2; pos < max; pos++) {
      ch = str.charCodeAt(pos);

      if (ch === 10) {
        lines++;
      } else if (isSpace$6(ch)) ;else {
        break;
      }
    } // [label]:   destination   'title'
    //            ^^^^^^^^^^^ parse this


    res = state.md.helpers.parseLinkDestination(str, pos, max);

    if (!res.ok) {
      return false;
    }

    href = state.md.normalizeLink(res.str);

    if (!state.md.validateLink(href)) {
      return false;
    }

    pos = res.pos;
    lines += res.lines; // save cursor state, we could require to rollback later

    destEndPos = pos;
    destEndLineNo = lines; // [label]:   destination   'title'
    //                       ^^^ skipping those spaces

    start = pos;

    for (; pos < max; pos++) {
      ch = str.charCodeAt(pos);

      if (ch === 10) {
        lines++;
      } else if (isSpace$6(ch)) ;else {
        break;
      }
    } // [label]:   destination   'title'
    //                          ^^^^^^^ parse this


    res = state.md.helpers.parseLinkTitle(str, pos, max);

    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      lines += res.lines;
    } else {
      title = "";
      pos = destEndPos;
      lines = destEndLineNo;
    } // skip trailing spaces until the rest of the line


    while (pos < max) {
      ch = str.charCodeAt(pos);

      if (!isSpace$6(ch)) {
        break;
      }

      pos++;
    }

    if (pos < max && str.charCodeAt(pos) !== 10) {
      if (title) {
        // garbage at the end of the line after title,
        // but it could still be a valid reference if we roll back
        title = "";
        pos = destEndPos;
        lines = destEndLineNo;

        while (pos < max) {
          ch = str.charCodeAt(pos);

          if (!isSpace$6(ch)) {
            break;
          }

          pos++;
        }
      }
    }

    if (pos < max && str.charCodeAt(pos) !== 10) {
      // garbage at the end of the line
      return false;
    }

    label = normalizeReference$2(str.slice(1, labelEnd));

    if (!label) {
      // CommonMark 0.20 disallows empty labels
      return false;
    } // Reference can not terminate anything. This check is for safety only.

    /*istanbul ignore if*/


    if (silent) {
      return true;
    }

    if (typeof state.env === "undefined") {
      state.env = {};
    }

    if (typeof state.env.references === "undefined") {
      state.env.references = {};
    }

    if (typeof state.env.references[label] === "undefined") {
      state.env.references[label] = {
        title: title,
        href: href
      };
    }

    state.parentType = oldParentType;
    state.line = startLine + lines + 1;
    return true;
  }; // heading (#, ##, ...)


  var isSpace$5 = utils.isSpace;
  var trimLeftOffset$2 = utils.trimLeftOffset;

  var heading = function heading(state, startLine, endLine, silent) {
    var ch,
        level,
        tmp,
        token,
        originalPos,
        originalMax,
        pos = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine]; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    ch = state.src.charCodeAt(pos);
    originalPos = pos;
    originalMax = max;

    if (ch !== 35
    /* # */
    || pos >= max) {
      return false;
    } // count heading level


    level = 1;
    ch = state.src.charCodeAt(++pos);

    while (ch === 35
    /* # */
    && pos < max && level <= 6) {
      level++;
      ch = state.src.charCodeAt(++pos);
    }

    if (level > 6 || pos < max && !isSpace$5(ch)) {
      return false;
    }

    if (silent) {
      return true;
    } // Let's cut tails like '    ###  ' from the end of string


    max = state.skipSpacesBack(max, pos);
    tmp = state.skipCharsBack(max, 35, pos); // #

    if (tmp > pos && isSpace$5(state.src.charCodeAt(tmp - 1))) {
      max = tmp;
    }

    state.line = startLine + 1;
    token = state.push("heading_open", "h" + String(level), 1);
    token.markup = "########".slice(0, level);
    token.map = [startLine, state.line];
    token.position = originalPos;
    token.size = pos - originalPos;
    var originalContent = state.src.slice(pos, max);
    token = state.push("inline", "", 0);
    token.content = originalContent.trim();
    token.map = [startLine, state.line];
    token.children = [];
    token.position = pos + trimLeftOffset$2(originalContent);
    token.size = token.content.length; // (max - pos) includes leading and trailing whitespace

    token = state.push("heading_close", "h" + String(level), -1);
    token.markup = "########".slice(0, level);
    token.position = max;
    token.size = originalMax - max;
    return true;
  }; // lheading (---, ===)


  var trimLeftOffset$1 = utils.trimLeftOffset;

  var lheading = function lheading(state, startLine, endLine
  /*, silent*/
  ) {
    var content,
        terminate,
        i,
        l,
        token,
        pos,
        max,
        level,
        marker,
        nextLine = startLine + 1,
        oldParentType,
        terminatorRules = state.md.block.ruler.getRules("paragraph"); // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    oldParentType = state.parentType;
    state.parentType = "paragraph"; // use paragraph to match terminatorRules
    // jump line-by-line until empty one or EOF

    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      // this would be a code block normally, but after paragraph
      // it's considered a lazy continuation regardless of what's there
      if (state.sCount[nextLine] - state.blkIndent > 3) {
        continue;
      } // Check for underline in setext header


      if (state.sCount[nextLine] >= state.blkIndent) {
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];

        if (pos < max) {
          marker = state.src.charCodeAt(pos);

          if (marker === 45
          /* - */
          || marker === 61
          /* = */
          ) {
              pos = state.skipChars(pos, marker);
              pos = state.skipSpaces(pos);

              if (pos >= max) {
                level = marker === 61
                /* = */
                ? 1 : 2;
                break;
              }
            }
        }
      } // quirk for blockquotes, this line should already be checked by that rule


      if (state.sCount[nextLine] < 0) {
        continue;
      } // Some tags can terminate paragraph without empty line.


      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        break;
      }
    }

    if (!level) {
      // Didn't find valid underline
      return false;
    }

    content = state.getLines(startLine, nextLine, state.blkIndent, false);
    state.line = nextLine + 1;
    token = state.push("heading_open", "h" + String(level), 1);
    token.markup = String.fromCharCode(marker);
    token.map = [startLine, state.line];
    token.position = state.bMarks[startLine];
    token.size = 0;
    token = state.push("inline", "", 0);
    token.content = content.trim();
    token.map = [startLine, state.line - 1];
    token.children = [];
    token.position = state.bMarks[startLine] + trimLeftOffset$1(content);
    token.size = token.content.length; // content.length includes leading and trailing whitespace

    token = state.push("heading_close", "h" + String(level), -1);
    token.markup = String.fromCharCode(marker);
    token.position = state.bMarks[state.line - 1];
    token.size = state.bMarks[state.line] - state.bMarks[state.line - 1];
    state.parentType = oldParentType;
    return true;
  }; // List of valid html blocks names, according to commonmark spec
  // http://jgm.github.io/CommonMark/spec.html#html-blocks


  var html_blocks = ["address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "section", "source", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul"]; // Regexps to match html elements

  var attr_name = "[a-zA-Z_:@][a-zA-Z0-9:._-]*";
  var unquoted = "[^\"'=<>`\\x00-\\x20]+";
  var single_quoted = "'[^']*'";
  var double_quoted = '"[^"]*"';
  var attr_value = "(?:" + unquoted + "|" + single_quoted + "|" + double_quoted + ")";
  var attribute = "(?:\\s+" + attr_name + "(?:\\s*=\\s*" + attr_value + ")?)";
  var open_tag = "<[A-Za-z][A-Za-z0-9\\-]*" + attribute + "*\\s*\\/?>";
  var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
  var comment = "\x3c!----\x3e|\x3c!--(?:-?[^>-])(?:-?[^-])*--\x3e";
  var processing = "<[?][\\s\\S]*?[?]>";
  var declaration = "<![A-Z]+\\s+[^>]*>";
  var cdata = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
  var HTML_TAG_RE$1 = new RegExp("^(?:" + open_tag + "|" + close_tag + "|" + comment + "|" + processing + "|" + declaration + "|" + cdata + ")");
  var HTML_OPEN_CLOSE_TAG_RE$1 = new RegExp("^(?:" + open_tag + "|" + close_tag + ")");
  var HTML_TAG_RE_1 = HTML_TAG_RE$1;
  var HTML_OPEN_CLOSE_TAG_RE_1 = HTML_OPEN_CLOSE_TAG_RE$1;
  var html_re = {
    HTML_TAG_RE: HTML_TAG_RE_1,
    HTML_OPEN_CLOSE_TAG_RE: HTML_OPEN_CLOSE_TAG_RE_1
  }; // HTML block

  var HTML_OPEN_CLOSE_TAG_RE = html_re.HTML_OPEN_CLOSE_TAG_RE; // An array of opening and corresponding closing sequences for html tags,
  // last argument defines whether it can terminate a paragraph or not

  var HTML_SEQUENCES = [[/^<(script|pre|style)(?=(\s|>|$))/i, /<\/(script|pre|style)>/i, true], [/^<!--/, /-->/, true], [/^<\?/, /\?>/, true], [/^<![A-Z]/, />/, true], [/^<!\[CDATA\[/, /\]\]>/, true], [new RegExp("^</?(?:" + html_blocks.join("|") + ")(?=(\\s|/?>|$))", "i"), /^$/, true], [new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + "\\s*$"), /^$/, false]];

  var html_block = function html_block(state, startLine, endLine, silent) {
    var i,
        nextLine,
        token,
        lineText,
        blockStart,
        pos = blockStart = state.bMarks[startLine] + state.tShift[startLine],
        max = state.eMarks[startLine]; // if it's indented more than 3 spaces, it should be a code block

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    if (!state.md.options.html) {
      return false;
    }

    if (state.src.charCodeAt(pos) !== 60
    /* < */
    ) {
        return false;
      }

    lineText = state.src.slice(pos, max);

    for (i = 0; i < HTML_SEQUENCES.length; i++) {
      if (HTML_SEQUENCES[i][0].test(lineText)) {
        break;
      }
    }

    if (i === HTML_SEQUENCES.length) {
      return false;
    }

    if (silent) {
      // true if this sequence can be a terminator, false otherwise
      return HTML_SEQUENCES[i][2];
    }

    nextLine = startLine + 1; // If we are here - we detected HTML block.
    // Let's roll down till block end.

    if (!HTML_SEQUENCES[i][1].test(lineText)) {
      for (; nextLine < endLine; nextLine++) {
        if (state.sCount[nextLine] < state.blkIndent) {
          break;
        }

        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        lineText = state.src.slice(pos, max);

        if (HTML_SEQUENCES[i][1].test(lineText)) {
          if (lineText.length !== 0) {
            nextLine++;
          }

          break;
        }
      }
    }

    state.line = nextLine;
    token = state.push("html_block", "", 0);
    token.map = [startLine, nextLine];
    token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
    token.position = blockStart;
    token.size = state.bMarks[nextLine] - blockStart;
    return true;
  }; // Paragraph


  var trimLeftOffset = utils.trimLeftOffset;

  var paragraph = function paragraph(state, startLine
  /*, endLine*/
  ) {
    var content,
        terminate,
        i,
        l,
        token,
        oldParentType,
        nextLine = startLine + 1,
        terminatorRules = state.md.block.ruler.getRules("paragraph"),
        endLine = state.lineMax,
        pos = state.bMarks[startLine];
    oldParentType = state.parentType;
    state.parentType = "paragraph"; // jump line-by-line until empty one or EOF

    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      // this would be a code block normally, but after paragraph
      // it's considered a lazy continuation regardless of what's there
      if (state.sCount[nextLine] - state.blkIndent > 3) {
        continue;
      } // quirk for blockquotes, this line should already be checked by that rule


      if (state.sCount[nextLine] < 0) {
        continue;
      } // Some tags can terminate paragraph without empty line.


      terminate = false;

      for (i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        break;
      }
    }

    content = state.getLines(startLine, nextLine, state.blkIndent, false);
    state.line = nextLine;
    token = state.push("paragraph_open", "p", 1);
    token.map = [startLine, state.line];
    token.position = pos;
    token.size = 0;
    token = state.push("inline", "", 0);
    token.content = content.trim();
    token.map = [startLine, state.line];
    token.children = [];
    token.position = pos + state.tShift[startLine] + trimLeftOffset(content);
    token.size = token.content.length;
    token = state.push("paragraph_close", "p", -1);
    token.size = 0;
    token.position = content.length + pos + state.tShift[startLine];
    state.parentType = oldParentType;
    return true;
  }; // Parser state class


  var isSpace$4 = utils.isSpace;

  function StateBlock(src, md, env, tokens) {
    var ch, s, start, pos, len, indent, offset, indent_found;
    this.src = src; // link to parser instance

    this.md = md;
    this.env = env;

    if (env) {
      env.state_block = this;
    } else {
      this.env = {
        state_block: this
      };
    } // Internal state vartiables


    this.tokens = tokens;
    this.bMarks = []; // line begin offsets for fast jumps

    this.eMarks = []; // line end offsets for fast jumps

    this.tShift = []; // offsets of the first non-space characters (tabs not expanded)

    this.sCount = []; // indents for each line (tabs expanded)
    // An amount of virtual spaces (tabs expanded) between beginning
    // of each line (bMarks) and real beginning of that line.
    // It exists only as a hack because blockquotes override bMarks
    // losing information in the process.
    // It's used only when expanding tabs, you can think about it as
    // an initial tab length, e.g. bsCount=21 applied to string `\t123`
    // means first tab should be expanded to 4-21%4 === 3 spaces.

    this.bsCount = []; // block parser variables

    this.blkIndent = 0; // required block content indent (for example, if we are
    // inside a list, it would be positioned after list marker)

    this.line = 0; // line index in src

    this.lineMax = 0; // lines count

    this.tight = false; // loose/tight mode for lists

    this.ddIndent = -1; // indent of the current dd block (-1 if there isn't any)

    this.listIndent = -1; // indent of the current list block (-1 if there isn't any)
    // can be 'blockquote', 'list', 'root', 'paragraph' or 'reference'
    // used in lists to determine if they interrupt a paragraph

    this.parentType = "root";
    this.level = 0; // renderer

    this.result = ""; // Create caches
    // Generate markers.

    s = this.src;
    indent_found = false;

    for (start = pos = indent = offset = 0, len = s.length; pos < len; pos++) {
      ch = s.charCodeAt(pos);

      if (!indent_found) {
        if (isSpace$4(ch)) {
          indent++;

          if (ch === 9) {
            offset += 4 - offset % 4;
          } else {
            offset++;
          }

          continue;
        } else {
          indent_found = true;
        }
      }

      if (ch === 10 || pos === len - 1) {
        if (ch !== 10) {
          pos++;
        }

        this.bMarks.push(start);
        this.eMarks.push(pos);
        this.tShift.push(indent);
        this.sCount.push(offset);
        this.bsCount.push(0);
        indent_found = false;
        indent = 0;
        offset = 0;
        start = pos + 1;
      }
    } // Push fake entry to simplify cache bounds checks


    this.bMarks.push(s.length);
    this.eMarks.push(s.length);
    this.tShift.push(0);
    this.sCount.push(0);
    this.bsCount.push(0);
    this.lineMax = this.bMarks.length - 1; // don't count last fake line
  } // Push new token to "stream".


  StateBlock.prototype.push = function (type, tag, nesting) {
    var token$1 = new token(type, tag, nesting);
    token$1.block = true;
    if (nesting < 0) this.level--; // closing tag

    token$1.level = this.level;
    if (nesting > 0) this.level++; // opening tag

    this.tokens.push(token$1);
    return token$1;
  };

  StateBlock.prototype.isEmpty = function isEmpty(line) {
    return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
  };

  StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
    for (var max = this.lineMax; from < max; from++) {
      if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
        break;
      }
    }

    return from;
  }; // Skip spaces from given position.


  StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
    var ch;

    for (var max = this.src.length; pos < max; pos++) {
      ch = this.src.charCodeAt(pos);

      if (!isSpace$4(ch)) {
        break;
      }
    }

    return pos;
  }; // Skip spaces from given position in reverse.


  StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
    if (pos <= min) {
      return pos;
    }

    while (pos > min) {
      if (!isSpace$4(this.src.charCodeAt(--pos))) {
        return pos + 1;
      }
    }

    return pos;
  }; // Skip char codes from given position


  StateBlock.prototype.skipChars = function skipChars(pos, code) {
    for (var max = this.src.length; pos < max; pos++) {
      if (this.src.charCodeAt(pos) !== code) {
        break;
      }
    }

    return pos;
  }; // Skip char codes reverse from given position - 1


  StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code, min) {
    if (pos <= min) {
      return pos;
    }

    while (pos > min) {
      if (code !== this.src.charCodeAt(--pos)) {
        return pos + 1;
      }
    }

    return pos;
  }; // cut lines range from source.


  StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
    var i,
        lineIndent,
        ch,
        first,
        last,
        queue,
        lineStart,
        line = begin;

    if (begin >= end) {
      return "";
    }

    queue = new Array(end - begin);

    for (i = 0; line < end; line++, i++) {
      lineIndent = 0;
      lineStart = first = this.bMarks[line];

      if (line + 1 < end || keepLastLF) {
        // No need for bounds check because we have fake entry on tail.
        last = this.eMarks[line] + 1;
      } else {
        last = this.eMarks[line];
      }

      while (first < last && lineIndent < indent) {
        ch = this.src.charCodeAt(first);

        if (isSpace$4(ch)) {
          if (ch === 9) {
            lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
          } else {
            lineIndent++;
          }
        } else if (first - lineStart < this.tShift[line]) {
          // patched tShift masked characters to look like spaces (blockquotes, list markers)
          lineIndent++;
        } else {
          break;
        }

        first++;
      }

      if (lineIndent > indent) {
        // partially expanding tabs in code blocks, e.g '\t\tfoobar'
        // with indent=2 becomes '  \tfoobar'
        queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
      } else {
        queue[i] = this.src.slice(first, last);
      }
    }

    return queue.join("");
  }; // re-export Token class to use in block rules


  StateBlock.prototype.Token = token;
  var state_block = StateBlock;
  /** internal
   * class ParserBlock
   *
   * Block-level tokenizer.
   **/

  var _rules$1 = [// First 2 params - rule name & source. Secondary array - list of rules,
  // which can be terminated by this one.
  ["table", table, ["paragraph", "reference"]], ["code", code], ["fence", fence, ["paragraph", "reference", "blockquote", "list"]], ["blockquote", blockquote, ["paragraph", "reference", "blockquote", "list"]], ["hr", hr, ["paragraph", "reference", "blockquote", "list"]], ["list", list, ["paragraph", "reference", "blockquote", "table"]], ["reference", reference], ["heading", heading, ["paragraph", "reference", "blockquote"]], ["lheading", lheading], ["html_block", html_block, ["paragraph", "reference", "blockquote"]], ["paragraph", paragraph]];
  /**
   * new ParserBlock()
   **/

  function ParserBlock() {
    /**
     * ParserBlock#ruler -> Ruler
     *
     * [[Ruler]] instance. Keep configuration of block rules.
     **/
    this.ruler = new ruler();

    for (var i = 0; i < _rules$1.length; i++) {
      this.ruler.push(_rules$1[i][0], _rules$1[i][1], {
        alt: (_rules$1[i][2] || []).slice()
      });
    }
  } // Generate tokens for input range


  ParserBlock.prototype.tokenize = function (state, startLine, endLine) {
    var ok,
        i,
        rules = this.ruler.getRules(""),
        len = rules.length,
        line = startLine,
        hasEmptyLines = false,
        maxNesting = state.md.options.maxNesting;

    while (line < endLine) {
      state.line = line = state.skipEmptyLines(line);

      if (line >= endLine) {
        break;
      } // Termination condition for nested calls.
      // Nested calls currently used for blockquotes & lists


      if (state.sCount[line] < state.blkIndent) {
        break;
      } // If nesting level exceeded - skip tail to the end. That's not ordinary
      // situation and we should not care about content.


      if (state.level >= maxNesting) {
        state.line = endLine;
        break;
      } // Try all possible rules.
      // On success, rule should:
      // - update `state.line`
      // - update `state.tokens`
      // - return true


      for (i = 0; i < len; i++) {
        ok = rules[i](state, line, endLine, false);

        if (ok) {
          break;
        }
      } // set state.tight if we had an empty line before current tag
      // i.e. latest empty line should not count


      state.tight = !hasEmptyLines; // paragraph might "eat" one newline after it in nested lists

      if (state.isEmpty(state.line - 1)) {
        hasEmptyLines = true;
      }

      line = state.line;

      if (line < endLine && state.isEmpty(line)) {
        hasEmptyLines = true;
        line++;
        state.line = line;
      }
    }
  };
  /**
   * ParserBlock.parse(str, md, env, outTokens)
   *
   * Process input string and push block tokens into `outTokens`
   **/


  ParserBlock.prototype.parse = function (src, md, env, outTokens) {
    var state;

    if (!src) {
      return;
    }

    state = new this.State(src, md, env, outTokens);
    this.tokenize(state, state.line, state.lineMax);
  };

  ParserBlock.prototype.State = state_block;
  var parser_block = ParserBlock; // Handle implicit links found by rules_core/linkify that were not yet
  // subsumed by other inline rules (backticks, link, etc.)

  var tokenize$2 = function linkify(state, silent) {
    var link, url, fullUrl, urlText, token;

    if (state.links) {
      link = state.links[state.pos];
    }

    if (!link) {
      return false;
    }

    url = link.url;
    fullUrl = state.md.normalizeLink(url);

    if (!state.md.validateLink(fullUrl)) {
      return false;
    }

    urlText = link.text; // Linkifier might send raw hostnames like "example.com", where url
    // starts with domain name. So we prepend http:// in those cases,
    // and remove it afterwards.

    if (!link.schema) {
      urlText = state.md.normalizeLinkText("http://" + urlText).replace(/^http:\/\//, "");
    } else if (link.schema === "mailto:" && !/^mailto:/i.test(urlText)) {
      urlText = state.md.normalizeLinkText("mailto:" + urlText).replace(/^mailto:/, "");
    } else {
      urlText = state.md.normalizeLinkText(urlText);
    }

    if (!silent) {
      token = state.push("link_open", "a", 1);
      token.attrs = [["href", fullUrl]];
      token.markup = "linkify";
      token.info = "auto"; // TODO: position + size

      token = state.push("text", "", 0);
      token.content = urlText;
      token = state.push("link_close", "a", -1);
      token.markup = "linkify";
      token.info = "auto";
      token.position = link.lastIndex;
      token.size = 0;
    }

    state.pos = link.lastIndex;
    return true;
  }; // Set state.links to an index from position to links, if links found


  var preProcess = function linkify(state) {
    var links, i;

    if (!state.md.options.linkify || !state.md.linkify.pretest(state.src)) {
      return;
    }

    links = state.md.linkify.match(state.src);

    if (!links || !links.length) {
      return;
    }

    state.links = {};

    for (i = 0; i < links.length; i++) {
      state.links[links[i].index] = links[i];
    }
  };

  function isLinkOpen(str) {
    return /^<a[>\s]/i.test(str);
  }

  function isLinkClose(str) {
    return /^<\/a\s*>/i.test(str);
  } // Remove linkify links if already inside


  var postProcess$2 = function linkify(state) {
    var i,
        len,
        token,
        linkLevel = 0,
        htmlLinkLevel = 0;
    len = state.tokens.length;

    for (i = 0; i < len; i++) {
      token = state.tokens[i]; // Transform into empty tokens any linkify open/close tags inside links

      if (token.markup === "linkify") {
        if (linkLevel > 0 || htmlLinkLevel > 0) {
          if (token.type === "link_open") {
            state.tokens[i + 1].level--;
          }

          token.type = "text";
          token.attrs = token.markup = token.info = null;
          token.nesting = 0;
          token.content = "";
        }

        continue;
      } // Skip content of markdown links


      if (token.type === "link_open") {
        linkLevel++;
      } else if (token.type === "link_close" && linkLevel > 0) {
        linkLevel--;
      } // Skip content of html tag links


      if (token.type === "html_inline") {
        if (isLinkOpen(token.content)) {
          htmlLinkLevel++;
        }

        if (isLinkClose(token.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
      }
    }
  };

  var linkify = {
    tokenize: tokenize$2,
    preProcess: preProcess,
    postProcess: postProcess$2
  }; // Skip text characters for text token, place those to pending buffer
  // and increment current pos
  // Rule to skip pure text
  // '{}$%@~+=:' reserved for extentions
  // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
  // !!!! Don't confuse with "Markdown ASCII Punctuation" chars
  // http://spec.commonmark.org/0.15/#ascii-punctuation-character

  function isTerminatorChar(ch) {
    switch (ch) {
      case 10
      /* \n */
      :
      case 33
      /* ! */
      :
      case 35
      /* # */
      :
      case 36
      /* $ */
      :
      case 37
      /* % */
      :
      case 38
      /* & */
      :
      case 42
      /* * */
      :
      case 43
      /* + */
      :
      case 45
      /* - */
      :
      case 58
      /* : */
      :
      case 60
      /* < */
      :
      case 61
      /* = */
      :
      case 62
      /* > */
      :
      case 64
      /* @ */
      :
      case 91
      /* [ */
      :
      case 92
      /* \ */
      :
      case 47
      /* / */
      :
      case 93
      /* ] */
      :
      case 94
      /* ^ */
      :
      case 95
      /* _ */
      :
      case 96
      /* ` */
      :
      case 123
      /* { */
      :
      case 124
      /* | */
      :
      case 125
      /* } */
      :
      case 126
      /* ~ */
      :
        return true;

      default:
        return false;
    }
  }

  var text = function text(state, silent) {
    var pos = state.pos;
    var terminatorRe = state.md.options.inlineTokenTerminatorsRe;

    if (!terminatorRe) {
      while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos)) && (!state.links || !state.links[pos])) {
        pos++;
      }
    } else {
      while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos)) && !terminatorRe.test(state.src[pos]) && (!state.links || !state.links[pos])) {
        pos++;
      }
    }

    if (pos === state.pos) {
      return false;
    }

    if (!silent) {
      state.pending += state.src.slice(state.pos, pos);
    }

    state.pos = pos;
    return true;
  }; // Process '\n'


  var isSpace$3 = utils.isSpace;

  var newline = function newline(state, silent) {
    var pmax,
        max,
        pos = state.pos;

    if (state.src.charCodeAt(pos) !== 10
    /* \n */
    ) {
        return false;
      }

    pmax = state.pending.length - 1;
    max = state.posMax; // '  \n' -> hardbreak
    // Lookup in pending chars is bad practice! Don't copy to other rules!
    // Pending string is stored in concat mode, indexed lookups will cause
    // convertion to flat mode.

    if (!silent) {
      var _token;

      if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
        if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
          state.pending = state.pending.replace(/ +$/, "");
          _token = state.push("hardbreak", "br", 0);
        } else {
          state.pending = state.pending.slice(0, -1);
          _token = state.push("softbreak", "br", 0);
        }
      } else {
        _token = state.push("softbreak", "br", 0);
      }

      _token.position = pos;
      _token.size = 1;
    }

    pos++; // skip heading spaces for next line

    while (pos < max && isSpace$3(state.src.charCodeAt(pos))) {
      pos++;
    }

    state.pos = pos;
    return true;
  }; // Process escaped chars and hardbreaks


  var isSpace$2 = utils.isSpace;
  var ESCAPED = [];

  for (var i = 0; i < 256; i++) {
    ESCAPED.push(0);
  }

  "\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function (ch) {
    ESCAPED[ch.charCodeAt(0)] = 1;
  });

  var _escape = function escape(state, silent) {
    var ch,
        pos = state.pos,
        max = state.posMax;

    if (state.src.charCodeAt(pos) !== 92
    /* \ */
    ) {
        return false;
      }

    pos++;

    if (pos < max) {
      ch = state.src.charCodeAt(pos);

      if (ch < 256 && ESCAPED[ch] !== 0) {
        if (!silent) {
          state.pending += state.src[pos];
        }

        state.pos += 2;
        return true;
      }

      if (ch === 10) {
        if (!silent) {
          var _token2 = state.push("hardbreak", "br", 0);

          _token2.position = pos;
          _token2.size = 1;
        }

        pos++; // skip leading whitespaces from next line

        while (pos < max) {
          ch = state.src.charCodeAt(pos);

          if (!isSpace$2(ch)) {
            break;
          }

          pos++;
        }

        state.pos = pos;
        return true;
      }
    }

    if (!silent) {
      state.pending += "\\";
    }

    state.pos++;
    return true;
  }; // Parse backticks


  var backticks = function backtick(state, silent) {
    var start,
        max,
        marker,
        token,
        matchStart,
        matchEnd,
        openerLength,
        closerLength,
        pos = state.pos,
        ch = state.src.charCodeAt(pos);

    if (ch !== 96
    /* ` */
    ) {
        return false;
      }

    start = pos;
    pos++;
    max = state.posMax; // scan marker length

    while (pos < max && state.src.charCodeAt(pos) === 96
    /* ` */
    ) {
      pos++;
    }

    marker = state.src.slice(start, pos);
    openerLength = marker.length;

    if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
      if (!silent) state.pending += marker;
      state.pos += openerLength;
      return true;
    }

    matchStart = matchEnd = pos; // Nothing found in the cache, scan until the end of the line (or until marker is found)

    while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
      matchEnd = matchStart + 1; // scan marker length

      while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96
      /* ` */
      ) {
        matchEnd++;
      }

      closerLength = matchEnd - matchStart;

      if (closerLength === openerLength) {
        // Found matching closer length.
        if (!silent) {
          token = state.push("code_inline", "code", 0);
          token.markup = marker;
          var originalContent = state.src.slice(pos, matchStart);
          token.content = originalContent.replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
          token.position = pos + (originalContent.length - token.content.length) / 2;
          token.size = token.content.length;
        }

        state.pos = matchEnd;
        return true;
      } // Some different length found, put it in cache as upper limit of where closer can be found


      state.backticks[closerLength] = matchStart;
    } // Scanned through the end, didn't find anything


    state.backticksScanned = true;
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true;
  }; // ~~strike through~~


  var getLineOffset$2 = utils.getLineOffset; // Insert each marker as a separate text token, and add it to delimiter list

  var tokenize$1 = function strikethrough(state, silent) {
    var i,
        scanned,
        token,
        len,
        ch,
        offset,
        start = state.pos,
        marker = state.src.charCodeAt(start);

    if (silent) {
      return false;
    }

    if (marker !== 126
    /* ~ */
    ) {
        return false;
      }

    scanned = state.scanDelims(state.pos, true);
    len = scanned.length;
    ch = String.fromCharCode(marker);

    if (len < 2) {
      return false;
    }

    offset = 0;

    if (len % 2) {
      token = state.push("text", "", 0);
      token.content = ch;
      token.position = start;
      token.size = 1;
      offset = 1;
      len--;
    }

    for (i = 0; i < len; i += 2) {
      token = state.push("text", "", 0);
      token.content = ch + ch;
      token.position = start + i + offset;
      token.size = 2;
      state.delimiters.push({
        marker: marker,
        position: start,
        length: 0,
        // disable "rule of 3" length checks meant for emphasis
        jump: i / 2,
        // for `~~` 1 marker = 2 characters
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close
      });
    }

    state.pos += scanned.length;
    return true;
  };

  function postProcess$1(state, delimiters) {
    var i,
        j,
        startDelim,
        endDelim,
        token,
        loneMarkers = [],
        max = delimiters.length;

    for (i = 0; i < max; i++) {
      startDelim = delimiters[i];

      if (startDelim.marker !== 126
      /* ~ */
      ) {
          continue;
        }

      if (startDelim.end === -1) {
        continue;
      }

      endDelim = delimiters[startDelim.end];
      token = state.tokens[startDelim.token];
      token.type = "s_open";
      token.tag = "s";
      token.nesting = 1;
      token.markup = "~~";
      token.content = "";
      token.position = startDelim.position + getLineOffset$2(state, startDelim.token);
      token = state.tokens[endDelim.token];
      token.type = "s_close";
      token.tag = "s";
      token.nesting = -1;
      token.markup = "~~";
      token.content = "";

      if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") {
        loneMarkers.push(endDelim.token - 1);
      }
    } // If a marker sequence has an odd number of characters, it's splitted
    // like this: `~~~~~` -> `~` + `~~` + `~~`, leaving one marker at the
    // start of the sequence.
    // So, we have to move all those markers after subsequent s_close tags.


    while (loneMarkers.length) {
      i = loneMarkers.pop();
      j = i + 1;

      while (j < state.tokens.length && state.tokens[j].type === "s_close") {
        j++;
      }

      j--;

      if (i !== j) {
        token = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token;
      }
    }
  } // Walk through delimiter list and replace text tokens with tags


  var postProcess_1$1 = function strikethrough(state) {
    var curr,
        tokens_meta = state.tokens_meta,
        max = state.tokens_meta.length;
    postProcess$1(state, state.delimiters);

    for (curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        postProcess$1(state, tokens_meta[curr].delimiters);
      }
    }
  };

  var strikethrough = {
    tokenize: tokenize$1,
    postProcess: postProcess_1$1
  }; // Process *this* and _that_

  var getLineOffset$1 = utils.getLineOffset; // Insert each marker as a separate text token, and add it to delimiter list

  var tokenize = function emphasis(state, silent) {
    var i,
        scanned,
        token,
        start = state.pos,
        marker = state.src.charCodeAt(start);

    if (silent) {
      return false;
    }

    if (marker !== 95
    /* _ */
    && marker !== 42
    /* * */
    ) {
        return false;
      }

    scanned = state.scanDelims(state.pos, marker === 42);

    for (i = 0; i < scanned.length; i++) {
      token = state.push("text", "", 0);
      token.content = String.fromCharCode(marker);
      token.position = state.pos;
      token.size = token.content.length;
      state.delimiters.push({
        position: state.pos,
        // Char code of the starting marker (number).
        marker: marker,
        // Total length of these series of delimiters.
        length: scanned.length,
        // An amount of characters before this one that's equivalent to
        // current one. In plain English: if this delimiter does not open
        // an emphasis, neither do previous `jump` characters.
        // Used to skip sequences like "*****" in one step, for 1st asterisk
        // value will be 0, for 2nd it's 1 and so on.
        jump: i,
        // A position of the token this delimiter corresponds to.
        token: state.tokens.length - 1,
        // If this delimiter is matched as a valid opener, `end` will be
        // equal to its position, otherwise it's `-1`.
        end: -1,
        // Boolean flags that determine if this delimiter could open or close
        // an emphasis.
        open: scanned.can_open,
        close: scanned.can_close
      });
    }

    state.pos += scanned.length;
    return true;
  };

  function postProcess(state, delimiters) {
    var i,
        startDelim,
        endDelim,
        token,
        ch,
        isStrong,
        max = delimiters.length;

    for (i = max - 1; i >= 0; i--) {
      startDelim = delimiters[i];

      if (startDelim.marker !== 95
      /* _ */
      && startDelim.marker !== 42
      /* * */
      ) {
          continue;
        } // Process only opening markers


      if (startDelim.end === -1) {
        continue;
      }

      endDelim = delimiters[startDelim.end]; // If the previous delimiter has the same marker and is adjacent to this one,
      // merge those into one strong delimiter.
      // `<em><em>whatever</em></em>` -> `<strong>whatever</strong>`

      isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && delimiters[i - 1].token === startDelim.token - 1 && delimiters[startDelim.end + 1].token === endDelim.token + 1 && delimiters[i - 1].marker === startDelim.marker;
      ch = String.fromCharCode(startDelim.marker);
      token = state.tokens[startDelim.token];
      token.type = isStrong ? "strong_open" : "em_open";
      token.tag = isStrong ? "strong" : "em";
      token.nesting = 1;
      token.markup = isStrong ? ch + ch : ch;
      token.content = "";
      token.position = startDelim.position + getLineOffset$1(state, startDelim.token);
      token = state.tokens[endDelim.token];
      token.type = isStrong ? "strong_close" : "em_close";
      token.tag = isStrong ? "strong" : "em";
      token.nesting = -1;
      token.markup = isStrong ? ch + ch : ch;
      token.content = "";

      if (isStrong) {
        state.tokens[delimiters[i - 1].token].content = "";
        state.tokens[delimiters[startDelim.end + 1].token].content = "";
        i--;
      }
    }
  } // Walk through delimiter list and replace text tokens with tags


  var postProcess_1 = function emphasis(state) {
    var curr,
        tokens_meta = state.tokens_meta,
        max = state.tokens_meta.length;
    postProcess(state, state.delimiters);

    for (curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        postProcess(state, tokens_meta[curr].delimiters);
      }
    }
  };

  var emphasis = {
    tokenize: tokenize,
    postProcess: postProcess_1
  }; // Process [link](<to> "stuff")

  var normalizeReference$1 = utils.normalizeReference;
  var isSpace$1 = utils.isSpace;

  var link = function link(state, silent) {
    var attrs,
        code,
        label,
        labelEnd,
        labelStart,
        pos,
        res,
        ref,
        token,
        href = "",
        title = "",
        oldPos = state.pos,
        max = state.posMax,
        start = state.pos,
        parseReference = true;

    if (state.src.charCodeAt(state.pos) !== 91
    /* [ */
    ) {
        return false;
      }

    labelStart = state.pos + 1;
    labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true); // parser failed to find ']', so it's not a valid link

    if (labelEnd < 0) {
      return false;
    }

    pos = labelEnd + 1;

    if (pos < max && state.src.charCodeAt(pos) === 40
    /* ( */
    ) {
        // Inline link
        // might have found a valid shortcut link, disable reference parsing
        parseReference = false; // [link](  <href>  "title"  )
        //        ^^ skipping these spaces

        pos++;

        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);

          if (!isSpace$1(code) && code !== 10) {
            break;
          }
        }

        if (pos >= max) {
          return false;
        } // [link](  <href>  "title"  )
        //          ^^^^^^ parsing link destination


        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);

        if (res.ok) {
          href = state.md.normalizeLink(res.str);

          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = "";
          } // [link](  <href>  "title"  )
          //                ^^ skipping these spaces


          start = pos;

          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);

            if (!isSpace$1(code) && code !== 10) {
              break;
            }
          } // [link](  <href>  "title"  )
          //                  ^^^^^^^ parsing link title


          res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);

          if (pos < max && start !== pos && res.ok) {
            title = res.str;
            pos = res.pos; // [link](  <href>  "title"  )
            //                         ^^ skipping these spaces

            for (; pos < max; pos++) {
              code = state.src.charCodeAt(pos);

              if (!isSpace$1(code) && code !== 10) {
                break;
              }
            }
          }
        }

        if (pos >= max || state.src.charCodeAt(pos) !== 41
        /* ) */
        ) {
            // parsing a valid shortcut link failed, fallback to reference
            parseReference = true;
          }

        pos++;
      }

    if (parseReference) {
      // Link reference
      if (typeof state.env === "undefined" || typeof state.env.references === "undefined") {
        return false;
      }

      if (pos < max && state.src.charCodeAt(pos) === 91
      /* [ */
      ) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);

          if (pos >= 0) {
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
          }
        } else {
        pos = labelEnd + 1;
      } // covers label === '' and label === undefined
      // (collapsed reference link and shortcut reference link respectively)


      if (!label) {
        label = state.src.slice(labelStart, labelEnd);
      }

      ref = state.env.references[normalizeReference$1(label)];

      if (!ref) {
        state.pos = oldPos;
        return false;
      }

      href = ref.href;
      title = ref.title;
    } // We found the end of the link, and know for a fact it's a valid link;
    // so all that's left to do is to call tokenizer.


    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;
      token = state.push("link_open", "a", 1);
      token.position = labelStart - 1;
      token.size = pos - token.position;
      token.attrs = attrs = [["href", href]];

      if (title) {
        attrs.push(["title", title]);
      }

      state.md.inline.tokenize(state, labelStart);
      token = state.push("link_close", "a", -1);
      token.position = pos;
      token.size = 0;
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  }; // Process ![image](<src> "title")


  var normalizeReference = utils.normalizeReference;
  var isSpace = utils.isSpace;

  var image = function image(state, silent) {
    var attrs,
        code,
        content,
        label,
        labelEnd,
        labelStart,
        pos,
        ref,
        res,
        title,
        token,
        tokens,
        start,
        href = "",
        oldPos = state.pos,
        max = state.posMax,
        endPos = state.pos;

    if (state.src.charCodeAt(state.pos) !== 33
    /* ! */
    ) {
        return false;
      }

    if (state.src.charCodeAt(state.pos + 1) !== 91
    /* [ */
    ) {
        return false;
      }

    labelStart = state.pos + 2;
    labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false); // parser failed to find ']', so it's not a valid link

    if (labelEnd < 0) {
      return false;
    }

    if (state.pending) {
      state.pushPending();
    }

    pos = labelEnd + 1;

    if (pos < max && state.src.charCodeAt(pos) === 40
    /* ( */
    ) {
        // Inline link
        // [link](  <href>  "title"  )
        //        ^^ skipping these spaces
        pos++;

        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);

          if (!isSpace(code) && code !== 10) {
            break;
          }
        }

        if (pos >= max) {
          return false;
        } // [link](  <href>  "title"  )
        //          ^^^^^^ parsing link destination


        start = pos;
        res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);

        if (res.ok) {
          href = state.md.normalizeLink(res.str);

          if (state.md.validateLink(href)) {
            pos = res.pos;
          } else {
            href = "";
          }
        } // [link](  <href>  "title"  )
        //                ^^ skipping these spaces


        start = pos;

        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);

          if (!isSpace(code) && code !== 10) {
            break;
          }
        } // [link](  <href>  "title"  )
        //                  ^^^^^^^ parsing link title


        res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);

        if (pos < max && start !== pos && res.ok) {
          title = res.str;
          pos = res.pos; // [link](  <href>  "title"  )
          //                         ^^ skipping these spaces

          for (; pos < max; pos++) {
            code = state.src.charCodeAt(pos);

            if (!isSpace(code) && code !== 10) {
              break;
            }
          }
        } else {
          title = "";
        }

        if (pos >= max || state.src.charCodeAt(pos) !== 41
        /* ) */
        ) {
            state.pos = oldPos;
            return false;
          }

        endPos = pos;
        pos++;
      } else {
      // Link reference
      if (typeof state.env === "undefined" || typeof state.env.references === "undefined") {
        return false;
      }

      if (pos < max && state.src.charCodeAt(pos) === 91
      /* [ */
      ) {
          start = pos + 1;
          pos = state.md.helpers.parseLinkLabel(state, pos);

          if (pos >= 0) {
            endPos = pos;
            label = state.src.slice(start, pos++);
          } else {
            pos = labelEnd + 1;
            endPos = pos;
          }
        } else {
        pos = labelEnd + 1;
        endPos = pos;
      } // covers label === '' and label === undefined
      // (collapsed reference link and shortcut reference link respectively)


      if (!label) {
        label = state.src.slice(labelStart, labelEnd);
      }

      ref = state.env.references[normalizeReference(label)];

      if (!ref) {
        state.pos = oldPos;
        return false;
      }

      href = ref.href;
      title = ref.title;
    } // We found the end of the link, and know for a fact it's a valid link;
    // so all that's left to do is to call tokenizer.


    if (!silent) {
      content = state.src.slice(labelStart, labelEnd);
      state.md.inline.parse(content, state.md, state.env, tokens = []);
      token = state.push("image", "img", 0);
      token.attrs = attrs = [["src", href], ["alt", ""]];
      token.children = tokens;
      token.content = content;
      token.position = oldPos;
      token.size = endPos - oldPos + 1;

      if (title) {
        attrs.push(["title", title]);
      }
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  }; // Process autolinks '<protocol:...>'

  /*eslint max-len:0*/


  var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
  var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.\-]{1,31}):([^<>\x00-\x20]*)$/;

  var autolink = function autolink(state, silent) {
    var url,
        fullUrl,
        token,
        start,
        max,
        pos = state.pos;

    if (state.src.charCodeAt(pos) !== 60
    /* < */
    ) {
        return false;
      }

    start = state.pos;
    max = state.posMax;

    for (;;) {
      if (++pos >= max) return false;
      var ch = state.src.charCodeAt(pos);
      if (ch === 60
      /* < */
      ) return false;
      if (ch === 62
      /* > */
      ) break;
    }

    url = state.src.slice(start + 1, pos);

    if (AUTOLINK_RE.test(url)) {
      fullUrl = state.md.normalizeLink(url);

      if (!state.md.validateLink(fullUrl)) {
        return false;
      }

      if (!silent) {
        token = state.push("link_open", "a", 1);
        token.attrs = [["href", fullUrl]];
        token.markup = "autolink";
        token.info = "auto";
        token.position = start;
        token.size = pos - start + 2;
        token = state.push("text", "", 0);
        token.content = state.md.normalizeLinkText(url);
        token.position = start + 1;
        token.size = pos - start;
        token = state.push("link_close", "a", -1);
        token.markup = "autolink";
        token.info = "auto";
        token.position = pos;
        token.size = 0;
      }

      state.pos = pos + 1;
      return true;
    }

    if (EMAIL_RE.test(url)) {
      fullUrl = state.md.normalizeLink("mailto:" + url);

      if (!state.md.validateLink(fullUrl)) {
        return false;
      }

      if (!silent) {
        token = state.push("link_open", "a", 1);
        token.attrs = [["href", fullUrl]];
        token.markup = "autolink";
        token.info = "auto";
        token.position = start;
        token.size = pos - start + 2;
        token = state.push("text", "", 0);
        token.content = state.md.normalizeLinkText(url);
        token.position = start + 1;
        token.size = pos - start;
        token = state.push("link_close", "a", -1);
        token.markup = "autolink";
        token.info = "auto";
        token.position = pos;
        token.size = 0;
      }

      state.pos = pos + 1;
      return true;
    }

    return false;
  }; // Process html tags


  var HTML_TAG_RE = html_re.HTML_TAG_RE;

  function isLetter(ch) {
    /*eslint no-bitwise:0*/
    var lc = ch | 32; // to lower case

    return lc >= 97
    /* a */
    && lc <= 122
    /* z */
    ;
  }

  var html_inline = function html_inline(state, silent) {
    var ch,
        match,
        max,
        token,
        pos = state.pos;

    if (!state.md.options.html) {
      return false;
    } // Check start


    max = state.posMax;

    if (state.src.charCodeAt(pos) !== 60
    /* < */
    || pos + 2 >= max) {
      return false;
    } // Quick fail on second char


    ch = state.src.charCodeAt(pos + 1);

    if (ch !== 33
    /* ! */
    && ch !== 63
    /* ? */
    && ch !== 47
    /* / */
    && !isLetter(ch)) {
      return false;
    }

    match = state.src.slice(pos).match(HTML_TAG_RE);

    if (!match) {
      return false;
    }

    if (!silent) {
      token = state.push("html_inline", "", 0);
      token.content = state.src.slice(pos, pos + match[0].length);
      token.position = state.pos;
      token.size = match[0].length;
    }

    state.pos += match[0].length;
    return true;
  }; // Process html entity - &#123;, &#xAF;, &quot;, ...


  var has = utils.has;
  var isValidEntityCode = utils.isValidEntityCode;
  var fromCodePoint = utils.fromCodePoint;
  var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
  var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;

  var entity = function entity(state, silent) {
    var ch,
        code,
        match,
        pos = state.pos,
        max = state.posMax;

    if (state.src.charCodeAt(pos) !== 38
    /* & */
    ) {
        return false;
      }

    if (pos + 1 < max) {
      ch = state.src.charCodeAt(pos + 1);

      if (ch === 35
      /* # */
      ) {
          match = state.src.slice(pos).match(DIGITAL_RE);

          if (match) {
            if (!silent) {
              code = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
              state.pending += isValidEntityCode(code) ? fromCodePoint(code) : fromCodePoint(65533);
            }

            state.pos += match[0].length;
            return true;
          }
        } else {
        match = state.src.slice(pos).match(NAMED_RE);

        if (match) {
          if (has(entities, match[1])) {
            if (!silent) {
              state.pending += entities[match[1]];
            }

            state.pos += match[0].length;
            return true;
          }
        }
      }
    }

    if (!silent) {
      state.pending += "&";
    }

    state.pos++;
    return true;
  }; // For each opening emphasis-like marker find a matching closing one


  function processDelimiters(state, delimiters) {
    var closerIdx,
        openerIdx,
        closer,
        opener,
        minOpenerIdx,
        newMinOpenerIdx,
        isOddMatch,
        lastJump,
        openersBottom = {},
        max = delimiters.length;

    for (closerIdx = 0; closerIdx < max; closerIdx++) {
      closer = delimiters[closerIdx]; // Length is only used for emphasis-specific "rule of 3",
      // if it's not defined (in strikethrough or 3rd party plugins),
      // we can default it to 0 to disable those checks.

      closer.length = closer.length || 0;
      if (!closer.close) continue; // Previously calculated lower bounds (previous fails)
      // for each marker and each delimiter length modulo 3.

      if (!Object.prototype.hasOwnProperty.call(openersBottom, closer.marker)) {
        openersBottom[closer.marker] = [-1, -1, -1];
      }

      minOpenerIdx = openersBottom[closer.marker][closer.length % 3];
      openerIdx = closerIdx - closer.jump - 1; // avoid crash if `closer.jump` is pointing outside of the array, see #742

      if (openerIdx < -1) openerIdx = -1;
      newMinOpenerIdx = openerIdx;

      for (; openerIdx > minOpenerIdx; openerIdx -= opener.jump + 1) {
        opener = delimiters[openerIdx];
        if (opener.marker !== closer.marker) continue;

        if (opener.open && opener.end < 0) {
          isOddMatch = false; // from spec:
          // If one of the delimiters can both open and close emphasis, then the
          // sum of the lengths of the delimiter runs containing the opening and
          // closing delimiters must not be a multiple of 3 unless both lengths
          // are multiples of 3.

          if (opener.close || closer.open) {
            if ((opener.length + closer.length) % 3 === 0) {
              if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
                isOddMatch = true;
              }
            }
          }

          if (!isOddMatch) {
            // If previous delimiter cannot be an opener, we can safely skip
            // the entire sequence in future checks. This is required to make
            // sure algorithm has linear complexity (see *_*_*_*_*_... case).
            lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? delimiters[openerIdx - 1].jump + 1 : 0;
            closer.jump = closerIdx - openerIdx + lastJump;
            closer.open = false;
            opener.end = closerIdx;
            opener.jump = lastJump;
            opener.close = false;
            newMinOpenerIdx = -1;
            break;
          }
        }
      }

      if (newMinOpenerIdx !== -1) {
        // If match for this delimiter run failed, we want to set lower bound for
        // future lookups. This is required to make sure algorithm has linear
        // complexity.
        // See details here:
        // https://github.com/commonmark/cmark/issues/178#issuecomment-270417442
        openersBottom[closer.marker][(closer.length || 0) % 3] = newMinOpenerIdx;
      }
    }
  }

  var balance_pairs = function link_pairs(state) {
    var curr,
        tokens_meta = state.tokens_meta,
        max = state.tokens_meta.length;
    processDelimiters(state, state.delimiters);

    for (curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        processDelimiters(state, tokens_meta[curr].delimiters);
      }
    }
  }; // Clean up tokens after emphasis and strikethrough postprocessing:
  // merge adjacent text nodes into one and re-calculate all token levels
  // This is necessary because initially emphasis delimiter markers (*, _, ~)
  // are treated as their own separate text tokens. Then emphasis rule either
  // leaves them as text (needed to merge with adjacent text) or turns them
  // into opening/closing tags (which messes up levels inside).


  var text_collapse = function text_collapse(state) {
    var curr,
        last,
        level = 0,
        tokens = state.tokens,
        max = state.tokens.length;

    for (curr = last = 0; curr < max; curr++) {
      // re-calculate levels after emphasis/strikethrough turns some text nodes
      // into opening/closing tags
      if (tokens[curr].nesting < 0) level--; // closing tag

      tokens[curr].level = level;
      if (tokens[curr].nesting > 0) level++; // opening tag

      if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
        // collapse two adjacent text nodes
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content; // only move foward position when it has content

        if (tokens[curr].content) {
          tokens[curr + 1].position = tokens[curr].position;
        } // add up size


        tokens[curr + 1].size = tokens[curr].size + tokens[curr + 1].size;
      } else {
        if (curr !== last) {
          tokens[last] = tokens[curr];
        }

        last++;
      }
    }

    if (curr !== last) {
      tokens.length = last;
    }
  }; // Inline parser state


  var isWhiteSpace = utils.isWhiteSpace;
  var isPunctChar = utils.isPunctChar;
  var isMdAsciiPunct = utils.isMdAsciiPunct;
  var getLineOffset = utils.getLineOffset;

  function StateInline(src, md, env, outTokens) {
    this.src = src;
    this.env = env;
    this.md = md;
    this.tokens = outTokens;
    this.tokens_meta = Array(outTokens.length);
    this.links = null;
    this.pos = 0;
    this.posMax = this.src.length;
    this.level = 0;
    this.pending = "";
    this.pendingLevel = 0; // Stores { start: end } pairs. Useful for backtrack
    // optimization of pairs parse (emphasis, strikes).

    this.cache = {}; // List of emphasis-like delimiters for current tag

    this.delimiters = []; // Stack of delimiter lists for upper level tags

    this._prev_delimiters = []; // backtick length => last seen position

    this.backticks = {};
    this.backticksScanned = false;
  } // Flush pending text


  StateInline.prototype.pushPending = function () {
    var token$1 = new token("text", "", 0);
    token$1.content = this.pending;
    token$1.level = this.pendingLevel;
    token$1.size = token$1.content.length;
    token$1.position = this.pos - token$1.size + getLineOffset(this);
    this.tokens.push(token$1);
    this.pending = "";
    return token$1;
  }; // Push new token to "stream".
  // If pending text exists - flush it as text token


  StateInline.prototype.push = function (type, tag, nesting) {
    if (this.pending) {
      this.pushPending();
    }

    var token$1 = new token(type, tag, nesting);
    var token_meta = null;

    if (nesting < 0) {
      // closing tag
      this.level--;
      this.delimiters = this._prev_delimiters.pop();
    }

    token$1.level = this.level;

    if (nesting > 0) {
      // opening tag
      this.level++;

      this._prev_delimiters.push(this.delimiters);

      this.delimiters = [];
      token_meta = {
        delimiters: this.delimiters
      };
    }

    this.pendingLevel = this.level;
    this.tokens.push(token$1);
    this.tokens_meta.push(token_meta);
    return token$1;
  }; // Scan a sequence of emphasis-like markers, and determine whether
  // it can start an emphasis sequence or end an emphasis sequence.
  //  - start - position to scan from (it should point at a valid marker);
  //  - canSplitWord - determine if these markers can be found inside a word


  StateInline.prototype.scanDelims = function (start, canSplitWord) {
    var pos = start,
        lastChar,
        nextChar,
        count,
        can_open,
        can_close,
        isLastWhiteSpace,
        isLastPunctChar,
        isNextWhiteSpace,
        isNextPunctChar,
        left_flanking = true,
        right_flanking = true,
        max = this.posMax,
        marker = this.src.charCodeAt(start); // treat beginning of the line as a whitespace

    lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 32;

    while (pos < max && this.src.charCodeAt(pos) === marker) {
      pos++;
    }

    count = pos - start; // treat end of the line as a whitespace

    nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
    isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
    isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
    isLastWhiteSpace = isWhiteSpace(lastChar);
    isNextWhiteSpace = isWhiteSpace(nextChar);

    if (isNextWhiteSpace) {
      left_flanking = false;
    } else if (isNextPunctChar) {
      if (!(isLastWhiteSpace || isLastPunctChar)) {
        left_flanking = false;
      }
    }

    if (isLastWhiteSpace) {
      right_flanking = false;
    } else if (isLastPunctChar) {
      if (!(isNextWhiteSpace || isNextPunctChar)) {
        right_flanking = false;
      }
    }

    if (!canSplitWord) {
      can_open = left_flanking && (!right_flanking || isLastPunctChar);
      can_close = right_flanking && (!left_flanking || isNextPunctChar);
    } else {
      can_open = left_flanking;
      can_close = right_flanking;
    }

    return {
      can_open: can_open,
      can_close: can_close,
      length: count
    };
  }; // re-export Token class to use in block rules


  StateInline.prototype.Token = token;
  var state_inline = StateInline;
  /** internal
   * class ParserInline
   *
   * Tokenizes paragraph content.
   **/
  ////////////////////////////////////////////////////////////////////////////////
  // Parser rules

  var _rules0 = [["linkify", linkify.preProcess]];
  var _rules = [["linkify", linkify.tokenize], ["text", text], ["newline", newline], ["escape", _escape], ["backticks", backticks], ["strikethrough", strikethrough.tokenize], ["emphasis", emphasis.tokenize], ["link", link], ["image", image], ["autolink", autolink], ["html_inline", html_inline], ["entity", entity]];
  var _rules2 = [["balance_pairs", balance_pairs], ["strikethrough", strikethrough.postProcess], ["emphasis", emphasis.postProcess], ["linkify", linkify.postProcess], ["text_collapse", text_collapse]];
  /**
   * new ParserInline()
   **/

  function ParserInline() {
    var i;
    /**
     * ParserInline#ruler -> Ruler
     *
     * [[Ruler]] instance. Keep configuration of inline rules.
     **/

    this.ruler = new ruler();

    for (i = 0; i < _rules.length; i++) {
      this.ruler.push(_rules[i][0], _rules[i][1]);
    }
    /**
     * ParserInline#ruler2 -> Ruler
     *
     * [[Ruler]] instance. Second ruler used for post-processing
     * (e.g. in emphasis-like rules).
     **/


    this.ruler2 = new ruler();

    for (i = 0; i < _rules2.length; i++) {
      this.ruler2.push(_rules2[i][0], _rules2[i][1]);
    }
    /**
     * ParserInline#ruler0 -> Ruler
     *
     * [[Ruler]] instance. Third ruler used for pre-processing
     * (e.g. in linkify rule).
     **/


    this.ruler0 = new ruler();

    for (i = 0; i < _rules0.length; i++) {
      this.ruler0.push(_rules0[i][0], _rules0[i][1]);
    }
  } // Skip single token by running all rules in validation mode;
  // returns `true` if any rule reported success


  ParserInline.prototype.skipToken = function (state) {
    var ok,
        i,
        pos = state.pos,
        rules = this.ruler.getRules(""),
        len = rules.length,
        maxNesting = state.md.options.maxNesting,
        cache = state.cache;

    if (typeof cache[pos] !== "undefined") {
      state.pos = cache[pos];
      return;
    }

    if (state.level < maxNesting) {
      for (i = 0; i < len; i++) {
        // Increment state.level and decrement it later to limit recursion.
        // It's harmless to do here, because no tokens are created. But ideally,
        // we'd need a separate private state variable for this purpose.
        state.level++;
        ok = rules[i](state, true);
        state.level--;

        if (ok) {
          break;
        }
      }
    } else {
      // Too much nesting, just skip until the end of the paragraph.
      // NOTE: this will cause links to behave incorrectly in the following case,
      //       when an amount of `[` is exactly equal to `maxNesting + 1`:
      //       [[[[[[[[[[[[[[[[[[[[[foo]()
      // TODO: remove this workaround when CM standard will allow nested links
      //       (we can replace it by preventing links from being parsed in
      //       validation mode)
      state.pos = state.posMax;
    }

    if (!ok) {
      state.pos++;
    }

    cache[pos] = state.pos;
  }; // Generate tokens for input range


  ParserInline.prototype.tokenize = function (state) {
    var ok,
        i,
        rules = this.ruler.getRules(""),
        len = rules.length,
        end = state.posMax,
        maxNesting = state.md.options.maxNesting;

    while (state.pos < end) {
      // Try all possible rules.
      // On success, rule should:
      // - update `state.pos`
      // - update `state.tokens`
      // - return true
      if (state.level < maxNesting) {
        for (i = 0; i < len; i++) {
          ok = rules[i](state, false);

          if (ok) {
            break;
          }
        }
      }

      if (ok) {
        if (state.pos >= end) {
          break;
        }

        continue;
      }

      state.pending += state.src[state.pos++];
    }

    if (state.pending) {
      state.pushPending();
    }
  };
  /**
   * ParserInline.parse(str, links, md, env, outTokens)
   *
   * Process input string and push inline tokens into `outTokens`
   **/


  ParserInline.prototype.parse = function (str, md, env, outTokens) {
    var i, rules, len;
    var state = new this.State(str, md, env, outTokens);
    rules = this.ruler0.getRules("");
    len = rules.length;

    for (i = 0; i < len; i++) {
      rules[i](state);
    }

    this.tokenize(state);
    rules = this.ruler2.getRules("");
    len = rules.length;

    for (i = 0; i < len; i++) {
      rules[i](state);
    }
  };

  ParserInline.prototype.State = state_inline;
  var parser_inline = ParserInline;

  var re = function re(opts) {
    var re = {}; // Use direct extract instead of `regenerate` to reduse browserified size

    re.src_Any = regex$3.source;
    re.src_Cc = regex$2.source;
    re.src_Z = regex.source;
    re.src_P = regex$4.source; // \p{\Z\P\Cc\CF} (white spaces + control + format + punctuation)

    re.src_ZPCc = [re.src_Z, re.src_P, re.src_Cc].join("|"); // \p{\Z\Cc} (white spaces + control)

    re.src_ZCc = [re.src_Z, re.src_Cc].join("|"); // Experimental. List of chars, completely prohibited in links
    // because can separate it from other part of text

    var text_separators = "[><\uFF5C]"; // All possible word characters (everything without punctuation, spaces & controls)
    // Defined via punctuation & spaces to save space
    // Should be something like \p{\L\N\S\M} (\w but without `_`)

    re.src_pseudo_letter = "(?:(?!" + text_separators + "|" + re.src_ZPCc + ")" + re.src_Any + ")"; // The same as abothe but without [0-9]
    // var src_pseudo_letter_non_d = '(?:(?![0-9]|' + src_ZPCc + ')' + src_Any + ')';
    ////////////////////////////////////////////////////////////////////////////////

    re.src_ip4 = "(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"; // Prohibit any of "@/[]()" in user/pass to avoid wrong domain fetch.

    re.src_auth = "(?:(?:(?!" + re.src_ZCc + "|[@/\\[\\]()]).)+@)?";
    re.src_port = "(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?";
    re.src_host_terminator = "(?=$|" + text_separators + "|" + re.src_ZPCc + ")(?!-|_|:\\d|\\.-|\\.(?!$|" + re.src_ZPCc + "))";
    re.src_path = "(?:" + "[/?#]" + "(?:" + "(?!" + re.src_ZCc + "|" + text_separators + "|[()[\\]{}.,\"'?!\\-]).|" + "\\[(?:(?!" + re.src_ZCc + "|\\]).)*\\]|" + "\\((?:(?!" + re.src_ZCc + "|[)]).)*\\)|" + "\\{(?:(?!" + re.src_ZCc + "|[}]).)*\\}|" + '\\"(?:(?!' + re.src_ZCc + '|["]).)+\\"|' + "\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|" + "\\'(?=" + re.src_pseudo_letter + "|[-]).|" + // allow `I'm_king` if no pair found
    "\\.{2,}[a-zA-Z0-9%/&]|" + // google has many dots in "google search" links (#66, #81).
    // github has ... in commit range links,
    // Restrict to
    // - english
    // - percent-encoded
    // - parts of file path
    // - params separator
    // until more examples found.
    "\\.(?!" + re.src_ZCc + "|[.]).|" + (opts && opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-*)|" : "\\-+|") + "\\,(?!" + re.src_ZCc + ").|" + // allow `,,,` in paths
    "\\!+(?!" + re.src_ZCc + "|[!]).|" + // allow `!!!` in paths, but not at the end
    "\\?(?!" + re.src_ZCc + "|[?])." + ")+" + "|\\/" + ")?"; // Allow anything in markdown spec, forbid quote (") at the first position
    // because emails enclosed in quotes are far more common

    re.src_email_name = '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]*';
    re.src_xn = "xn--[a-z0-9\\-]{1,59}"; // More to read about domain names
    // http://serverfault.com/questions/638260/

    re.src_domain_root = // Allow letters & digits (http://test1)
    "(?:" + re.src_xn + "|" + re.src_pseudo_letter + "{1,63}" + ")";
    re.src_domain = "(?:" + re.src_xn + "|" + "(?:" + re.src_pseudo_letter + ")" + "|" + "(?:" + re.src_pseudo_letter + "(?:-|" + re.src_pseudo_letter + "){0,61}" + re.src_pseudo_letter + ")" + ")";
    re.src_host = "(?:" + // Don't need IP check, because digits are already allowed in normal domain names
    //   src_ip4 +
    // '|' +
    "(?:(?:(?:" + re.src_domain + ")\\.)*" + re.src_domain
    /*_root*/
    + ")" + ")";
    re.tpl_host_fuzzy = "(?:" + re.src_ip4 + "|" + "(?:(?:(?:" + re.src_domain + ")\\.)+(?:%TLDS%))" + ")";
    re.tpl_host_no_ip_fuzzy = "(?:(?:(?:" + re.src_domain + ")\\.)+(?:%TLDS%))";
    re.src_host_strict = re.src_host + re.src_host_terminator;
    re.tpl_host_fuzzy_strict = re.tpl_host_fuzzy + re.src_host_terminator;
    re.src_host_port_strict = re.src_host + re.src_port + re.src_host_terminator;
    re.tpl_host_port_fuzzy_strict = re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
    re.tpl_host_port_no_ip_fuzzy_strict = re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator; ////////////////////////////////////////////////////////////////////////////////
    // Main rules
    // Rude test fuzzy links by host, for quick deny

    re.tpl_host_fuzzy_test = "localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:" + re.src_ZPCc + "|>|$))";
    re.tpl_email_fuzzy = "(^|" + text_separators + '|"|\\(|' + re.src_ZCc + ")" + "(" + re.src_email_name + "@" + re.tpl_host_fuzzy_strict + ")";
    re.tpl_link_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
    // but can start with > (markdown blockquote)
    "(^|(?![.:/\\-_@])(?:[$+<=>^`|\uFF5C]|" + re.src_ZPCc + "))" + "((?![$+<=>^`|\uFF5C])" + re.tpl_host_port_fuzzy_strict + re.src_path + ")";
    re.tpl_link_no_ip_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
    // but can start with > (markdown blockquote)
    "(^|(?![.:/\\-_@])(?:[$+<=>^`|\uFF5C]|" + re.src_ZPCc + "))" + "((?![$+<=>^`|\uFF5C])" + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ")";
    return re;
  }; ////////////////////////////////////////////////////////////////////////////////
  // Helpers
  // Merge objects


  function assign(obj
  /*from1, from2, from3, ...*/
  ) {
    var sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function (source) {
      if (!source) {
        return;
      }

      Object.keys(source).forEach(function (key) {
        obj[key] = source[key];
      });
    });
    return obj;
  }

  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }

  function isString(obj) {
    return _class(obj) === "[object String]";
  }

  function isObject(obj) {
    return _class(obj) === "[object Object]";
  }

  function isRegExp(obj) {
    return _class(obj) === "[object RegExp]";
  }

  function isFunction(obj) {
    return _class(obj) === "[object Function]";
  }

  function escapeRE(str) {
    return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
  } ////////////////////////////////////////////////////////////////////////////////


  var defaultOptions = {
    fuzzyLink: true,
    fuzzyEmail: true,
    fuzzyIP: false
  };

  function isOptionsObj(obj) {
    return Object.keys(obj || {}).reduce(function (acc, k) {
      return acc || defaultOptions.hasOwnProperty(k);
    }, false);
  }

  var defaultSchemas = {
    "http:": {
      validate: function validate(text, pos, self) {
        var tail = text.slice(pos);

        if (!self.re.http) {
          // compile lazily, because "host"-containing variables can change on tlds update.
          self.re.http = new RegExp("^\\/\\/" + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, "i");
        }

        if (self.re.http.test(tail)) {
          return tail.match(self.re.http)[0].length;
        }

        return 0;
      }
    },
    "https:": "http:",
    "ftp:": "http:",
    "//": {
      validate: function validate(text, pos, self) {
        var tail = text.slice(pos);

        if (!self.re.no_http) {
          // compile lazily, because "host"-containing variables can change on tlds update.
          self.re.no_http = new RegExp("^" + self.re.src_auth + // Don't allow single-level domains, because of false positives like '//test'
          // with code comments
          "(?:localhost|(?:(?:" + self.re.src_domain + ")\\.)+" + self.re.src_domain_root + ")" + self.re.src_port + self.re.src_host_terminator + self.re.src_path, "i");
        }

        if (self.re.no_http.test(tail)) {
          // should not be `://` & `///`, that protects from errors in protocol name
          if (pos >= 3 && text[pos - 3] === ":") {
            return 0;
          }

          if (pos >= 3 && text[pos - 3] === "/") {
            return 0;
          }

          return tail.match(self.re.no_http)[0].length;
        }

        return 0;
      }
    },
    "mailto:": {
      validate: function validate(text, pos, self) {
        var tail = text.slice(pos);

        if (!self.re.mailto) {
          self.re.mailto = new RegExp("^" + self.re.src_email_name + "@" + self.re.src_host_strict, "i");
        }

        if (self.re.mailto.test(tail)) {
          return tail.match(self.re.mailto)[0].length;
        }

        return 0;
      }
    }
  };
  /*eslint-disable max-len*/
  // RE pattern for 2-character tlds (autogenerated by ./support/tlds_2char_gen.js)

  var tlds_2ch_src_re = "a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]"; // DON'T try to make PRs with changes. Extend TLDs with LinkifyIt.tlds() instead

  var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444".split("|");
  /*eslint-enable max-len*/
  ////////////////////////////////////////////////////////////////////////////////

  function resetScanCache(self) {
    self.__index__ = -1;
    self.__text_cache__ = "";
  }

  function createValidator(re) {
    return function (text, pos) {
      var tail = text.slice(pos);

      if (re.test(tail)) {
        return tail.match(re)[0].length;
      }

      return 0;
    };
  }

  function createNormalizer() {
    return function (match, self) {
      self.normalize(match);
    };
  } // Schemas compiler. Build regexps.


  function compile(self) {
    // Load & clone RE patterns.
    var re$1 = self.re = re(self.__opts__); // Define dynamic patterns

    var tlds = self.__tlds__.slice();

    self.onCompile();

    if (!self.__tlds_replaced__) {
      tlds.push(tlds_2ch_src_re);
    }

    tlds.push(re$1.src_xn);
    re$1.src_tlds = tlds.join("|");

    function untpl(tpl) {
      return tpl.replace("%TLDS%", re$1.src_tlds);
    }

    re$1.email_fuzzy = RegExp(untpl(re$1.tpl_email_fuzzy), "i");
    re$1.link_fuzzy = RegExp(untpl(re$1.tpl_link_fuzzy), "i");
    re$1.link_no_ip_fuzzy = RegExp(untpl(re$1.tpl_link_no_ip_fuzzy), "i");
    re$1.host_fuzzy_test = RegExp(untpl(re$1.tpl_host_fuzzy_test), "i"); // Compile each schema

    var aliases = [];
    self.__compiled__ = {}; // Reset compiled data

    function schemaError(name, val) {
      throw new Error('(LinkifyIt) Invalid schema "' + name + '": ' + val);
    }

    Object.keys(self.__schemas__).forEach(function (name) {
      var val = self.__schemas__[name]; // skip disabled methods

      if (val === null) {
        return;
      }

      var compiled = {
        validate: null,
        link: null
      };
      self.__compiled__[name] = compiled;

      if (isObject(val)) {
        if (isRegExp(val.validate)) {
          compiled.validate = createValidator(val.validate);
        } else if (isFunction(val.validate)) {
          compiled.validate = val.validate;
        } else {
          schemaError(name, val);
        }

        if (isFunction(val.normalize)) {
          compiled.normalize = val.normalize;
        } else if (!val.normalize) {
          compiled.normalize = createNormalizer();
        } else {
          schemaError(name, val);
        }

        return;
      }

      if (isString(val)) {
        aliases.push(name);
        return;
      }

      schemaError(name, val);
    }); // Compile postponed aliases

    aliases.forEach(function (alias) {
      if (!self.__compiled__[self.__schemas__[alias]]) {
        // Silently fail on missed schemas to avoid errons on disable.
        // schemaError(alias, self.__schemas__[alias]);
        return;
      }

      self.__compiled__[alias].validate = self.__compiled__[self.__schemas__[alias]].validate;
      self.__compiled__[alias].normalize = self.__compiled__[self.__schemas__[alias]].normalize;
    }); // Fake record for guessed links

    self.__compiled__[""] = {
      validate: null,
      normalize: createNormalizer()
    }; // Build schema condition

    var slist = Object.keys(self.__compiled__).filter(function (name) {
      // Filter disabled & fake schemas
      return name.length > 0 && self.__compiled__[name];
    }).map(escapeRE).join("|"); // (?!_) cause 1.5x slowdown

    self.re.schema_test = RegExp("(^|(?!_)(?:[><\uFF5C]|" + re$1.src_ZPCc + "))(" + slist + ")", "i");
    self.re.schema_search = RegExp("(^|(?!_)(?:[><\uFF5C]|" + re$1.src_ZPCc + "))(" + slist + ")", "ig");
    self.re.pretest = RegExp("(" + self.re.schema_test.source + ")|(" + self.re.host_fuzzy_test.source + ")|@", "i"); // Cleanup

    resetScanCache(self);
  }
  /**
   * class Match
   *
   * Match result. Single element of array, returned by [[LinkifyIt#match]]
   **/


  function Match(self, shift) {
    var start = self.__index__,
        end = self.__last_index__,
        text = self.__text_cache__.slice(start, end);
    /**
     * Match#schema -> String
     *
     * Prefix (protocol) for matched string.
     **/


    this.schema = self.__schema__.toLowerCase();
    /**
     * Match#index -> Number
     *
     * First position of matched string.
     **/

    this.index = start + shift;
    /**
     * Match#lastIndex -> Number
     *
     * Next position after matched string.
     **/

    this.lastIndex = end + shift;
    /**
     * Match#raw -> String
     *
     * Matched string.
     **/

    this.raw = text;
    /**
     * Match#text -> String
     *
     * Notmalized text of matched string.
     **/

    this.text = text;
    /**
     * Match#url -> String
     *
     * Normalized url of matched string.
     **/

    this.url = text;
  }

  function createMatch(self, shift) {
    var match = new Match(self, shift);

    self.__compiled__[match.schema].normalize(match, self);

    return match;
  }
  /**
   * class LinkifyIt
   **/

  /**
   * new LinkifyIt(schemas, options)
   * - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
   * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
   *
   * Creates new linkifier instance with optional additional schemas.
   * Can be called without `new` keyword for convenience.
   *
   * By default understands:
   *
   * - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
   * - "fuzzy" links and emails (example.com, foo@bar.com).
   *
   * `schemas` is an object, where each key/value describes protocol/rule:
   *
   * - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
   *   for example). `linkify-it` makes shure that prefix is not preceeded with
   *   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
   * - __value__ - rule to check tail after link prefix
   *   - _String_ - just alias to existing rule
   *   - _Object_
   *     - _validate_ - validator function (should return matched length on success),
   *       or `RegExp`.
   *     - _normalize_ - optional function to normalize text & url of matched result
   *       (for example, for @twitter mentions).
   *
   * `options`:
   *
   * - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
   * - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
   *   like version numbers. Default `false`.
   * - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
   *
   **/


  function LinkifyIt(schemas, options) {
    if (!(this instanceof LinkifyIt)) {
      return new LinkifyIt(schemas, options);
    }

    if (!options) {
      if (isOptionsObj(schemas)) {
        options = schemas;
        schemas = {};
      }
    }

    this.__opts__ = assign({}, defaultOptions, options); // Cache last tested result. Used to skip repeating steps on next `match` call.

    this.__index__ = -1;
    this.__last_index__ = -1; // Next scan position

    this.__schema__ = "";
    this.__text_cache__ = "";
    this.__schemas__ = assign({}, defaultSchemas, schemas);
    this.__compiled__ = {};
    this.__tlds__ = tlds_default;
    this.__tlds_replaced__ = false;
    this.re = {};
    compile(this);
  }
  /** chainable
   * LinkifyIt#add(schema, definition)
   * - schema (String): rule name (fixed pattern prefix)
   * - definition (String|RegExp|Object): schema definition
   *
   * Add new rule definition. See constructor description for details.
   **/


  LinkifyIt.prototype.add = function add(schema, definition) {
    this.__schemas__[schema] = definition;
    compile(this);
    return this;
  };
  /** chainable
   * LinkifyIt#set(options)
   * - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
   *
   * Set recognition options for links without schema.
   **/


  LinkifyIt.prototype.set = function set(options) {
    this.__opts__ = assign(this.__opts__, options);
    return this;
  };
  /**
   * LinkifyIt#test(text) -> Boolean
   *
   * Searches linkifiable pattern and returns `true` on success or `false` on fail.
   **/


  LinkifyIt.prototype.test = function test(text) {
    // Reset scan cache
    this.__text_cache__ = text;
    this.__index__ = -1;

    if (!text.length) {
      return false;
    }

    var m, ml, me, len, shift, next, re, tld_pos, at_pos; // try to scan for link with schema - that's the most simple rule

    if (this.re.schema_test.test(text)) {
      re = this.re.schema_search;
      re.lastIndex = 0;

      while ((m = re.exec(text)) !== null) {
        len = this.testSchemaAt(text, m[2], re.lastIndex);

        if (len) {
          this.__schema__ = m[2];
          this.__index__ = m.index + m[1].length;
          this.__last_index__ = m.index + m[0].length + len;
          break;
        }
      }
    }

    if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
      // guess schemaless links
      tld_pos = text.search(this.re.host_fuzzy_test);

      if (tld_pos >= 0) {
        // if tld is located after found link - no need to check fuzzy pattern
        if (this.__index__ < 0 || tld_pos < this.__index__) {
          if ((ml = text.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) !== null) {
            shift = ml.index + ml[1].length;

            if (this.__index__ < 0 || shift < this.__index__) {
              this.__schema__ = "";
              this.__index__ = shift;
              this.__last_index__ = ml.index + ml[0].length;
            }
          }
        }
      }
    }

    if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
      // guess schemaless emails
      at_pos = text.indexOf("@");

      if (at_pos >= 0) {
        // We can't skip this check, because this cases are possible:
        // 192.168.1.1@gmail.com, my.in@example.com
        if ((me = text.match(this.re.email_fuzzy)) !== null) {
          shift = me.index + me[1].length;
          next = me.index + me[0].length;

          if (this.__index__ < 0 || shift < this.__index__ || shift === this.__index__ && next > this.__last_index__) {
            this.__schema__ = "mailto:";
            this.__index__ = shift;
            this.__last_index__ = next;
          }
        }
      }
    }

    return this.__index__ >= 0;
  };
  /**
   * LinkifyIt#pretest(text) -> Boolean
   *
   * Very quick check, that can give false positives. Returns true if link MAY BE
   * can exists. Can be used for speed optimization, when you need to check that
   * link NOT exists.
   **/


  LinkifyIt.prototype.pretest = function pretest(text) {
    return this.re.pretest.test(text);
  };
  /**
   * LinkifyIt#testSchemaAt(text, name, position) -> Number
   * - text (String): text to scan
   * - name (String): rule (schema) name
   * - position (Number): text offset to check from
   *
   * Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
   * at given position. Returns length of found pattern (0 on fail).
   **/


  LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text, schema, pos) {
    // If not supported schema check requested - terminate
    if (!this.__compiled__[schema.toLowerCase()]) {
      return 0;
    }

    return this.__compiled__[schema.toLowerCase()].validate(text, pos, this);
  };
  /**
   * LinkifyIt#match(text) -> Array|null
   *
   * Returns array of found link descriptions or `null` on fail. We strongly
   * recommend to use [[LinkifyIt#test]] first, for best speed.
   *
   * ##### Result match description
   *
   * - __schema__ - link schema, can be empty for fuzzy links, or `//` for
   *   protocol-neutral  links.
   * - __index__ - offset of matched text
   * - __lastIndex__ - index of next char after mathch end
   * - __raw__ - matched text
   * - __text__ - normalized text
   * - __url__ - link, generated from matched text
   **/


  LinkifyIt.prototype.match = function match(text) {
    var shift = 0,
        result = []; // Try to take previous element from cache, if .test() called before

    if (this.__index__ >= 0 && this.__text_cache__ === text) {
      result.push(createMatch(this, shift));
      shift = this.__last_index__;
    } // Cut head if cache was used


    var tail = shift ? text.slice(shift) : text; // Scan string until end reached

    while (this.test(tail)) {
      result.push(createMatch(this, shift));
      tail = tail.slice(this.__last_index__);
      shift += this.__last_index__;
    }

    if (result.length) {
      return result;
    }

    return null;
  };
  /** chainable
   * LinkifyIt#tlds(list [, keepOld]) -> this
   * - list (Array): list of tlds
   * - keepOld (Boolean): merge with current list if `true` (`false` by default)
   *
   * Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
   * to avoid false positives. By default this algorythm used:
   *
   * - hostname with any 2-letter root zones are ok.
   * - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
   *   are ok.
   * - encoded (`xn--...`) root zones are ok.
   *
   * If list is replaced, then exact match for 2-chars root zones will be checked.
   **/


  LinkifyIt.prototype.tlds = function tlds(list, keepOld) {
    list = Array.isArray(list) ? list : [list];

    if (!keepOld) {
      this.__tlds__ = list.slice();
      this.__tlds_replaced__ = true;
      compile(this);
      return this;
    }

    this.__tlds__ = this.__tlds__.concat(list).sort().filter(function (el, idx, arr) {
      return el !== arr[idx - 1];
    }).reverse();
    compile(this);
    return this;
  };
  /**
   * LinkifyIt#normalize(match)
   *
   * Default normalizer (if schema does not define it's own).
   **/


  LinkifyIt.prototype.normalize = function normalize(match) {
    // Do minimal possible changes by default. Need to collect feedback prior
    // to move forward https://github.com/markdown-it/linkify-it/issues/1
    if (!match.schema) {
      match.url = "http://" + match.url;
    }

    if (match.schema === "mailto:" && !/^mailto:/i.test(match.url)) {
      match.url = "mailto:" + match.url;
    }
  };
  /**
   * LinkifyIt#onCompile()
   *
   * Override to modify basic RegExp-s.
   **/


  LinkifyIt.prototype.onCompile = function onCompile() {};

  var linkifyIt = LinkifyIt; // markdown-it default options

  var _default = {
    options: {
      html: false,
      // Enable HTML tags in source
      xhtmlOut: false,
      // Use '/' to close single tags (<br />)
      breaks: false,
      // Convert '\n' in paragraphs into <br>
      langPrefix: "language-",
      // CSS language prefix for fenced blocks
      linkify: false,
      // autoconvert URL-like texts to links
      // highSecurity:
      // - false:           lower protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This setting assumes you own or at least trust the Markdown
      //                    being fed to MarkDonw-It. The result is a nicer render.
      // - true (default):  maximum protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This is the default setting and assumes you have no control or absolute trust in the Markdown
      //                    being fed to MarkDonw-It. Use this setting when using markdown-it as part of a forum or other
      //                    website where more-or-less arbitrary users can enter and feed any MarkDown to markdown-it.
      // See https://en.wikipedia.org/wiki/Internationalized_domain_name for details on homograph attacks, for example.
      highSecurity: true,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",

      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      // function (/*str, lang*/) { return ''; }
      highlight: null,
      // A regex which matches *additional* characters in an inline text string which may serve
      // as the start of a special word, i.e. the start of anything that might be matched
      // by a markdown-it parse rule / plugin.
      // Using this option will slow markdown-it, hence you should only use it when you need it,
      // e.g. when writing custom plugins which are not looking for words which start with one
      // of the default set of sentinel characters as specified in rules_inline/text.js:
      // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
      inlineTokenTerminatorsRe: null,
      // Internal protection, recursion limit
      maxNesting: 100
    },
    components: {
      core: {},
      block: {},
      inline: {}
    }
  }; // "Zero" preset, with nothing enabled. Useful for manual configuring of simple
  // modes. For example, to parse bold/italic only.

  var zero = {
    options: {
      html: false,
      // Enable HTML tags in source
      xhtmlOut: false,
      // Use '/' to close single tags (<br />)
      breaks: false,
      // Convert '\n' in paragraphs into <br>
      langPrefix: "language-",
      // CSS language prefix for fenced blocks
      linkify: false,
      // autoconvert URL-like texts to links
      // highSecurity:
      // - false:           lower protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This setting assumes you own or at least trust the Markdown
      //                    being fed to MarkDonw-It. The result is a nicer render.
      // - true (default):  maximum protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This is the default setting and assumes you have no control or absolute trust in the Markdown
      //                    being fed to MarkDonw-It. Use this setting when using markdown-it as part of a forum or other
      //                    website where more-or-less arbitrary users can enter and feed any MarkDown to markdown-it.
      // See https://en.wikipedia.org/wiki/Internationalized_domain_name for details on homograph attacks, for example.
      highSecurity: true,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",

      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      // function (/*str, lang*/) { return ''; }
      highlight: null,
      // A regex which matches *additional* characters in an inline text string which may serve
      // as the start of a special word, i.e. the start of anything that might be matched
      // by a markdown-it parse rule / plugin.
      // Using this option will slow markdown-it, hence you should only use it when you need it,
      // e.g. when writing custom plugins which are not looking for words which start with one
      // of the default set of sentinel characters as specified in rules_inline/text.js:
      // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
      inlineTokenTerminatorsRe: null,
      // Internal protection, recursion limit
      maxNesting: 20
    },
    components: {
      core: {
        rules: ["normalize", "block", "inline"]
      },
      block: {
        rules: ["paragraph"]
      },
      inline: {
        rules: ["text"],
        rules2: ["balance_pairs", "text_collapse"]
      }
    }
  }; // Commonmark default options

  var commonmark = {
    options: {
      html: true,
      // Enable HTML tags in source
      xhtmlOut: true,
      // Use '/' to close single tags (<br />)
      breaks: false,
      // Convert '\n' in paragraphs into <br>
      langPrefix: "language-",
      // CSS language prefix for fenced blocks
      linkify: false,
      // autoconvert URL-like texts to links
      // highSecurity:
      // - false:           lower protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This setting assumes you own or at least trust the Markdown
      //                    being fed to MarkDonw-It. The result is a nicer render.
      // - true (default):  maximum protection against XSS/Unicode-Homologue/etc. attacks via the input MarkDown.
      //                    This is the default setting and assumes you have no control or absolute trust in the Markdown
      //                    being fed to MarkDonw-It. Use this setting when using markdown-it as part of a forum or other
      //                    website where more-or-less arbitrary users can enter and feed any MarkDown to markdown-it.
      // See https://en.wikipedia.org/wiki/Internationalized_domain_name for details on homograph attacks, for example.
      highSecurity: true,
      // Enable some language-neutral replacements + quotes beautification
      typographer: false,
      // Double + single quotes replacement pairs, when typographer enabled,
      // and smartquotes on. Could be either a String or an Array.
      // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
      // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
      quotes: "\u201C\u201D\u2018\u2019",

      /* “”‘’ */
      // Highlighter function. Should return escaped HTML,
      // or '' if the source string is not changed and should be escaped externaly.
      // If result starts with <pre... internal wrapper is skipped.
      // function (/*str, lang*/) { return ''; }
      highlight: null,
      // A regex which matches *additional* characters in an inline text string which may serve
      // as the start of a special word, i.e. the start of anything that might be matched
      // by a markdown-it parse rule / plugin.
      // Using this option will slow markdown-it, hence you should only use it when you need it,
      // e.g. when writing custom plugins which are not looking for words which start with one
      // of the default set of sentinel characters as specified in rules_inline/text.js:
      // !, ", #, $, %, &, ', (, ), *, +, ,, -, ., /, :, ;, <, =, >, ?, @, [, \, ], ^, _, `, {, |, }, or ~
      inlineTokenTerminatorsRe: null,
      // Internal protection, recursion limit
      maxNesting: 20
    },
    components: {
      core: {
        rules: ["normalize", "block", "inline"]
      },
      block: {
        rules: ["blockquote", "code", "fence", "heading", "hr", "html_block", "lheading", "list", "reference", "paragraph"]
      },
      inline: {
        rules: ["autolink", "backticks", "emphasis", "entity", "escape", "html_inline", "image", "link", "newline", "text"],
        rules2: ["balance_pairs", "emphasis", "text_collapse"]
      }
    }
  }; // Main parser class

  var config = {
    "default": _default,
    zero: zero,
    commonmark: commonmark
  }; ////////////////////////////////////////////////////////////////////////////////
  // This validator can prohibit more than really needed to prevent XSS. It's a
  // tradeoff to keep code simple and to be secure by default.
  // If you need different setup - override validator method as you wish. Or
  // replace it with dummy function and use external sanitizer.

  var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
  var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp|svg\+xml);/;

  function validateLink(url) {
    // url should be normalized at this point, and existing entities are decoded
    var str = url.trim().toLowerCase();
    return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) ? true : false : true;
  } ////////////////////////////////////////////////////////////////////////////////


  var RECODE_HOSTNAME_FOR = ["http:", "https:", "mailto:"];

  function normalizeLink(url) {
    var parsed = mdurl.parse(url, true);

    if (parsed.hostname) {
      // Encode hostnames in urls like:
      // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
      // We don't encode unknown schemas, because it's likely that we encode
      // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
        try {
          parsed.hostname = punycode.toASCII(parsed.hostname);
        } catch (er) {}
      }
    }

    return mdurl.encode(mdurl.format(parsed));
  }

  function normalizeLinkText(url) {
    var parsed = mdurl.parse(url, true);

    if (parsed.hostname) {
      // Encode hostnames in urls like:
      // `http://host/`, `https://host/`, `mailto:user@host`, `//host/`
      // We don't encode unknown schemas, because it's likely that we encode
      // something we shouldn't (e.g. `skype:name` treated as `skype:host`)
      // Use "toASCII" instead of "toUNICODE" to avoid Unicode homograph attack.
      // The original *unsafe* normalize action produces nicer URI presentations for
      // punycode Unicode URIs; only use this setting when you can trust the input MarkDown
      // fed into markdown-it.
      // See https://en.wikipedia.org/wiki/Internationalized_domain_name for details.
      if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
        try {
          if (this.options && !this.options.highSecurity) {
            parsed.hostname = punycode.toUnicode(parsed.hostname);
          } else {
            parsed.hostname = punycode.toASCII(parsed.hostname);
          }
        } catch (er) {}
      }
    } // add '%' to exclude list because of https://github.com/markdown-it/markdown-it/issues/720


    return mdurl.decode(mdurl.format(parsed), mdurl.decode.defaultChars + "%");
  }
  /**
   * class MarkdownIt
   *
   * Main parser/renderer class.
   *
   * ##### Usage
   *
   * ```javascript
   * // node.js, "classic" way:
   * var MarkdownIt = require('markdown-it'),
   *     md = new MarkdownIt();
   * var result = md.render('# markdown-it rulezz!');
   *
   * // node.js, the same, but with sugar:
   * var md = require('markdown-it')();
   * var result = md.render('# markdown-it rulezz!');
   *
   * // browser without AMD, added to "window" on script load
   * // Note, there are no dash.
   * var md = window.markdownit();
   * var result = md.render('# markdown-it rulezz!');
   * ```
   *
   * Single line rendering, without paragraph wrap:
   *
   * ```javascript
   * var md = require('markdown-it')();
   * var result = md.renderInline('__markdown-it__ rulezz!');
   * ```
   **/

  /**
   * new MarkdownIt([presetName, options])
   * - presetName (String): optional, `commonmark` / `zero`
   * - options (Object)
   *
   * Creates parser instanse with given config. Can be called without `new`.
   *
   * ##### presetName
   *
   * MarkdownIt provides named presets as a convenience to quickly
   * enable/disable active syntax rules and options for common use cases.
   *
   * - ["commonmark"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/commonmark.js) -
   *   configures parser to strict [CommonMark](http://commonmark.org/) mode.
   * - [default](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/default.js) -
   *   similar to GFM, used when no preset name given. Enables all available rules,
   *   but still without html, typographer & autolinker.
   * - ["zero"](https://github.com/markdown-it/markdown-it/blob/master/lib/presets/zero.js) -
   *   all rules disabled. Useful to quickly setup your config via `.enable()`.
   *   For example, when you need only `bold` and `italic` markup and nothing else.
   *
   * ##### options:
   *
   * - __html__ - `false`. Set `true` to enable HTML tags in source. Be careful!
   *   That's not safe! You may need external sanitizer to protect output from XSS.
   *   It's better to extend features via plugins, instead of enabling HTML.
   * - __xhtmlOut__ - `false`. Set `true` to add '/' when closing single tags
   *   (`<br />`). This is needed only for full CommonMark compatibility. In real
   *   world you will need HTML output.
   * - __breaks__ - `false`. Set `true` to convert `\n` in paragraphs into `<br>`.
   * - __langPrefix__ - `language-`. CSS language class prefix for fenced blocks.
   *   Can be useful for external highlighters.
   * - __linkify__ - `false`. Set `true` to autoconvert URL-like text to links.
   * - __typographer__  - `false`. Set `true` to enable [some language-neutral
   *   replacement](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/replacements.js) +
   *   quotes beautification (smartquotes).
   * - __quotes__ - `“”‘’`, String or Array. Double + single quotes replacement
   *   pairs (a.k.a. "smartquotes"), when typographer enabled. For example, you can
   *   use `'«»„“'` for Russian, `'„“‚‘'` for German, and
   *   `['«\xA0', '\xA0»', '‹\xA0', '\xA0›']` for French (including nbsp).
   * - __highlight__ - `null`. Highlighter function for fenced code blocks.
   *   Highlighter `function (str, lang, attrs)` should return escaped HTML. It can also
   *   return empty string if the source was not changed and should be escaped
   *   externaly. If result starts with <pre... internal wrapper is skipped.
   *
   * ##### Example
   *
   * ```javascript
   * // commonmark mode
   * var md = require('markdown-it')('commonmark');
   *
   * // default mode
   * var md = require('markdown-it')();
   *
   * // enable everything
   * var md = require('markdown-it')({
   *   html: true,
   *   linkify: true,
   *   typographer: true
   * });
   * ```
   *
   * ##### Syntax highlighting
   *
   * ```js
   * var hljs = require('highlight.js') // https://highlightjs.org/
   *
   * var md = require('markdown-it')({
   *   highlight: function (str, lang, attrs) {
   *     if (lang && hljs.getLanguage(lang)) {
   *       try {
   *         return hljs.highlight(lang, str, true).value;
   *       } catch (__) {}
   *     }
   *
   *     return ''; // use external default escaping
   *   }
   * });
   * ```
   *
   * Or with full wrapper override (if you need assign class to `<pre>`):
   *
   * ```javascript
   * var hljs = require('highlight.js') // https://highlightjs.org/
   *
   * // Actual default values
   * var md = require('markdown-it')({
   *   highlight: function (str, lang, attrs) {
   *     if (lang && hljs.getLanguage(lang)) {
   *       try {
   *         return '<pre class="hljs"><code>' +
   *                hljs.highlight(lang, str, true).value +
   *                '</code></pre>';
   *       } catch (__) {}
   *     }
   *
   *     return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
   *   }
   * });
   * ```
   *
   **/


  function MarkdownIt(presetName, options) {
    if (!(this instanceof MarkdownIt)) {
      return new MarkdownIt(presetName, options);
    }

    if (!options) {
      if (!utils.isString(presetName)) {
        options = presetName || {};
        presetName = "default";
      }
    }
    /**
     * MarkdownIt#inline -> ParserInline
     *
     * Instance of [[ParserInline]]. You may need it to add new rules when
     * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
     * [[MarkdownIt.enable]].
     **/


    this.inline = new parser_inline();
    /**
     * MarkdownIt#block -> ParserBlock
     *
     * Instance of [[ParserBlock]]. You may need it to add new rules when
     * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
     * [[MarkdownIt.enable]].
     **/

    this.block = new parser_block();
    /**
     * MarkdownIt#core -> Core
     *
     * Instance of [[Core]] chain executor. You may need it to add new rules when
     * writing plugins. For simple rules control use [[MarkdownIt.disable]] and
     * [[MarkdownIt.enable]].
     **/

    this.core = new parser_core();
    /**
     * MarkdownIt#renderer -> Renderer
     *
     * Instance of [[Renderer]]. Use it to modify output look. Or to add rendering
     * rules for new token types, generated by plugins.
     *
     * ##### Example
     *
     * ```javascript
     * var md = require('markdown-it')();
     *
     * function myToken(tokens, idx, options, env, self) {
     *   //...
     *   return result;
     * };
     *
     * md.renderer.rules['my_token'] = myToken
     * ```
     *
     * See [[Renderer]] docs and [source code](https://github.com/markdown-it/markdown-it/blob/master/lib/renderer.js).
     **/

    this.renderer = new renderer();
    /**
     * MarkdownIt#linkify -> LinkifyIt
     *
     * [linkify-it](https://github.com/markdown-it/linkify-it) instance.
     * Used by [linkify](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/linkify.js)
     * rule.
     **/

    this.linkify = new linkifyIt();
    /**
     * MarkdownIt#validateLink(url) -> Boolean
     *
     * Link validation function. CommonMark allows too much in links. By default
     * we disable `javascript:`, `vbscript:`, `file:` schemas, and almost all `data:...` schemas
     * except some embedded image types.
     *
     * You can change this behaviour:
     *
     * ```javascript
     * var md = require('markdown-it')();
     * // enable everything
     * md.validateLink = function () { return true; }
     * ```
     **/

    this.validateLink = validateLink;
    /**
     * MarkdownIt#normalizeLink(url) -> String
     *
     * Function used to encode link url to a machine-readable format,
     * which includes url-encoding, punycode, etc.
     **/

    this.normalizeLink = normalizeLink;
    /**
     * MarkdownIt#normalizeLinkText(url) -> String
     *
     * Function used to decode link url to a human-readable format`
     **/

    this.normalizeLinkText = normalizeLinkText; // Expose utils & helpers for easy acces from plugins

    /**
     * MarkdownIt#utils -> utils
     *
     * Assorted utility functions, useful to write plugins. See details
     * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/common/utils.js).
     **/

    this.utils = utils;
    /**
     * MarkdownIt#helpers -> helpers
     *
     * Link components parser functions, useful to write plugins. See details
     * [here](https://github.com/markdown-it/markdown-it/blob/master/lib/helpers).
     **/

    this.helpers = utils.assign({}, helpers);
    this.options = {};
    this.configure(presetName);

    if (options) {
      this.set(options);
    }
  }
  /** chainable
   * MarkdownIt.set(options)
   *
   * Set parser options (in the same format as in constructor). Probably, you
   * will never need it, but you can change options after constructor call.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')()
   *             .set({ html: true, breaks: true })
   *             .set({ typographer, true });
   * ```
   *
   * __Note:__ To achieve the best possible performance, don't modify a
   * `markdown-it` instance options on the fly. If you need multiple configurations
   * it's best to create multiple instances and initialize each with separate
   * config.
   **/


  MarkdownIt.prototype.set = function (options) {
    utils.assign(this.options, options);
    return this;
  };
  /** chainable, internal
   * MarkdownIt.configure(presets)
   *
   * Batch load of all options and compenent settings. This is internal method,
   * and you probably will not need it. But if you will - see available presets
   * and data structure [here](https://github.com/markdown-it/markdown-it/tree/master/lib/presets)
   *
   * We strongly recommend to use presets instead of direct config loads. That
   * will give better compatibility with next versions.
   **/


  MarkdownIt.prototype.configure = function (presets) {
    var self = this,
        presetName;

    if (utils.isString(presets)) {
      presetName = presets;
      presets = config[presetName];

      if (!presets) {
        throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name');
      }
    }

    if (!presets) {
      throw new Error("Wrong `markdown-it` preset, can't be empty");
    }

    if (presets.options) {
      self.set(presets.options);
    }

    if (presets.components) {
      Object.keys(presets.components).forEach(function (name) {
        if (presets.components[name].rules) {
          self[name].ruler.enableOnly(presets.components[name].rules);
        }

        if (presets.components[name].rules2) {
          self[name].ruler2.enableOnly(presets.components[name].rules2);
        }

        if (presets.components[name].rules0) {
          self[name].ruler0.enableOnly(presets.components[name].rules2);
        }
      });
    }

    return this;
  };
  /** chainable
   * MarkdownIt.enable(list, ignoreInvalid)
   * - list (String|Array): rule name or list of rule names to enable
   * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
   *
   * Enable list or rules. It will automatically find appropriate components,
   * containing rules with given names. If rule not found, and `ignoreInvalid`
   * not set - throws exception.
   *
   * ##### Example
   *
   * ```javascript
   * var md = require('markdown-it')()
   *             .enable(['sub', 'sup'])
   *             .disable('smartquotes');
   * ```
   **/


  MarkdownIt.prototype.enable = function (list, ignoreInvalid) {
    var result = [];

    if (!Array.isArray(list)) {
      list = [list];
    }

    ["core", "block", "inline"].forEach(function (chain) {
      result = result.concat(this[chain].ruler.enable(list, true));
    }, this);
    result = result.concat(this.inline.ruler2.enable(list, true));
    result = result.concat(this.inline.ruler0.enable(list, true));
    var missed = list.filter(function (name) {
      return result.indexOf(name) < 0;
    });

    if (missed.length && !ignoreInvalid) {
      throw new Error("MarkdownIt. Failed to enable unknown rule(s): " + missed);
    }

    return this;
  };
  /** chainable
   * MarkdownIt.disable(list, ignoreInvalid)
   * - list (String|Array): rule name or list of rule names to disable.
   * - ignoreInvalid (Boolean): set `true` to ignore errors when rule not found.
   *
   * The same as [[MarkdownIt.enable]], but turn specified rules off.
   **/


  MarkdownIt.prototype.disable = function (list, ignoreInvalid) {
    var result = [];

    if (!Array.isArray(list)) {
      list = [list];
    }

    ["core", "block", "inline"].forEach(function (chain) {
      result = result.concat(this[chain].ruler.disable(list, true));
    }, this);
    result = result.concat(this.inline.ruler2.disable(list, true));
    result = result.concat(this.inline.ruler0.disable(list, true));
    var missed = list.filter(function (name) {
      return result.indexOf(name) < 0;
    });

    if (missed.length && !ignoreInvalid) {
      throw new Error("MarkdownIt. Failed to disable unknown rule(s): " + missed);
    }

    return this;
  };
  /** chainable
   * MarkdownIt.use(plugin, params)
   *
   * Load specified plugin with given params into current parser instance.
   * It's just a sugar to call `plugin(md, params)` with curring.
   *
   * ##### Example
   *
   * ```javascript
   * var iterator = require('markdown-it-for-inline');
   * var md = require('markdown-it')()
   *             .use(iterator, 'foo_replace', 'text', function (tokens, idx) {
   *               tokens[idx].content = tokens[idx].content.replace(/foo/g, 'bar');
   *             });
   * ```
   **/


  MarkdownIt.prototype.use = function (plugin
  /*, params, ... */
  ) {
    var args = [this].concat(Array.prototype.slice.call(arguments, 1));
    plugin.apply(plugin, args);
    return this;
  };
  /** internal
   * MarkdownIt.parse(src, env) -> Array
   * - src (String): source string
   * - env (Object): environment sandbox
   *
   * Parse input string and return list of block tokens (special token type
   * "inline" will contain list of inline tokens). You should not call this
   * method directly, until you write custom renderer (for example, to produce
   * AST).
   *
   * `env` is used to pass data between "distributed" rules and return additional
   * metadata like reference info, needed for the renderer. It also can be used to
   * inject data in specific cases. Usually, you will be ok to pass `{}` or NULL,
   * and then pass updated object to renderer.
   **/


  MarkdownIt.prototype.parse = function (src, env) {
    if (typeof src !== "string") {
      throw new Error("Input data should be a String");
    }

    var state = new this.core.State(src, this, env || {});
    this.core.process(state);
    return state.tokens;
  };
  /**
   * MarkdownIt.render(src [, env]) -> String
   * - src (String): source string
   * - env (Object): environment sandbox
   *
   * Render markdown string into html. It does all magic for you :).
   *
   * `env` can be used to inject additional metadata (`{}` by default).
   * But you will not need it with high probability. See also comment
   * in [[MarkdownIt.parse]].
   **/


  MarkdownIt.prototype.render = function (src, env) {
    env = env || {};
    return this.renderer.render(this.parse(src, env), this.options, env);
  };
  /** internal
   * MarkdownIt.parseInline(src, env) -> Array
   * - src (String): source string
   * - env (Object): environment sandbox
   *
   * The same as [[MarkdownIt.parse]] but skip all block rules. It returns the
   * block tokens list with the single `inline` element, containing parsed inline
   * tokens in `children` property. Also updates `env` object.
   **/


  MarkdownIt.prototype.parseInline = function (src, env) {
    var state = new this.core.State(src, this, env);
    state.inlineMode = true;
    this.core.process(state);
    return state.tokens;
  };
  /**
   * MarkdownIt.renderInline(src [, env]) -> String
   * - src (String): source string
   * - env (Object): environment sandbox
   *
   * Similar to [[MarkdownIt.render]] but for single paragraph content. Result
   * will NOT be wrapped into `<p>` tags.
   **/


  MarkdownIt.prototype.renderInline = function (src, env) {
    env = env || {};
    return this.renderer.render(this.parseInline(src, env), this.options, env);
  };

  var lib = MarkdownIt;
  var markdownIt = lib;

  /*! markdown-it-anchor 7.0.2-27 https://github.com//GerHobbelt/markdown-it-anchor @license UNLICENSE */
  var slugify = function slugify(s) {
    return encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-'));
  };

  var position = {
    'false': 'push',
    'true': 'unshift'
  };

  var permalinkHref = function permalinkHref(slug) {
    return "#" + slug;
  };

  var permalinkAttrs = function permalinkAttrs(slug) {
    return {};
  };

  function renderPermalink(slug, opts, state, idx) {
    var space = function space() {
      return Object.assign(new state.Token('text', '', 0), {
        content: ' '
      });
    };

    var linkTokens = [Object.assign(new state.Token('link_open', 'a', 1), {
      attrs: [].concat(opts.permalinkClass ? [['class', opts.permalinkClass]] : [], [['href', opts.permalinkHref(slug, state)]], Object.entries(opts.permalinkAttrs(slug, state)))
    }), Object.assign(new state.Token('html_block', '', 0), {
      content: opts.permalinkSymbol
    }), new state.Token('link_close', 'a', -1)]; // `push` or `unshift` according to position option.
    // Space is at the opposite side.

    if (opts.permalinkSpace) {
      linkTokens[position[!opts.permalinkBefore]](space());
    }

    for (var j = idx + 1, iK = state.tokens.length; j < iK; j++) {
      var _token$children;

      var token = state.tokens[j];

      if (token.type === 'heading_close') {
        break;
      }

      if (!token.children) {
        continue;
      }

      (_token$children = token.children)[position[opts.permalinkBefore]].apply(_token$children, linkTokens);

      break;
    }
  }

  function uniqueSlug(slug, slugs, failOnNonUnique, startIndex) {
    // If first slug, return as is.
    var key = slug;
    var n = startIndex;

    if (slugs.has(key) && failOnNonUnique) {
      throw new Error("The ID attribute '" + slug + "' defined by user or other markdown-it plugin is not unique. Please fix it in your markdown to continue.");
    }

    while (slugs.has(key)) {
      // Duplicate slug, add a `-1`, `-2`, etc. to keep ID unique.
      key = slug + "-" + n++;
    } // Mark this slug as used in the environment.


    slugs.set(key, true);
    return key;
  }

  var isLevelSelectedNumber = function isLevelSelectedNumber(selection) {
    return function (level) {
      return level <= selection;
    };
  };

  var isLevelSelectedArray = function isLevelSelectedArray(selection) {
    return function (level) {
      return selection.includes(level);
    };
  };

  var anchor = function anchor(md, opts) {
    opts = Object.assign({}, anchor.defaults, opts);
    md.core.ruler.push('anchor', function (state) {
      var slugs = new Map();
      var tokens = state.tokens;
      var isLevelSelected = Array.isArray(opts.level) ? isLevelSelectedArray(opts.level) : isLevelSelectedNumber(opts.level);
      tokens.forEach(function (token, i) {
        if (token.type !== 'heading_open') {
          return;
        } // Before we do anything, we must collect all previously defined ID attributes to ensure we won't generate any duplicates:


        var slug = token.attrGet('id');

        if (slug != null) {
          // mark existing slug/ID as unique, at least.
          // IFF it collides, FAIL!
          slug = uniqueSlug(slug, slugs, true);
        }
      });
      tokens.forEach(function (token, i) {
        if (token.type !== 'heading_open') {
          return;
        }

        if (!isLevelSelected(Number(token.tag.substr(1)))) {
          return;
        } // Aggregate the next token children text.


        var keyparts = [];

        for (var j = i + 1, iK = tokens.length; j < iK; j++) {
          var _token = tokens[j];

          if (_token.type === 'heading_close') {
            break;
          }

          if (!_token.children) {
            continue;
          }

          var keypart = _token.children.filter(function (token) {
            return token.type === 'text' || token.type === 'code_inline';
          }).reduce(function (acc, t) {
            return acc + t.content;
          }, '').trim();

          if (keypart.length > 0) {
            keyparts.push(keypart);
          }
        }

        var title = keyparts.join(' ');
        var slug = token.attrGet('id');

        if (slug == null) {
          slug = uniqueSlug(opts.slugify(title), slugs, false, opts.uniqueSlugStartIndex);
          token.attrSet('id', slug);
        }

        if (opts.permalink) {
          opts.renderPermalink(slug, opts, state, i);
        }

        if (opts.callback) {
          opts.callback(token, {
            slug: slug,
            title: title
          });
        }
      });
    });
  };

  anchor.defaults = {
    level: 6,
    // **max** level or array of levels
    slugify: slugify,
    uniqueSlugStartIndex: 1,
    permalink: false,
    renderPermalink: renderPermalink,
    permalinkClass: 'header-anchor',
    permalinkSpace: true,
    permalinkSymbol: '¶',
    permalinkBefore: false,
    permalinkHref: permalinkHref,
    permalinkAttrs: permalinkAttrs
  };

  var markdownItAnchor = {
    __proto__: null,
    'default': anchor
  };

  function createCommonjsModule$1(fn) {
    var module = { exports: {} };
  	return fn(module, module.exports), module.exports;
  }

  /* 
   * List of Unicode code that are flagged as letter.
   *
   * Contains Unicode code of:
   * - Lu = Letter, uppercase
   * - Ll = Letter, lowercase
   * - Lt = Letter, titlecase
   * - Lm = Letter, modifier
   * - Lo = Letter, other
   *
   * This list has been computed from http://unicode.org/Public/UNIDATA/UnicodeData.txt
   *
   */
  var L_1 = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 170, 181, 186, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 567, 568, 569, 570, 571, 572, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666, 667, 668, 669, 670, 671, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 684, 685, 686, 687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 705, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 736, 737, 738, 739, 740, 748, 750, 880, 881, 882, 883, 884, 886, 887, 890, 891, 892, 893, 895, 902, 904, 905, 906, 908, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243, 1244, 1245, 1246, 1247, 1248, 1249, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1264, 1265, 1266, 1267, 1268, 1269, 1270, 1271, 1272, 1273, 1274, 1275, 1276, 1277, 1278, 1279, 1280, 1281, 1282, 1283, 1284, 1285, 1286, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1295, 1296, 1297, 1298, 1299, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1308, 1309, 1310, 1311, 1312, 1313, 1314, 1315, 1316, 1317, 1318, 1319, 1320, 1321, 1322, 1323, 1324, 1325, 1326, 1327, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341, 1342, 1343, 1344, 1345, 1346, 1347, 1348, 1349, 1350, 1351, 1352, 1353, 1354, 1355, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1369, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1384, 1385, 1386, 1387, 1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1488, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1501, 1502, 1503, 1504, 1505, 1506, 1507, 1508, 1509, 1510, 1511, 1512, 1513, 1514, 1520, 1521, 1522, 1568, 1569, 1570, 1571, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1579, 1580, 1581, 1582, 1583, 1584, 1585, 1586, 1587, 1588, 1589, 1590, 1591, 1592, 1593, 1594, 1595, 1596, 1597, 1598, 1599, 1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1646, 1647, 1649, 1650, 1651, 1652, 1653, 1654, 1655, 1656, 1657, 1658, 1659, 1660, 1661, 1662, 1663, 1664, 1665, 1666, 1667, 1668, 1669, 1670, 1671, 1672, 1673, 1674, 1675, 1676, 1677, 1678, 1679, 1680, 1681, 1682, 1683, 1684, 1685, 1686, 1687, 1688, 1689, 1690, 1691, 1692, 1693, 1694, 1695, 1696, 1697, 1698, 1699, 1700, 1701, 1702, 1703, 1704, 1705, 1706, 1707, 1708, 1709, 1710, 1711, 1712, 1713, 1714, 1715, 1716, 1717, 1718, 1719, 1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727, 1728, 1729, 1730, 1731, 1732, 1733, 1734, 1735, 1736, 1737, 1738, 1739, 1740, 1741, 1742, 1743, 1744, 1745, 1746, 1747, 1749, 1765, 1766, 1774, 1775, 1786, 1787, 1788, 1791, 1808, 1810, 1811, 1812, 1813, 1814, 1815, 1816, 1817, 1818, 1819, 1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1830, 1831, 1832, 1833, 1834, 1835, 1836, 1837, 1838, 1839, 1869, 1870, 1871, 1872, 1873, 1874, 1875, 1876, 1877, 1878, 1879, 1880, 1881, 1882, 1883, 1884, 1885, 1886, 1887, 1888, 1889, 1890, 1891, 1892, 1893, 1894, 1895, 1896, 1897, 1898, 1899, 1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908, 1909, 1910, 1911, 1912, 1913, 1914, 1915, 1916, 1917, 1918, 1919, 1920, 1921, 1922, 1923, 1924, 1925, 1926, 1927, 1928, 1929, 1930, 1931, 1932, 1933, 1934, 1935, 1936, 1937, 1938, 1939, 1940, 1941, 1942, 1943, 1944, 1945, 1946, 1947, 1948, 1949, 1950, 1951, 1952, 1953, 1954, 1955, 1956, 1957, 1969, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2036, 2037, 2042, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056, 2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067, 2068, 2069, 2074, 2084, 2088, 2112, 2113, 2114, 2115, 2116, 2117, 2118, 2119, 2120, 2121, 2122, 2123, 2124, 2125, 2126, 2127, 2128, 2129, 2130, 2131, 2132, 2133, 2134, 2135, 2136, 2208, 2209, 2210, 2211, 2212, 2213, 2214, 2215, 2216, 2217, 2218, 2219, 2220, 2221, 2222, 2223, 2224, 2225, 2226, 2227, 2228, 2308, 2309, 2310, 2311, 2312, 2313, 2314, 2315, 2316, 2317, 2318, 2319, 2320, 2321, 2322, 2323, 2324, 2325, 2326, 2327, 2328, 2329, 2330, 2331, 2332, 2333, 2334, 2335, 2336, 2337, 2338, 2339, 2340, 2341, 2342, 2343, 2344, 2345, 2346, 2347, 2348, 2349, 2350, 2351, 2352, 2353, 2354, 2355, 2356, 2357, 2358, 2359, 2360, 2361, 2365, 2384, 2392, 2393, 2394, 2395, 2396, 2397, 2398, 2399, 2400, 2401, 2417, 2418, 2419, 2420, 2421, 2422, 2423, 2424, 2425, 2426, 2427, 2428, 2429, 2430, 2431, 2432, 2437, 2438, 2439, 2440, 2441, 2442, 2443, 2444, 2447, 2448, 2451, 2452, 2453, 2454, 2455, 2456, 2457, 2458, 2459, 2460, 2461, 2462, 2463, 2464, 2465, 2466, 2467, 2468, 2469, 2470, 2471, 2472, 2474, 2475, 2476, 2477, 2478, 2479, 2480, 2482, 2486, 2487, 2488, 2489, 2493, 2510, 2524, 2525, 2527, 2528, 2529, 2544, 2545, 2565, 2566, 2567, 2568, 2569, 2570, 2575, 2576, 2579, 2580, 2581, 2582, 2583, 2584, 2585, 2586, 2587, 2588, 2589, 2590, 2591, 2592, 2593, 2594, 2595, 2596, 2597, 2598, 2599, 2600, 2602, 2603, 2604, 2605, 2606, 2607, 2608, 2610, 2611, 2613, 2614, 2616, 2617, 2649, 2650, 2651, 2652, 2654, 2674, 2675, 2676, 2693, 2694, 2695, 2696, 2697, 2698, 2699, 2700, 2701, 2703, 2704, 2705, 2707, 2708, 2709, 2710, 2711, 2712, 2713, 2714, 2715, 2716, 2717, 2718, 2719, 2720, 2721, 2722, 2723, 2724, 2725, 2726, 2727, 2728, 2730, 2731, 2732, 2733, 2734, 2735, 2736, 2738, 2739, 2741, 2742, 2743, 2744, 2745, 2749, 2768, 2784, 2785, 2809, 2821, 2822, 2823, 2824, 2825, 2826, 2827, 2828, 2831, 2832, 2835, 2836, 2837, 2838, 2839, 2840, 2841, 2842, 2843, 2844, 2845, 2846, 2847, 2848, 2849, 2850, 2851, 2852, 2853, 2854, 2855, 2856, 2858, 2859, 2860, 2861, 2862, 2863, 2864, 2866, 2867, 2869, 2870, 2871, 2872, 2873, 2877, 2908, 2909, 2911, 2912, 2913, 2929, 2947, 2949, 2950, 2951, 2952, 2953, 2954, 2958, 2959, 2960, 2962, 2963, 2964, 2965, 2969, 2970, 2972, 2974, 2975, 2979, 2980, 2984, 2985, 2986, 2990, 2991, 2992, 2993, 2994, 2995, 2996, 2997, 2998, 2999, 3000, 3001, 3024, 3077, 3078, 3079, 3080, 3081, 3082, 3083, 3084, 3086, 3087, 3088, 3090, 3091, 3092, 3093, 3094, 3095, 3096, 3097, 3098, 3099, 3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110, 3111, 3112, 3114, 3115, 3116, 3117, 3118, 3119, 3120, 3121, 3122, 3123, 3124, 3125, 3126, 3127, 3128, 3129, 3133, 3160, 3161, 3162, 3168, 3169, 3205, 3206, 3207, 3208, 3209, 3210, 3211, 3212, 3214, 3215, 3216, 3218, 3219, 3220, 3221, 3222, 3223, 3224, 3225, 3226, 3227, 3228, 3229, 3230, 3231, 3232, 3233, 3234, 3235, 3236, 3237, 3238, 3239, 3240, 3242, 3243, 3244, 3245, 3246, 3247, 3248, 3249, 3250, 3251, 3253, 3254, 3255, 3256, 3257, 3261, 3294, 3296, 3297, 3313, 3314, 3333, 3334, 3335, 3336, 3337, 3338, 3339, 3340, 3342, 3343, 3344, 3346, 3347, 3348, 3349, 3350, 3351, 3352, 3353, 3354, 3355, 3356, 3357, 3358, 3359, 3360, 3361, 3362, 3363, 3364, 3365, 3366, 3367, 3368, 3369, 3370, 3371, 3372, 3373, 3374, 3375, 3376, 3377, 3378, 3379, 3380, 3381, 3382, 3383, 3384, 3385, 3386, 3389, 3406, 3423, 3424, 3425, 3450, 3451, 3452, 3453, 3454, 3455, 3461, 3462, 3463, 3464, 3465, 3466, 3467, 3468, 3469, 3470, 3471, 3472, 3473, 3474, 3475, 3476, 3477, 3478, 3482, 3483, 3484, 3485, 3486, 3487, 3488, 3489, 3490, 3491, 3492, 3493, 3494, 3495, 3496, 3497, 3498, 3499, 3500, 3501, 3502, 3503, 3504, 3505, 3507, 3508, 3509, 3510, 3511, 3512, 3513, 3514, 3515, 3517, 3520, 3521, 3522, 3523, 3524, 3525, 3526, 3585, 3586, 3587, 3588, 3589, 3590, 3591, 3592, 3593, 3594, 3595, 3596, 3597, 3598, 3599, 3600, 3601, 3602, 3603, 3604, 3605, 3606, 3607, 3608, 3609, 3610, 3611, 3612, 3613, 3614, 3615, 3616, 3617, 3618, 3619, 3620, 3621, 3622, 3623, 3624, 3625, 3626, 3627, 3628, 3629, 3630, 3631, 3632, 3634, 3635, 3648, 3649, 3650, 3651, 3652, 3653, 3654, 3713, 3714, 3716, 3719, 3720, 3722, 3725, 3732, 3733, 3734, 3735, 3737, 3738, 3739, 3740, 3741, 3742, 3743, 3745, 3746, 3747, 3749, 3751, 3754, 3755, 3757, 3758, 3759, 3760, 3762, 3763, 3773, 3776, 3777, 3778, 3779, 3780, 3782, 3804, 3805, 3806, 3807, 3840, 3904, 3905, 3906, 3907, 3908, 3909, 3910, 3911, 3913, 3914, 3915, 3916, 3917, 3918, 3919, 3920, 3921, 3922, 3923, 3924, 3925, 3926, 3927, 3928, 3929, 3930, 3931, 3932, 3933, 3934, 3935, 3936, 3937, 3938, 3939, 3940, 3941, 3942, 3943, 3944, 3945, 3946, 3947, 3948, 3976, 3977, 3978, 3979, 3980, 4096, 4097, 4098, 4099, 4100, 4101, 4102, 4103, 4104, 4105, 4106, 4107, 4108, 4109, 4110, 4111, 4112, 4113, 4114, 4115, 4116, 4117, 4118, 4119, 4120, 4121, 4122, 4123, 4124, 4125, 4126, 4127, 4128, 4129, 4130, 4131, 4132, 4133, 4134, 4135, 4136, 4137, 4138, 4159, 4176, 4177, 4178, 4179, 4180, 4181, 4186, 4187, 4188, 4189, 4193, 4197, 4198, 4206, 4207, 4208, 4213, 4214, 4215, 4216, 4217, 4218, 4219, 4220, 4221, 4222, 4223, 4224, 4225, 4238, 4256, 4257, 4258, 4259, 4260, 4261, 4262, 4263, 4264, 4265, 4266, 4267, 4268, 4269, 4270, 4271, 4272, 4273, 4274, 4275, 4276, 4277, 4278, 4279, 4280, 4281, 4282, 4283, 4284, 4285, 4286, 4287, 4288, 4289, 4290, 4291, 4292, 4293, 4295, 4301, 4304, 4305, 4306, 4307, 4308, 4309, 4310, 4311, 4312, 4313, 4314, 4315, 4316, 4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324, 4325, 4326, 4327, 4328, 4329, 4330, 4331, 4332, 4333, 4334, 4335, 4336, 4337, 4338, 4339, 4340, 4341, 4342, 4343, 4344, 4345, 4346, 4348, 4349, 4350, 4351, 4352, 4353, 4354, 4355, 4356, 4357, 4358, 4359, 4360, 4361, 4362, 4363, 4364, 4365, 4366, 4367, 4368, 4369, 4370, 4371, 4372, 4373, 4374, 4375, 4376, 4377, 4378, 4379, 4380, 4381, 4382, 4383, 4384, 4385, 4386, 4387, 4388, 4389, 4390, 4391, 4392, 4393, 4394, 4395, 4396, 4397, 4398, 4399, 4400, 4401, 4402, 4403, 4404, 4405, 4406, 4407, 4408, 4409, 4410, 4411, 4412, 4413, 4414, 4415, 4416, 4417, 4418, 4419, 4420, 4421, 4422, 4423, 4424, 4425, 4426, 4427, 4428, 4429, 4430, 4431, 4432, 4433, 4434, 4435, 4436, 4437, 4438, 4439, 4440, 4441, 4442, 4443, 4444, 4445, 4446, 4447, 4448, 4449, 4450, 4451, 4452, 4453, 4454, 4455, 4456, 4457, 4458, 4459, 4460, 4461, 4462, 4463, 4464, 4465, 4466, 4467, 4468, 4469, 4470, 4471, 4472, 4473, 4474, 4475, 4476, 4477, 4478, 4479, 4480, 4481, 4482, 4483, 4484, 4485, 4486, 4487, 4488, 4489, 4490, 4491, 4492, 4493, 4494, 4495, 4496, 4497, 4498, 4499, 4500, 4501, 4502, 4503, 4504, 4505, 4506, 4507, 4508, 4509, 4510, 4511, 4512, 4513, 4514, 4515, 4516, 4517, 4518, 4519, 4520, 4521, 4522, 4523, 4524, 4525, 4526, 4527, 4528, 4529, 4530, 4531, 4532, 4533, 4534, 4535, 4536, 4537, 4538, 4539, 4540, 4541, 4542, 4543, 4544, 4545, 4546, 4547, 4548, 4549, 4550, 4551, 4552, 4553, 4554, 4555, 4556, 4557, 4558, 4559, 4560, 4561, 4562, 4563, 4564, 4565, 4566, 4567, 4568, 4569, 4570, 4571, 4572, 4573, 4574, 4575, 4576, 4577, 4578, 4579, 4580, 4581, 4582, 4583, 4584, 4585, 4586, 4587, 4588, 4589, 4590, 4591, 4592, 4593, 4594, 4595, 4596, 4597, 4598, 4599, 4600, 4601, 4602, 4603, 4604, 4605, 4606, 4607, 4608, 4609, 4610, 4611, 4612, 4613, 4614, 4615, 4616, 4617, 4618, 4619, 4620, 4621, 4622, 4623, 4624, 4625, 4626, 4627, 4628, 4629, 4630, 4631, 4632, 4633, 4634, 4635, 4636, 4637, 4638, 4639, 4640, 4641, 4642, 4643, 4644, 4645, 4646, 4647, 4648, 4649, 4650, 4651, 4652, 4653, 4654, 4655, 4656, 4657, 4658, 4659, 4660, 4661, 4662, 4663, 4664, 4665, 4666, 4667, 4668, 4669, 4670, 4671, 4672, 4673, 4674, 4675, 4676, 4677, 4678, 4679, 4680, 4682, 4683, 4684, 4685, 4688, 4689, 4690, 4691, 4692, 4693, 4694, 4696, 4698, 4699, 4700, 4701, 4704, 4705, 4706, 4707, 4708, 4709, 4710, 4711, 4712, 4713, 4714, 4715, 4716, 4717, 4718, 4719, 4720, 4721, 4722, 4723, 4724, 4725, 4726, 4727, 4728, 4729, 4730, 4731, 4732, 4733, 4734, 4735, 4736, 4737, 4738, 4739, 4740, 4741, 4742, 4743, 4744, 4746, 4747, 4748, 4749, 4752, 4753, 4754, 4755, 4756, 4757, 4758, 4759, 4760, 4761, 4762, 4763, 4764, 4765, 4766, 4767, 4768, 4769, 4770, 4771, 4772, 4773, 4774, 4775, 4776, 4777, 4778, 4779, 4780, 4781, 4782, 4783, 4784, 4786, 4787, 4788, 4789, 4792, 4793, 4794, 4795, 4796, 4797, 4798, 4800, 4802, 4803, 4804, 4805, 4808, 4809, 4810, 4811, 4812, 4813, 4814, 4815, 4816, 4817, 4818, 4819, 4820, 4821, 4822, 4824, 4825, 4826, 4827, 4828, 4829, 4830, 4831, 4832, 4833, 4834, 4835, 4836, 4837, 4838, 4839, 4840, 4841, 4842, 4843, 4844, 4845, 4846, 4847, 4848, 4849, 4850, 4851, 4852, 4853, 4854, 4855, 4856, 4857, 4858, 4859, 4860, 4861, 4862, 4863, 4864, 4865, 4866, 4867, 4868, 4869, 4870, 4871, 4872, 4873, 4874, 4875, 4876, 4877, 4878, 4879, 4880, 4882, 4883, 4884, 4885, 4888, 4889, 4890, 4891, 4892, 4893, 4894, 4895, 4896, 4897, 4898, 4899, 4900, 4901, 4902, 4903, 4904, 4905, 4906, 4907, 4908, 4909, 4910, 4911, 4912, 4913, 4914, 4915, 4916, 4917, 4918, 4919, 4920, 4921, 4922, 4923, 4924, 4925, 4926, 4927, 4928, 4929, 4930, 4931, 4932, 4933, 4934, 4935, 4936, 4937, 4938, 4939, 4940, 4941, 4942, 4943, 4944, 4945, 4946, 4947, 4948, 4949, 4950, 4951, 4952, 4953, 4954, 4992, 4993, 4994, 4995, 4996, 4997, 4998, 4999, 5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5024, 5025, 5026, 5027, 5028, 5029, 5030, 5031, 5032, 5033, 5034, 5035, 5036, 5037, 5038, 5039, 5040, 5041, 5042, 5043, 5044, 5045, 5046, 5047, 5048, 5049, 5050, 5051, 5052, 5053, 5054, 5055, 5056, 5057, 5058, 5059, 5060, 5061, 5062, 5063, 5064, 5065, 5066, 5067, 5068, 5069, 5070, 5071, 5072, 5073, 5074, 5075, 5076, 5077, 5078, 5079, 5080, 5081, 5082, 5083, 5084, 5085, 5086, 5087, 5088, 5089, 5090, 5091, 5092, 5093, 5094, 5095, 5096, 5097, 5098, 5099, 5100, 5101, 5102, 5103, 5104, 5105, 5106, 5107, 5108, 5109, 5112, 5113, 5114, 5115, 5116, 5117, 5121, 5122, 5123, 5124, 5125, 5126, 5127, 5128, 5129, 5130, 5131, 5132, 5133, 5134, 5135, 5136, 5137, 5138, 5139, 5140, 5141, 5142, 5143, 5144, 5145, 5146, 5147, 5148, 5149, 5150, 5151, 5152, 5153, 5154, 5155, 5156, 5157, 5158, 5159, 5160, 5161, 5162, 5163, 5164, 5165, 5166, 5167, 5168, 5169, 5170, 5171, 5172, 5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190, 5191, 5192, 5193, 5194, 5195, 5196, 5197, 5198, 5199, 5200, 5201, 5202, 5203, 5204, 5205, 5206, 5207, 5208, 5209, 5210, 5211, 5212, 5213, 5214, 5215, 5216, 5217, 5218, 5219, 5220, 5221, 5222, 5223, 5224, 5225, 5226, 5227, 5228, 5229, 5230, 5231, 5232, 5233, 5234, 5235, 5236, 5237, 5238, 5239, 5240, 5241, 5242, 5243, 5244, 5245, 5246, 5247, 5248, 5249, 5250, 5251, 5252, 5253, 5254, 5255, 5256, 5257, 5258, 5259, 5260, 5261, 5262, 5263, 5264, 5265, 5266, 5267, 5268, 5269, 5270, 5271, 5272, 5273, 5274, 5275, 5276, 5277, 5278, 5279, 5280, 5281, 5282, 5283, 5284, 5285, 5286, 5287, 5288, 5289, 5290, 5291, 5292, 5293, 5294, 5295, 5296, 5297, 5298, 5299, 5300, 5301, 5302, 5303, 5304, 5305, 5306, 5307, 5308, 5309, 5310, 5311, 5312, 5313, 5314, 5315, 5316, 5317, 5318, 5319, 5320, 5321, 5322, 5323, 5324, 5325, 5326, 5327, 5328, 5329, 5330, 5331, 5332, 5333, 5334, 5335, 5336, 5337, 5338, 5339, 5340, 5341, 5342, 5343, 5344, 5345, 5346, 5347, 5348, 5349, 5350, 5351, 5352, 5353, 5354, 5355, 5356, 5357, 5358, 5359, 5360, 5361, 5362, 5363, 5364, 5365, 5366, 5367, 5368, 5369, 5370, 5371, 5372, 5373, 5374, 5375, 5376, 5377, 5378, 5379, 5380, 5381, 5382, 5383, 5384, 5385, 5386, 5387, 5388, 5389, 5390, 5391, 5392, 5393, 5394, 5395, 5396, 5397, 5398, 5399, 5400, 5401, 5402, 5403, 5404, 5405, 5406, 5407, 5408, 5409, 5410, 5411, 5412, 5413, 5414, 5415, 5416, 5417, 5418, 5419, 5420, 5421, 5422, 5423, 5424, 5425, 5426, 5427, 5428, 5429, 5430, 5431, 5432, 5433, 5434, 5435, 5436, 5437, 5438, 5439, 5440, 5441, 5442, 5443, 5444, 5445, 5446, 5447, 5448, 5449, 5450, 5451, 5452, 5453, 5454, 5455, 5456, 5457, 5458, 5459, 5460, 5461, 5462, 5463, 5464, 5465, 5466, 5467, 5468, 5469, 5470, 5471, 5472, 5473, 5474, 5475, 5476, 5477, 5478, 5479, 5480, 5481, 5482, 5483, 5484, 5485, 5486, 5487, 5488, 5489, 5490, 5491, 5492, 5493, 5494, 5495, 5496, 5497, 5498, 5499, 5500, 5501, 5502, 5503, 5504, 5505, 5506, 5507, 5508, 5509, 5510, 5511, 5512, 5513, 5514, 5515, 5516, 5517, 5518, 5519, 5520, 5521, 5522, 5523, 5524, 5525, 5526, 5527, 5528, 5529, 5530, 5531, 5532, 5533, 5534, 5535, 5536, 5537, 5538, 5539, 5540, 5541, 5542, 5543, 5544, 5545, 5546, 5547, 5548, 5549, 5550, 5551, 5552, 5553, 5554, 5555, 5556, 5557, 5558, 5559, 5560, 5561, 5562, 5563, 5564, 5565, 5566, 5567, 5568, 5569, 5570, 5571, 5572, 5573, 5574, 5575, 5576, 5577, 5578, 5579, 5580, 5581, 5582, 5583, 5584, 5585, 5586, 5587, 5588, 5589, 5590, 5591, 5592, 5593, 5594, 5595, 5596, 5597, 5598, 5599, 5600, 5601, 5602, 5603, 5604, 5605, 5606, 5607, 5608, 5609, 5610, 5611, 5612, 5613, 5614, 5615, 5616, 5617, 5618, 5619, 5620, 5621, 5622, 5623, 5624, 5625, 5626, 5627, 5628, 5629, 5630, 5631, 5632, 5633, 5634, 5635, 5636, 5637, 5638, 5639, 5640, 5641, 5642, 5643, 5644, 5645, 5646, 5647, 5648, 5649, 5650, 5651, 5652, 5653, 5654, 5655, 5656, 5657, 5658, 5659, 5660, 5661, 5662, 5663, 5664, 5665, 5666, 5667, 5668, 5669, 5670, 5671, 5672, 5673, 5674, 5675, 5676, 5677, 5678, 5679, 5680, 5681, 5682, 5683, 5684, 5685, 5686, 5687, 5688, 5689, 5690, 5691, 5692, 5693, 5694, 5695, 5696, 5697, 5698, 5699, 5700, 5701, 5702, 5703, 5704, 5705, 5706, 5707, 5708, 5709, 5710, 5711, 5712, 5713, 5714, 5715, 5716, 5717, 5718, 5719, 5720, 5721, 5722, 5723, 5724, 5725, 5726, 5727, 5728, 5729, 5730, 5731, 5732, 5733, 5734, 5735, 5736, 5737, 5738, 5739, 5740, 5743, 5744, 5745, 5746, 5747, 5748, 5749, 5750, 5751, 5752, 5753, 5754, 5755, 5756, 5757, 5758, 5759, 5761, 5762, 5763, 5764, 5765, 5766, 5767, 5768, 5769, 5770, 5771, 5772, 5773, 5774, 5775, 5776, 5777, 5778, 5779, 5780, 5781, 5782, 5783, 5784, 5785, 5786, 5792, 5793, 5794, 5795, 5796, 5797, 5798, 5799, 5800, 5801, 5802, 5803, 5804, 5805, 5806, 5807, 5808, 5809, 5810, 5811, 5812, 5813, 5814, 5815, 5816, 5817, 5818, 5819, 5820, 5821, 5822, 5823, 5824, 5825, 5826, 5827, 5828, 5829, 5830, 5831, 5832, 5833, 5834, 5835, 5836, 5837, 5838, 5839, 5840, 5841, 5842, 5843, 5844, 5845, 5846, 5847, 5848, 5849, 5850, 5851, 5852, 5853, 5854, 5855, 5856, 5857, 5858, 5859, 5860, 5861, 5862, 5863, 5864, 5865, 5866, 5873, 5874, 5875, 5876, 5877, 5878, 5879, 5880, 5888, 5889, 5890, 5891, 5892, 5893, 5894, 5895, 5896, 5897, 5898, 5899, 5900, 5902, 5903, 5904, 5905, 5920, 5921, 5922, 5923, 5924, 5925, 5926, 5927, 5928, 5929, 5930, 5931, 5932, 5933, 5934, 5935, 5936, 5937, 5952, 5953, 5954, 5955, 5956, 5957, 5958, 5959, 5960, 5961, 5962, 5963, 5964, 5965, 5966, 5967, 5968, 5969, 5984, 5985, 5986, 5987, 5988, 5989, 5990, 5991, 5992, 5993, 5994, 5995, 5996, 5998, 5999, 6000, 6016, 6017, 6018, 6019, 6020, 6021, 6022, 6023, 6024, 6025, 6026, 6027, 6028, 6029, 6030, 6031, 6032, 6033, 6034, 6035, 6036, 6037, 6038, 6039, 6040, 6041, 6042, 6043, 6044, 6045, 6046, 6047, 6048, 6049, 6050, 6051, 6052, 6053, 6054, 6055, 6056, 6057, 6058, 6059, 6060, 6061, 6062, 6063, 6064, 6065, 6066, 6067, 6103, 6108, 6176, 6177, 6178, 6179, 6180, 6181, 6182, 6183, 6184, 6185, 6186, 6187, 6188, 6189, 6190, 6191, 6192, 6193, 6194, 6195, 6196, 6197, 6198, 6199, 6200, 6201, 6202, 6203, 6204, 6205, 6206, 6207, 6208, 6209, 6210, 6211, 6212, 6213, 6214, 6215, 6216, 6217, 6218, 6219, 6220, 6221, 6222, 6223, 6224, 6225, 6226, 6227, 6228, 6229, 6230, 6231, 6232, 6233, 6234, 6235, 6236, 6237, 6238, 6239, 6240, 6241, 6242, 6243, 6244, 6245, 6246, 6247, 6248, 6249, 6250, 6251, 6252, 6253, 6254, 6255, 6256, 6257, 6258, 6259, 6260, 6261, 6262, 6263, 6272, 6273, 6274, 6275, 6276, 6277, 6278, 6279, 6280, 6281, 6282, 6283, 6284, 6285, 6286, 6287, 6288, 6289, 6290, 6291, 6292, 6293, 6294, 6295, 6296, 6297, 6298, 6299, 6300, 6301, 6302, 6303, 6304, 6305, 6306, 6307, 6308, 6309, 6310, 6311, 6312, 6314, 6320, 6321, 6322, 6323, 6324, 6325, 6326, 6327, 6328, 6329, 6330, 6331, 6332, 6333, 6334, 6335, 6336, 6337, 6338, 6339, 6340, 6341, 6342, 6343, 6344, 6345, 6346, 6347, 6348, 6349, 6350, 6351, 6352, 6353, 6354, 6355, 6356, 6357, 6358, 6359, 6360, 6361, 6362, 6363, 6364, 6365, 6366, 6367, 6368, 6369, 6370, 6371, 6372, 6373, 6374, 6375, 6376, 6377, 6378, 6379, 6380, 6381, 6382, 6383, 6384, 6385, 6386, 6387, 6388, 6389, 6400, 6401, 6402, 6403, 6404, 6405, 6406, 6407, 6408, 6409, 6410, 6411, 6412, 6413, 6414, 6415, 6416, 6417, 6418, 6419, 6420, 6421, 6422, 6423, 6424, 6425, 6426, 6427, 6428, 6429, 6430, 6480, 6481, 6482, 6483, 6484, 6485, 6486, 6487, 6488, 6489, 6490, 6491, 6492, 6493, 6494, 6495, 6496, 6497, 6498, 6499, 6500, 6501, 6502, 6503, 6504, 6505, 6506, 6507, 6508, 6509, 6512, 6513, 6514, 6515, 6516, 6528, 6529, 6530, 6531, 6532, 6533, 6534, 6535, 6536, 6537, 6538, 6539, 6540, 6541, 6542, 6543, 6544, 6545, 6546, 6547, 6548, 6549, 6550, 6551, 6552, 6553, 6554, 6555, 6556, 6557, 6558, 6559, 6560, 6561, 6562, 6563, 6564, 6565, 6566, 6567, 6568, 6569, 6570, 6571, 6576, 6577, 6578, 6579, 6580, 6581, 6582, 6583, 6584, 6585, 6586, 6587, 6588, 6589, 6590, 6591, 6592, 6593, 6594, 6595, 6596, 6597, 6598, 6599, 6600, 6601, 6656, 6657, 6658, 6659, 6660, 6661, 6662, 6663, 6664, 6665, 6666, 6667, 6668, 6669, 6670, 6671, 6672, 6673, 6674, 6675, 6676, 6677, 6678, 6688, 6689, 6690, 6691, 6692, 6693, 6694, 6695, 6696, 6697, 6698, 6699, 6700, 6701, 6702, 6703, 6704, 6705, 6706, 6707, 6708, 6709, 6710, 6711, 6712, 6713, 6714, 6715, 6716, 6717, 6718, 6719, 6720, 6721, 6722, 6723, 6724, 6725, 6726, 6727, 6728, 6729, 6730, 6731, 6732, 6733, 6734, 6735, 6736, 6737, 6738, 6739, 6740, 6823, 6917, 6918, 6919, 6920, 6921, 6922, 6923, 6924, 6925, 6926, 6927, 6928, 6929, 6930, 6931, 6932, 6933, 6934, 6935, 6936, 6937, 6938, 6939, 6940, 6941, 6942, 6943, 6944, 6945, 6946, 6947, 6948, 6949, 6950, 6951, 6952, 6953, 6954, 6955, 6956, 6957, 6958, 6959, 6960, 6961, 6962, 6963, 6981, 6982, 6983, 6984, 6985, 6986, 6987, 7043, 7044, 7045, 7046, 7047, 7048, 7049, 7050, 7051, 7052, 7053, 7054, 7055, 7056, 7057, 7058, 7059, 7060, 7061, 7062, 7063, 7064, 7065, 7066, 7067, 7068, 7069, 7070, 7071, 7072, 7086, 7087, 7098, 7099, 7100, 7101, 7102, 7103, 7104, 7105, 7106, 7107, 7108, 7109, 7110, 7111, 7112, 7113, 7114, 7115, 7116, 7117, 7118, 7119, 7120, 7121, 7122, 7123, 7124, 7125, 7126, 7127, 7128, 7129, 7130, 7131, 7132, 7133, 7134, 7135, 7136, 7137, 7138, 7139, 7140, 7141, 7168, 7169, 7170, 7171, 7172, 7173, 7174, 7175, 7176, 7177, 7178, 7179, 7180, 7181, 7182, 7183, 7184, 7185, 7186, 7187, 7188, 7189, 7190, 7191, 7192, 7193, 7194, 7195, 7196, 7197, 7198, 7199, 7200, 7201, 7202, 7203, 7245, 7246, 7247, 7258, 7259, 7260, 7261, 7262, 7263, 7264, 7265, 7266, 7267, 7268, 7269, 7270, 7271, 7272, 7273, 7274, 7275, 7276, 7277, 7278, 7279, 7280, 7281, 7282, 7283, 7284, 7285, 7286, 7287, 7288, 7289, 7290, 7291, 7292, 7293, 7401, 7402, 7403, 7404, 7406, 7407, 7408, 7409, 7413, 7414, 7424, 7425, 7426, 7427, 7428, 7429, 7430, 7431, 7432, 7433, 7434, 7435, 7436, 7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444, 7445, 7446, 7447, 7448, 7449, 7450, 7451, 7452, 7453, 7454, 7455, 7456, 7457, 7458, 7459, 7460, 7461, 7462, 7463, 7464, 7465, 7466, 7467, 7468, 7469, 7470, 7471, 7472, 7473, 7474, 7475, 7476, 7477, 7478, 7479, 7480, 7481, 7482, 7483, 7484, 7485, 7486, 7487, 7488, 7489, 7490, 7491, 7492, 7493, 7494, 7495, 7496, 7497, 7498, 7499, 7500, 7501, 7502, 7503, 7504, 7505, 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7513, 7514, 7515, 7516, 7517, 7518, 7519, 7520, 7521, 7522, 7523, 7524, 7525, 7526, 7527, 7528, 7529, 7530, 7531, 7532, 7533, 7534, 7535, 7536, 7537, 7538, 7539, 7540, 7541, 7542, 7543, 7544, 7545, 7546, 7547, 7548, 7549, 7550, 7551, 7552, 7553, 7554, 7555, 7556, 7557, 7558, 7559, 7560, 7561, 7562, 7563, 7564, 7565, 7566, 7567, 7568, 7569, 7570, 7571, 7572, 7573, 7574, 7575, 7576, 7577, 7578, 7579, 7580, 7581, 7582, 7583, 7584, 7585, 7586, 7587, 7588, 7589, 7590, 7591, 7592, 7593, 7594, 7595, 7596, 7597, 7598, 7599, 7600, 7601, 7602, 7603, 7604, 7605, 7606, 7607, 7608, 7609, 7610, 7611, 7612, 7613, 7614, 7615, 7680, 7681, 7682, 7683, 7684, 7685, 7686, 7687, 7688, 7689, 7690, 7691, 7692, 7693, 7694, 7695, 7696, 7697, 7698, 7699, 7700, 7701, 7702, 7703, 7704, 7705, 7706, 7707, 7708, 7709, 7710, 7711, 7712, 7713, 7714, 7715, 7716, 7717, 7718, 7719, 7720, 7721, 7722, 7723, 7724, 7725, 7726, 7727, 7728, 7729, 7730, 7731, 7732, 7733, 7734, 7735, 7736, 7737, 7738, 7739, 7740, 7741, 7742, 7743, 7744, 7745, 7746, 7747, 7748, 7749, 7750, 7751, 7752, 7753, 7754, 7755, 7756, 7757, 7758, 7759, 7760, 7761, 7762, 7763, 7764, 7765, 7766, 7767, 7768, 7769, 7770, 7771, 7772, 7773, 7774, 7775, 7776, 7777, 7778, 7779, 7780, 7781, 7782, 7783, 7784, 7785, 7786, 7787, 7788, 7789, 7790, 7791, 7792, 7793, 7794, 7795, 7796, 7797, 7798, 7799, 7800, 7801, 7802, 7803, 7804, 7805, 7806, 7807, 7808, 7809, 7810, 7811, 7812, 7813, 7814, 7815, 7816, 7817, 7818, 7819, 7820, 7821, 7822, 7823, 7824, 7825, 7826, 7827, 7828, 7829, 7830, 7831, 7832, 7833, 7834, 7835, 7836, 7837, 7838, 7839, 7840, 7841, 7842, 7843, 7844, 7845, 7846, 7847, 7848, 7849, 7850, 7851, 7852, 7853, 7854, 7855, 7856, 7857, 7858, 7859, 7860, 7861, 7862, 7863, 7864, 7865, 7866, 7867, 7868, 7869, 7870, 7871, 7872, 7873, 7874, 7875, 7876, 7877, 7878, 7879, 7880, 7881, 7882, 7883, 7884, 7885, 7886, 7887, 7888, 7889, 7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 7898, 7899, 7900, 7901, 7902, 7903, 7904, 7905, 7906, 7907, 7908, 7909, 7910, 7911, 7912, 7913, 7914, 7915, 7916, 7917, 7918, 7919, 7920, 7921, 7922, 7923, 7924, 7925, 7926, 7927, 7928, 7929, 7930, 7931, 7932, 7933, 7934, 7935, 7936, 7937, 7938, 7939, 7940, 7941, 7942, 7943, 7944, 7945, 7946, 7947, 7948, 7949, 7950, 7951, 7952, 7953, 7954, 7955, 7956, 7957, 7960, 7961, 7962, 7963, 7964, 7965, 7968, 7969, 7970, 7971, 7972, 7973, 7974, 7975, 7976, 7977, 7978, 7979, 7980, 7981, 7982, 7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991, 7992, 7993, 7994, 7995, 7996, 7997, 7998, 7999, 8000, 8001, 8002, 8003, 8004, 8005, 8008, 8009, 8010, 8011, 8012, 8013, 8016, 8017, 8018, 8019, 8020, 8021, 8022, 8023, 8025, 8027, 8029, 8031, 8032, 8033, 8034, 8035, 8036, 8037, 8038, 8039, 8040, 8041, 8042, 8043, 8044, 8045, 8046, 8047, 8048, 8049, 8050, 8051, 8052, 8053, 8054, 8055, 8056, 8057, 8058, 8059, 8060, 8061, 8064, 8065, 8066, 8067, 8068, 8069, 8070, 8071, 8072, 8073, 8074, 8075, 8076, 8077, 8078, 8079, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104, 8105, 8106, 8107, 8108, 8109, 8110, 8111, 8112, 8113, 8114, 8115, 8116, 8118, 8119, 8120, 8121, 8122, 8123, 8124, 8126, 8130, 8131, 8132, 8134, 8135, 8136, 8137, 8138, 8139, 8140, 8144, 8145, 8146, 8147, 8150, 8151, 8152, 8153, 8154, 8155, 8160, 8161, 8162, 8163, 8164, 8165, 8166, 8167, 8168, 8169, 8170, 8171, 8172, 8178, 8179, 8180, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8305, 8319, 8336, 8337, 8338, 8339, 8340, 8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8450, 8455, 8458, 8459, 8460, 8461, 8462, 8463, 8464, 8465, 8466, 8467, 8469, 8473, 8474, 8475, 8476, 8477, 8484, 8486, 8488, 8490, 8491, 8492, 8493, 8495, 8496, 8497, 8498, 8499, 8500, 8501, 8502, 8503, 8504, 8505, 8508, 8509, 8510, 8511, 8517, 8518, 8519, 8520, 8521, 8526, 8579, 8580, 11264, 11265, 11266, 11267, 11268, 11269, 11270, 11271, 11272, 11273, 11274, 11275, 11276, 11277, 11278, 11279, 11280, 11281, 11282, 11283, 11284, 11285, 11286, 11287, 11288, 11289, 11290, 11291, 11292, 11293, 11294, 11295, 11296, 11297, 11298, 11299, 11300, 11301, 11302, 11303, 11304, 11305, 11306, 11307, 11308, 11309, 11310, 11312, 11313, 11314, 11315, 11316, 11317, 11318, 11319, 11320, 11321, 11322, 11323, 11324, 11325, 11326, 11327, 11328, 11329, 11330, 11331, 11332, 11333, 11334, 11335, 11336, 11337, 11338, 11339, 11340, 11341, 11342, 11343, 11344, 11345, 11346, 11347, 11348, 11349, 11350, 11351, 11352, 11353, 11354, 11355, 11356, 11357, 11358, 11360, 11361, 11362, 11363, 11364, 11365, 11366, 11367, 11368, 11369, 11370, 11371, 11372, 11373, 11374, 11375, 11376, 11377, 11378, 11379, 11380, 11381, 11382, 11383, 11384, 11385, 11386, 11387, 11388, 11389, 11390, 11391, 11392, 11393, 11394, 11395, 11396, 11397, 11398, 11399, 11400, 11401, 11402, 11403, 11404, 11405, 11406, 11407, 11408, 11409, 11410, 11411, 11412, 11413, 11414, 11415, 11416, 11417, 11418, 11419, 11420, 11421, 11422, 11423, 11424, 11425, 11426, 11427, 11428, 11429, 11430, 11431, 11432, 11433, 11434, 11435, 11436, 11437, 11438, 11439, 11440, 11441, 11442, 11443, 11444, 11445, 11446, 11447, 11448, 11449, 11450, 11451, 11452, 11453, 11454, 11455, 11456, 11457, 11458, 11459, 11460, 11461, 11462, 11463, 11464, 11465, 11466, 11467, 11468, 11469, 11470, 11471, 11472, 11473, 11474, 11475, 11476, 11477, 11478, 11479, 11480, 11481, 11482, 11483, 11484, 11485, 11486, 11487, 11488, 11489, 11490, 11491, 11492, 11499, 11500, 11501, 11502, 11506, 11507, 11520, 11521, 11522, 11523, 11524, 11525, 11526, 11527, 11528, 11529, 11530, 11531, 11532, 11533, 11534, 11535, 11536, 11537, 11538, 11539, 11540, 11541, 11542, 11543, 11544, 11545, 11546, 11547, 11548, 11549, 11550, 11551, 11552, 11553, 11554, 11555, 11556, 11557, 11559, 11565, 11568, 11569, 11570, 11571, 11572, 11573, 11574, 11575, 11576, 11577, 11578, 11579, 11580, 11581, 11582, 11583, 11584, 11585, 11586, 11587, 11588, 11589, 11590, 11591, 11592, 11593, 11594, 11595, 11596, 11597, 11598, 11599, 11600, 11601, 11602, 11603, 11604, 11605, 11606, 11607, 11608, 11609, 11610, 11611, 11612, 11613, 11614, 11615, 11616, 11617, 11618, 11619, 11620, 11621, 11622, 11623, 11631, 11648, 11649, 11650, 11651, 11652, 11653, 11654, 11655, 11656, 11657, 11658, 11659, 11660, 11661, 11662, 11663, 11664, 11665, 11666, 11667, 11668, 11669, 11670, 11680, 11681, 11682, 11683, 11684, 11685, 11686, 11688, 11689, 11690, 11691, 11692, 11693, 11694, 11696, 11697, 11698, 11699, 11700, 11701, 11702, 11704, 11705, 11706, 11707, 11708, 11709, 11710, 11712, 11713, 11714, 11715, 11716, 11717, 11718, 11720, 11721, 11722, 11723, 11724, 11725, 11726, 11728, 11729, 11730, 11731, 11732, 11733, 11734, 11736, 11737, 11738, 11739, 11740, 11741, 11742, 11823, 12293, 12294, 12337, 12338, 12339, 12340, 12341, 12347, 12348, 12353, 12354, 12355, 12356, 12357, 12358, 12359, 12360, 12361, 12362, 12363, 12364, 12365, 12366, 12367, 12368, 12369, 12370, 12371, 12372, 12373, 12374, 12375, 12376, 12377, 12378, 12379, 12380, 12381, 12382, 12383, 12384, 12385, 12386, 12387, 12388, 12389, 12390, 12391, 12392, 12393, 12394, 12395, 12396, 12397, 12398, 12399, 12400, 12401, 12402, 12403, 12404, 12405, 12406, 12407, 12408, 12409, 12410, 12411, 12412, 12413, 12414, 12415, 12416, 12417, 12418, 12419, 12420, 12421, 12422, 12423, 12424, 12425, 12426, 12427, 12428, 12429, 12430, 12431, 12432, 12433, 12434, 12435, 12436, 12437, 12438, 12445, 12446, 12447, 12449, 12450, 12451, 12452, 12453, 12454, 12455, 12456, 12457, 12458, 12459, 12460, 12461, 12462, 12463, 12464, 12465, 12466, 12467, 12468, 12469, 12470, 12471, 12472, 12473, 12474, 12475, 12476, 12477, 12478, 12479, 12480, 12481, 12482, 12483, 12484, 12485, 12486, 12487, 12488, 12489, 12490, 12491, 12492, 12493, 12494, 12495, 12496, 12497, 12498, 12499, 12500, 12501, 12502, 12503, 12504, 12505, 12506, 12507, 12508, 12509, 12510, 12511, 12512, 12513, 12514, 12515, 12516, 12517, 12518, 12519, 12520, 12521, 12522, 12523, 12524, 12525, 12526, 12527, 12528, 12529, 12530, 12531, 12532, 12533, 12534, 12535, 12536, 12537, 12538, 12540, 12541, 12542, 12543, 12549, 12550, 12551, 12552, 12553, 12554, 12555, 12556, 12557, 12558, 12559, 12560, 12561, 12562, 12563, 12564, 12565, 12566, 12567, 12568, 12569, 12570, 12571, 12572, 12573, 12574, 12575, 12576, 12577, 12578, 12579, 12580, 12581, 12582, 12583, 12584, 12585, 12586, 12587, 12588, 12589, 12593, 12594, 12595, 12596, 12597, 12598, 12599, 12600, 12601, 12602, 12603, 12604, 12605, 12606, 12607, 12608, 12609, 12610, 12611, 12612, 12613, 12614, 12615, 12616, 12617, 12618, 12619, 12620, 12621, 12622, 12623, 12624, 12625, 12626, 12627, 12628, 12629, 12630, 12631, 12632, 12633, 12634, 12635, 12636, 12637, 12638, 12639, 12640, 12641, 12642, 12643, 12644, 12645, 12646, 12647, 12648, 12649, 12650, 12651, 12652, 12653, 12654, 12655, 12656, 12657, 12658, 12659, 12660, 12661, 12662, 12663, 12664, 12665, 12666, 12667, 12668, 12669, 12670, 12671, 12672, 12673, 12674, 12675, 12676, 12677, 12678, 12679, 12680, 12681, 12682, 12683, 12684, 12685, 12686, 12704, 12705, 12706, 12707, 12708, 12709, 12710, 12711, 12712, 12713, 12714, 12715, 12716, 12717, 12718, 12719, 12720, 12721, 12722, 12723, 12724, 12725, 12726, 12727, 12728, 12729, 12730, 12784, 12785, 12786, 12787, 12788, 12789, 12790, 12791, 12792, 12793, 12794, 12795, 12796, 12797, 12798, 12799, 13312, 19893, 19968, 40917, 40960, 40961, 40962, 40963, 40964, 40965, 40966, 40967, 40968, 40969, 40970, 40971, 40972, 40973, 40974, 40975, 40976, 40977, 40978, 40979, 40980, 40981, 40982, 40983, 40984, 40985, 40986, 40987, 40988, 40989, 40990, 40991, 40992, 40993, 40994, 40995, 40996, 40997, 40998, 40999, 41000, 41001, 41002, 41003, 41004, 41005, 41006, 41007, 41008, 41009, 41010, 41011, 41012, 41013, 41014, 41015, 41016, 41017, 41018, 41019, 41020, 41021, 41022, 41023, 41024, 41025, 41026, 41027, 41028, 41029, 41030, 41031, 41032, 41033, 41034, 41035, 41036, 41037, 41038, 41039, 41040, 41041, 41042, 41043, 41044, 41045, 41046, 41047, 41048, 41049, 41050, 41051, 41052, 41053, 41054, 41055, 41056, 41057, 41058, 41059, 41060, 41061, 41062, 41063, 41064, 41065, 41066, 41067, 41068, 41069, 41070, 41071, 41072, 41073, 41074, 41075, 41076, 41077, 41078, 41079, 41080, 41081, 41082, 41083, 41084, 41085, 41086, 41087, 41088, 41089, 41090, 41091, 41092, 41093, 41094, 41095, 41096, 41097, 41098, 41099, 41100, 41101, 41102, 41103, 41104, 41105, 41106, 41107, 41108, 41109, 41110, 41111, 41112, 41113, 41114, 41115, 41116, 41117, 41118, 41119, 41120, 41121, 41122, 41123, 41124, 41125, 41126, 41127, 41128, 41129, 41130, 41131, 41132, 41133, 41134, 41135, 41136, 41137, 41138, 41139, 41140, 41141, 41142, 41143, 41144, 41145, 41146, 41147, 41148, 41149, 41150, 41151, 41152, 41153, 41154, 41155, 41156, 41157, 41158, 41159, 41160, 41161, 41162, 41163, 41164, 41165, 41166, 41167, 41168, 41169, 41170, 41171, 41172, 41173, 41174, 41175, 41176, 41177, 41178, 41179, 41180, 41181, 41182, 41183, 41184, 41185, 41186, 41187, 41188, 41189, 41190, 41191, 41192, 41193, 41194, 41195, 41196, 41197, 41198, 41199, 41200, 41201, 41202, 41203, 41204, 41205, 41206, 41207, 41208, 41209, 41210, 41211, 41212, 41213, 41214, 41215, 41216, 41217, 41218, 41219, 41220, 41221, 41222, 41223, 41224, 41225, 41226, 41227, 41228, 41229, 41230, 41231, 41232, 41233, 41234, 41235, 41236, 41237, 41238, 41239, 41240, 41241, 41242, 41243, 41244, 41245, 41246, 41247, 41248, 41249, 41250, 41251, 41252, 41253, 41254, 41255, 41256, 41257, 41258, 41259, 41260, 41261, 41262, 41263, 41264, 41265, 41266, 41267, 41268, 41269, 41270, 41271, 41272, 41273, 41274, 41275, 41276, 41277, 41278, 41279, 41280, 41281, 41282, 41283, 41284, 41285, 41286, 41287, 41288, 41289, 41290, 41291, 41292, 41293, 41294, 41295, 41296, 41297, 41298, 41299, 41300, 41301, 41302, 41303, 41304, 41305, 41306, 41307, 41308, 41309, 41310, 41311, 41312, 41313, 41314, 41315, 41316, 41317, 41318, 41319, 41320, 41321, 41322, 41323, 41324, 41325, 41326, 41327, 41328, 41329, 41330, 41331, 41332, 41333, 41334, 41335, 41336, 41337, 41338, 41339, 41340, 41341, 41342, 41343, 41344, 41345, 41346, 41347, 41348, 41349, 41350, 41351, 41352, 41353, 41354, 41355, 41356, 41357, 41358, 41359, 41360, 41361, 41362, 41363, 41364, 41365, 41366, 41367, 41368, 41369, 41370, 41371, 41372, 41373, 41374, 41375, 41376, 41377, 41378, 41379, 41380, 41381, 41382, 41383, 41384, 41385, 41386, 41387, 41388, 41389, 41390, 41391, 41392, 41393, 41394, 41395, 41396, 41397, 41398, 41399, 41400, 41401, 41402, 41403, 41404, 41405, 41406, 41407, 41408, 41409, 41410, 41411, 41412, 41413, 41414, 41415, 41416, 41417, 41418, 41419, 41420, 41421, 41422, 41423, 41424, 41425, 41426, 41427, 41428, 41429, 41430, 41431, 41432, 41433, 41434, 41435, 41436, 41437, 41438, 41439, 41440, 41441, 41442, 41443, 41444, 41445, 41446, 41447, 41448, 41449, 41450, 41451, 41452, 41453, 41454, 41455, 41456, 41457, 41458, 41459, 41460, 41461, 41462, 41463, 41464, 41465, 41466, 41467, 41468, 41469, 41470, 41471, 41472, 41473, 41474, 41475, 41476, 41477, 41478, 41479, 41480, 41481, 41482, 41483, 41484, 41485, 41486, 41487, 41488, 41489, 41490, 41491, 41492, 41493, 41494, 41495, 41496, 41497, 41498, 41499, 41500, 41501, 41502, 41503, 41504, 41505, 41506, 41507, 41508, 41509, 41510, 41511, 41512, 41513, 41514, 41515, 41516, 41517, 41518, 41519, 41520, 41521, 41522, 41523, 41524, 41525, 41526, 41527, 41528, 41529, 41530, 41531, 41532, 41533, 41534, 41535, 41536, 41537, 41538, 41539, 41540, 41541, 41542, 41543, 41544, 41545, 41546, 41547, 41548, 41549, 41550, 41551, 41552, 41553, 41554, 41555, 41556, 41557, 41558, 41559, 41560, 41561, 41562, 41563, 41564, 41565, 41566, 41567, 41568, 41569, 41570, 41571, 41572, 41573, 41574, 41575, 41576, 41577, 41578, 41579, 41580, 41581, 41582, 41583, 41584, 41585, 41586, 41587, 41588, 41589, 41590, 41591, 41592, 41593, 41594, 41595, 41596, 41597, 41598, 41599, 41600, 41601, 41602, 41603, 41604, 41605, 41606, 41607, 41608, 41609, 41610, 41611, 41612, 41613, 41614, 41615, 41616, 41617, 41618, 41619, 41620, 41621, 41622, 41623, 41624, 41625, 41626, 41627, 41628, 41629, 41630, 41631, 41632, 41633, 41634, 41635, 41636, 41637, 41638, 41639, 41640, 41641, 41642, 41643, 41644, 41645, 41646, 41647, 41648, 41649, 41650, 41651, 41652, 41653, 41654, 41655, 41656, 41657, 41658, 41659, 41660, 41661, 41662, 41663, 41664, 41665, 41666, 41667, 41668, 41669, 41670, 41671, 41672, 41673, 41674, 41675, 41676, 41677, 41678, 41679, 41680, 41681, 41682, 41683, 41684, 41685, 41686, 41687, 41688, 41689, 41690, 41691, 41692, 41693, 41694, 41695, 41696, 41697, 41698, 41699, 41700, 41701, 41702, 41703, 41704, 41705, 41706, 41707, 41708, 41709, 41710, 41711, 41712, 41713, 41714, 41715, 41716, 41717, 41718, 41719, 41720, 41721, 41722, 41723, 41724, 41725, 41726, 41727, 41728, 41729, 41730, 41731, 41732, 41733, 41734, 41735, 41736, 41737, 41738, 41739, 41740, 41741, 41742, 41743, 41744, 41745, 41746, 41747, 41748, 41749, 41750, 41751, 41752, 41753, 41754, 41755, 41756, 41757, 41758, 41759, 41760, 41761, 41762, 41763, 41764, 41765, 41766, 41767, 41768, 41769, 41770, 41771, 41772, 41773, 41774, 41775, 41776, 41777, 41778, 41779, 41780, 41781, 41782, 41783, 41784, 41785, 41786, 41787, 41788, 41789, 41790, 41791, 41792, 41793, 41794, 41795, 41796, 41797, 41798, 41799, 41800, 41801, 41802, 41803, 41804, 41805, 41806, 41807, 41808, 41809, 41810, 41811, 41812, 41813, 41814, 41815, 41816, 41817, 41818, 41819, 41820, 41821, 41822, 41823, 41824, 41825, 41826, 41827, 41828, 41829, 41830, 41831, 41832, 41833, 41834, 41835, 41836, 41837, 41838, 41839, 41840, 41841, 41842, 41843, 41844, 41845, 41846, 41847, 41848, 41849, 41850, 41851, 41852, 41853, 41854, 41855, 41856, 41857, 41858, 41859, 41860, 41861, 41862, 41863, 41864, 41865, 41866, 41867, 41868, 41869, 41870, 41871, 41872, 41873, 41874, 41875, 41876, 41877, 41878, 41879, 41880, 41881, 41882, 41883, 41884, 41885, 41886, 41887, 41888, 41889, 41890, 41891, 41892, 41893, 41894, 41895, 41896, 41897, 41898, 41899, 41900, 41901, 41902, 41903, 41904, 41905, 41906, 41907, 41908, 41909, 41910, 41911, 41912, 41913, 41914, 41915, 41916, 41917, 41918, 41919, 41920, 41921, 41922, 41923, 41924, 41925, 41926, 41927, 41928, 41929, 41930, 41931, 41932, 41933, 41934, 41935, 41936, 41937, 41938, 41939, 41940, 41941, 41942, 41943, 41944, 41945, 41946, 41947, 41948, 41949, 41950, 41951, 41952, 41953, 41954, 41955, 41956, 41957, 41958, 41959, 41960, 41961, 41962, 41963, 41964, 41965, 41966, 41967, 41968, 41969, 41970, 41971, 41972, 41973, 41974, 41975, 41976, 41977, 41978, 41979, 41980, 41981, 41982, 41983, 41984, 41985, 41986, 41987, 41988, 41989, 41990, 41991, 41992, 41993, 41994, 41995, 41996, 41997, 41998, 41999, 42000, 42001, 42002, 42003, 42004, 42005, 42006, 42007, 42008, 42009, 42010, 42011, 42012, 42013, 42014, 42015, 42016, 42017, 42018, 42019, 42020, 42021, 42022, 42023, 42024, 42025, 42026, 42027, 42028, 42029, 42030, 42031, 42032, 42033, 42034, 42035, 42036, 42037, 42038, 42039, 42040, 42041, 42042, 42043, 42044, 42045, 42046, 42047, 42048, 42049, 42050, 42051, 42052, 42053, 42054, 42055, 42056, 42057, 42058, 42059, 42060, 42061, 42062, 42063, 42064, 42065, 42066, 42067, 42068, 42069, 42070, 42071, 42072, 42073, 42074, 42075, 42076, 42077, 42078, 42079, 42080, 42081, 42082, 42083, 42084, 42085, 42086, 42087, 42088, 42089, 42090, 42091, 42092, 42093, 42094, 42095, 42096, 42097, 42098, 42099, 42100, 42101, 42102, 42103, 42104, 42105, 42106, 42107, 42108, 42109, 42110, 42111, 42112, 42113, 42114, 42115, 42116, 42117, 42118, 42119, 42120, 42121, 42122, 42123, 42124, 42192, 42193, 42194, 42195, 42196, 42197, 42198, 42199, 42200, 42201, 42202, 42203, 42204, 42205, 42206, 42207, 42208, 42209, 42210, 42211, 42212, 42213, 42214, 42215, 42216, 42217, 42218, 42219, 42220, 42221, 42222, 42223, 42224, 42225, 42226, 42227, 42228, 42229, 42230, 42231, 42232, 42233, 42234, 42235, 42236, 42237, 42240, 42241, 42242, 42243, 42244, 42245, 42246, 42247, 42248, 42249, 42250, 42251, 42252, 42253, 42254, 42255, 42256, 42257, 42258, 42259, 42260, 42261, 42262, 42263, 42264, 42265, 42266, 42267, 42268, 42269, 42270, 42271, 42272, 42273, 42274, 42275, 42276, 42277, 42278, 42279, 42280, 42281, 42282, 42283, 42284, 42285, 42286, 42287, 42288, 42289, 42290, 42291, 42292, 42293, 42294, 42295, 42296, 42297, 42298, 42299, 42300, 42301, 42302, 42303, 42304, 42305, 42306, 42307, 42308, 42309, 42310, 42311, 42312, 42313, 42314, 42315, 42316, 42317, 42318, 42319, 42320, 42321, 42322, 42323, 42324, 42325, 42326, 42327, 42328, 42329, 42330, 42331, 42332, 42333, 42334, 42335, 42336, 42337, 42338, 42339, 42340, 42341, 42342, 42343, 42344, 42345, 42346, 42347, 42348, 42349, 42350, 42351, 42352, 42353, 42354, 42355, 42356, 42357, 42358, 42359, 42360, 42361, 42362, 42363, 42364, 42365, 42366, 42367, 42368, 42369, 42370, 42371, 42372, 42373, 42374, 42375, 42376, 42377, 42378, 42379, 42380, 42381, 42382, 42383, 42384, 42385, 42386, 42387, 42388, 42389, 42390, 42391, 42392, 42393, 42394, 42395, 42396, 42397, 42398, 42399, 42400, 42401, 42402, 42403, 42404, 42405, 42406, 42407, 42408, 42409, 42410, 42411, 42412, 42413, 42414, 42415, 42416, 42417, 42418, 42419, 42420, 42421, 42422, 42423, 42424, 42425, 42426, 42427, 42428, 42429, 42430, 42431, 42432, 42433, 42434, 42435, 42436, 42437, 42438, 42439, 42440, 42441, 42442, 42443, 42444, 42445, 42446, 42447, 42448, 42449, 42450, 42451, 42452, 42453, 42454, 42455, 42456, 42457, 42458, 42459, 42460, 42461, 42462, 42463, 42464, 42465, 42466, 42467, 42468, 42469, 42470, 42471, 42472, 42473, 42474, 42475, 42476, 42477, 42478, 42479, 42480, 42481, 42482, 42483, 42484, 42485, 42486, 42487, 42488, 42489, 42490, 42491, 42492, 42493, 42494, 42495, 42496, 42497, 42498, 42499, 42500, 42501, 42502, 42503, 42504, 42505, 42506, 42507, 42508, 42512, 42513, 42514, 42515, 42516, 42517, 42518, 42519, 42520, 42521, 42522, 42523, 42524, 42525, 42526, 42527, 42538, 42539, 42560, 42561, 42562, 42563, 42564, 42565, 42566, 42567, 42568, 42569, 42570, 42571, 42572, 42573, 42574, 42575, 42576, 42577, 42578, 42579, 42580, 42581, 42582, 42583, 42584, 42585, 42586, 42587, 42588, 42589, 42590, 42591, 42592, 42593, 42594, 42595, 42596, 42597, 42598, 42599, 42600, 42601, 42602, 42603, 42604, 42605, 42606, 42623, 42624, 42625, 42626, 42627, 42628, 42629, 42630, 42631, 42632, 42633, 42634, 42635, 42636, 42637, 42638, 42639, 42640, 42641, 42642, 42643, 42644, 42645, 42646, 42647, 42648, 42649, 42650, 42651, 42652, 42653, 42656, 42657, 42658, 42659, 42660, 42661, 42662, 42663, 42664, 42665, 42666, 42667, 42668, 42669, 42670, 42671, 42672, 42673, 42674, 42675, 42676, 42677, 42678, 42679, 42680, 42681, 42682, 42683, 42684, 42685, 42686, 42687, 42688, 42689, 42690, 42691, 42692, 42693, 42694, 42695, 42696, 42697, 42698, 42699, 42700, 42701, 42702, 42703, 42704, 42705, 42706, 42707, 42708, 42709, 42710, 42711, 42712, 42713, 42714, 42715, 42716, 42717, 42718, 42719, 42720, 42721, 42722, 42723, 42724, 42725, 42775, 42776, 42777, 42778, 42779, 42780, 42781, 42782, 42783, 42786, 42787, 42788, 42789, 42790, 42791, 42792, 42793, 42794, 42795, 42796, 42797, 42798, 42799, 42800, 42801, 42802, 42803, 42804, 42805, 42806, 42807, 42808, 42809, 42810, 42811, 42812, 42813, 42814, 42815, 42816, 42817, 42818, 42819, 42820, 42821, 42822, 42823, 42824, 42825, 42826, 42827, 42828, 42829, 42830, 42831, 42832, 42833, 42834, 42835, 42836, 42837, 42838, 42839, 42840, 42841, 42842, 42843, 42844, 42845, 42846, 42847, 42848, 42849, 42850, 42851, 42852, 42853, 42854, 42855, 42856, 42857, 42858, 42859, 42860, 42861, 42862, 42863, 42864, 42865, 42866, 42867, 42868, 42869, 42870, 42871, 42872, 42873, 42874, 42875, 42876, 42877, 42878, 42879, 42880, 42881, 42882, 42883, 42884, 42885, 42886, 42887, 42888, 42891, 42892, 42893, 42894, 42895, 42896, 42897, 42898, 42899, 42900, 42901, 42902, 42903, 42904, 42905, 42906, 42907, 42908, 42909, 42910, 42911, 42912, 42913, 42914, 42915, 42916, 42917, 42918, 42919, 42920, 42921, 42922, 42923, 42924, 42925, 42928, 42929, 42930, 42931, 42932, 42933, 42934, 42935, 42999, 43000, 43001, 43002, 43003, 43004, 43005, 43006, 43007, 43008, 43009, 43011, 43012, 43013, 43015, 43016, 43017, 43018, 43020, 43021, 43022, 43023, 43024, 43025, 43026, 43027, 43028, 43029, 43030, 43031, 43032, 43033, 43034, 43035, 43036, 43037, 43038, 43039, 43040, 43041, 43042, 43072, 43073, 43074, 43075, 43076, 43077, 43078, 43079, 43080, 43081, 43082, 43083, 43084, 43085, 43086, 43087, 43088, 43089, 43090, 43091, 43092, 43093, 43094, 43095, 43096, 43097, 43098, 43099, 43100, 43101, 43102, 43103, 43104, 43105, 43106, 43107, 43108, 43109, 43110, 43111, 43112, 43113, 43114, 43115, 43116, 43117, 43118, 43119, 43120, 43121, 43122, 43123, 43138, 43139, 43140, 43141, 43142, 43143, 43144, 43145, 43146, 43147, 43148, 43149, 43150, 43151, 43152, 43153, 43154, 43155, 43156, 43157, 43158, 43159, 43160, 43161, 43162, 43163, 43164, 43165, 43166, 43167, 43168, 43169, 43170, 43171, 43172, 43173, 43174, 43175, 43176, 43177, 43178, 43179, 43180, 43181, 43182, 43183, 43184, 43185, 43186, 43187, 43250, 43251, 43252, 43253, 43254, 43255, 43259, 43261, 43274, 43275, 43276, 43277, 43278, 43279, 43280, 43281, 43282, 43283, 43284, 43285, 43286, 43287, 43288, 43289, 43290, 43291, 43292, 43293, 43294, 43295, 43296, 43297, 43298, 43299, 43300, 43301, 43312, 43313, 43314, 43315, 43316, 43317, 43318, 43319, 43320, 43321, 43322, 43323, 43324, 43325, 43326, 43327, 43328, 43329, 43330, 43331, 43332, 43333, 43334, 43360, 43361, 43362, 43363, 43364, 43365, 43366, 43367, 43368, 43369, 43370, 43371, 43372, 43373, 43374, 43375, 43376, 43377, 43378, 43379, 43380, 43381, 43382, 43383, 43384, 43385, 43386, 43387, 43388, 43396, 43397, 43398, 43399, 43400, 43401, 43402, 43403, 43404, 43405, 43406, 43407, 43408, 43409, 43410, 43411, 43412, 43413, 43414, 43415, 43416, 43417, 43418, 43419, 43420, 43421, 43422, 43423, 43424, 43425, 43426, 43427, 43428, 43429, 43430, 43431, 43432, 43433, 43434, 43435, 43436, 43437, 43438, 43439, 43440, 43441, 43442, 43471, 43488, 43489, 43490, 43491, 43492, 43494, 43495, 43496, 43497, 43498, 43499, 43500, 43501, 43502, 43503, 43514, 43515, 43516, 43517, 43518, 43520, 43521, 43522, 43523, 43524, 43525, 43526, 43527, 43528, 43529, 43530, 43531, 43532, 43533, 43534, 43535, 43536, 43537, 43538, 43539, 43540, 43541, 43542, 43543, 43544, 43545, 43546, 43547, 43548, 43549, 43550, 43551, 43552, 43553, 43554, 43555, 43556, 43557, 43558, 43559, 43560, 43584, 43585, 43586, 43588, 43589, 43590, 43591, 43592, 43593, 43594, 43595, 43616, 43617, 43618, 43619, 43620, 43621, 43622, 43623, 43624, 43625, 43626, 43627, 43628, 43629, 43630, 43631, 43632, 43633, 43634, 43635, 43636, 43637, 43638, 43642, 43646, 43647, 43648, 43649, 43650, 43651, 43652, 43653, 43654, 43655, 43656, 43657, 43658, 43659, 43660, 43661, 43662, 43663, 43664, 43665, 43666, 43667, 43668, 43669, 43670, 43671, 43672, 43673, 43674, 43675, 43676, 43677, 43678, 43679, 43680, 43681, 43682, 43683, 43684, 43685, 43686, 43687, 43688, 43689, 43690, 43691, 43692, 43693, 43694, 43695, 43697, 43701, 43702, 43705, 43706, 43707, 43708, 43709, 43712, 43714, 43739, 43740, 43741, 43744, 43745, 43746, 43747, 43748, 43749, 43750, 43751, 43752, 43753, 43754, 43762, 43763, 43764, 43777, 43778, 43779, 43780, 43781, 43782, 43785, 43786, 43787, 43788, 43789, 43790, 43793, 43794, 43795, 43796, 43797, 43798, 43808, 43809, 43810, 43811, 43812, 43813, 43814, 43816, 43817, 43818, 43819, 43820, 43821, 43822, 43824, 43825, 43826, 43827, 43828, 43829, 43830, 43831, 43832, 43833, 43834, 43835, 43836, 43837, 43838, 43839, 43840, 43841, 43842, 43843, 43844, 43845, 43846, 43847, 43848, 43849, 43850, 43851, 43852, 43853, 43854, 43855, 43856, 43857, 43858, 43859, 43860, 43861, 43862, 43863, 43864, 43865, 43866, 43868, 43869, 43870, 43871, 43872, 43873, 43874, 43875, 43876, 43877, 43888, 43889, 43890, 43891, 43892, 43893, 43894, 43895, 43896, 43897, 43898, 43899, 43900, 43901, 43902, 43903, 43904, 43905, 43906, 43907, 43908, 43909, 43910, 43911, 43912, 43913, 43914, 43915, 43916, 43917, 43918, 43919, 43920, 43921, 43922, 43923, 43924, 43925, 43926, 43927, 43928, 43929, 43930, 43931, 43932, 43933, 43934, 43935, 43936, 43937, 43938, 43939, 43940, 43941, 43942, 43943, 43944, 43945, 43946, 43947, 43948, 43949, 43950, 43951, 43952, 43953, 43954, 43955, 43956, 43957, 43958, 43959, 43960, 43961, 43962, 43963, 43964, 43965, 43966, 43967, 43968, 43969, 43970, 43971, 43972, 43973, 43974, 43975, 43976, 43977, 43978, 43979, 43980, 43981, 43982, 43983, 43984, 43985, 43986, 43987, 43988, 43989, 43990, 43991, 43992, 43993, 43994, 43995, 43996, 43997, 43998, 43999, 44000, 44001, 44002, 44032, 55203, 55216, 55217, 55218, 55219, 55220, 55221, 55222, 55223, 55224, 55225, 55226, 55227, 55228, 55229, 55230, 55231, 55232, 55233, 55234, 55235, 55236, 55237, 55238, 55243, 55244, 55245, 55246, 55247, 55248, 55249, 55250, 55251, 55252, 55253, 55254, 55255, 55256, 55257, 55258, 55259, 55260, 55261, 55262, 55263, 55264, 55265, 55266, 55267, 55268, 55269, 55270, 55271, 55272, 55273, 55274, 55275, 55276, 55277, 55278, 55279, 55280, 55281, 55282, 55283, 55284, 55285, 55286, 55287, 55288, 55289, 55290, 55291, 63744, 63745, 63746, 63747, 63748, 63749, 63750, 63751, 63752, 63753, 63754, 63755, 63756, 63757, 63758, 63759, 63760, 63761, 63762, 63763, 63764, 63765, 63766, 63767, 63768, 63769, 63770, 63771, 63772, 63773, 63774, 63775, 63776, 63777, 63778, 63779, 63780, 63781, 63782, 63783, 63784, 63785, 63786, 63787, 63788, 63789, 63790, 63791, 63792, 63793, 63794, 63795, 63796, 63797, 63798, 63799, 63800, 63801, 63802, 63803, 63804, 63805, 63806, 63807, 63808, 63809, 63810, 63811, 63812, 63813, 63814, 63815, 63816, 63817, 63818, 63819, 63820, 63821, 63822, 63823, 63824, 63825, 63826, 63827, 63828, 63829, 63830, 63831, 63832, 63833, 63834, 63835, 63836, 63837, 63838, 63839, 63840, 63841, 63842, 63843, 63844, 63845, 63846, 63847, 63848, 63849, 63850, 63851, 63852, 63853, 63854, 63855, 63856, 63857, 63858, 63859, 63860, 63861, 63862, 63863, 63864, 63865, 63866, 63867, 63868, 63869, 63870, 63871, 63872, 63873, 63874, 63875, 63876, 63877, 63878, 63879, 63880, 63881, 63882, 63883, 63884, 63885, 63886, 63887, 63888, 63889, 63890, 63891, 63892, 63893, 63894, 63895, 63896, 63897, 63898, 63899, 63900, 63901, 63902, 63903, 63904, 63905, 63906, 63907, 63908, 63909, 63910, 63911, 63912, 63913, 63914, 63915, 63916, 63917, 63918, 63919, 63920, 63921, 63922, 63923, 63924, 63925, 63926, 63927, 63928, 63929, 63930, 63931, 63932, 63933, 63934, 63935, 63936, 63937, 63938, 63939, 63940, 63941, 63942, 63943, 63944, 63945, 63946, 63947, 63948, 63949, 63950, 63951, 63952, 63953, 63954, 63955, 63956, 63957, 63958, 63959, 63960, 63961, 63962, 63963, 63964, 63965, 63966, 63967, 63968, 63969, 63970, 63971, 63972, 63973, 63974, 63975, 63976, 63977, 63978, 63979, 63980, 63981, 63982, 63983, 63984, 63985, 63986, 63987, 63988, 63989, 63990, 63991, 63992, 63993, 63994, 63995, 63996, 63997, 63998, 63999, 64000, 64001, 64002, 64003, 64004, 64005, 64006, 64007, 64008, 64009, 64010, 64011, 64012, 64013, 64014, 64015, 64016, 64017, 64018, 64019, 64020, 64021, 64022, 64023, 64024, 64025, 64026, 64027, 64028, 64029, 64030, 64031, 64032, 64033, 64034, 64035, 64036, 64037, 64038, 64039, 64040, 64041, 64042, 64043, 64044, 64045, 64046, 64047, 64048, 64049, 64050, 64051, 64052, 64053, 64054, 64055, 64056, 64057, 64058, 64059, 64060, 64061, 64062, 64063, 64064, 64065, 64066, 64067, 64068, 64069, 64070, 64071, 64072, 64073, 64074, 64075, 64076, 64077, 64078, 64079, 64080, 64081, 64082, 64083, 64084, 64085, 64086, 64087, 64088, 64089, 64090, 64091, 64092, 64093, 64094, 64095, 64096, 64097, 64098, 64099, 64100, 64101, 64102, 64103, 64104, 64105, 64106, 64107, 64108, 64109, 64112, 64113, 64114, 64115, 64116, 64117, 64118, 64119, 64120, 64121, 64122, 64123, 64124, 64125, 64126, 64127, 64128, 64129, 64130, 64131, 64132, 64133, 64134, 64135, 64136, 64137, 64138, 64139, 64140, 64141, 64142, 64143, 64144, 64145, 64146, 64147, 64148, 64149, 64150, 64151, 64152, 64153, 64154, 64155, 64156, 64157, 64158, 64159, 64160, 64161, 64162, 64163, 64164, 64165, 64166, 64167, 64168, 64169, 64170, 64171, 64172, 64173, 64174, 64175, 64176, 64177, 64178, 64179, 64180, 64181, 64182, 64183, 64184, 64185, 64186, 64187, 64188, 64189, 64190, 64191, 64192, 64193, 64194, 64195, 64196, 64197, 64198, 64199, 64200, 64201, 64202, 64203, 64204, 64205, 64206, 64207, 64208, 64209, 64210, 64211, 64212, 64213, 64214, 64215, 64216, 64217, 64256, 64257, 64258, 64259, 64260, 64261, 64262, 64275, 64276, 64277, 64278, 64279, 64285, 64287, 64288, 64289, 64290, 64291, 64292, 64293, 64294, 64295, 64296, 64298, 64299, 64300, 64301, 64302, 64303, 64304, 64305, 64306, 64307, 64308, 64309, 64310, 64312, 64313, 64314, 64315, 64316, 64318, 64320, 64321, 64323, 64324, 64326, 64327, 64328, 64329, 64330, 64331, 64332, 64333, 64334, 64335, 64336, 64337, 64338, 64339, 64340, 64341, 64342, 64343, 64344, 64345, 64346, 64347, 64348, 64349, 64350, 64351, 64352, 64353, 64354, 64355, 64356, 64357, 64358, 64359, 64360, 64361, 64362, 64363, 64364, 64365, 64366, 64367, 64368, 64369, 64370, 64371, 64372, 64373, 64374, 64375, 64376, 64377, 64378, 64379, 64380, 64381, 64382, 64383, 64384, 64385, 64386, 64387, 64388, 64389, 64390, 64391, 64392, 64393, 64394, 64395, 64396, 64397, 64398, 64399, 64400, 64401, 64402, 64403, 64404, 64405, 64406, 64407, 64408, 64409, 64410, 64411, 64412, 64413, 64414, 64415, 64416, 64417, 64418, 64419, 64420, 64421, 64422, 64423, 64424, 64425, 64426, 64427, 64428, 64429, 64430, 64431, 64432, 64433, 64467, 64468, 64469, 64470, 64471, 64472, 64473, 64474, 64475, 64476, 64477, 64478, 64479, 64480, 64481, 64482, 64483, 64484, 64485, 64486, 64487, 64488, 64489, 64490, 64491, 64492, 64493, 64494, 64495, 64496, 64497, 64498, 64499, 64500, 64501, 64502, 64503, 64504, 64505, 64506, 64507, 64508, 64509, 64510, 64511, 64512, 64513, 64514, 64515, 64516, 64517, 64518, 64519, 64520, 64521, 64522, 64523, 64524, 64525, 64526, 64527, 64528, 64529, 64530, 64531, 64532, 64533, 64534, 64535, 64536, 64537, 64538, 64539, 64540, 64541, 64542, 64543, 64544, 64545, 64546, 64547, 64548, 64549, 64550, 64551, 64552, 64553, 64554, 64555, 64556, 64557, 64558, 64559, 64560, 64561, 64562, 64563, 64564, 64565, 64566, 64567, 64568, 64569, 64570, 64571, 64572, 64573, 64574, 64575, 64576, 64577, 64578, 64579, 64580, 64581, 64582, 64583, 64584, 64585, 64586, 64587, 64588, 64589, 64590, 64591, 64592, 64593, 64594, 64595, 64596, 64597, 64598, 64599, 64600, 64601, 64602, 64603, 64604, 64605, 64606, 64607, 64608, 64609, 64610, 64611, 64612, 64613, 64614, 64615, 64616, 64617, 64618, 64619, 64620, 64621, 64622, 64623, 64624, 64625, 64626, 64627, 64628, 64629, 64630, 64631, 64632, 64633, 64634, 64635, 64636, 64637, 64638, 64639, 64640, 64641, 64642, 64643, 64644, 64645, 64646, 64647, 64648, 64649, 64650, 64651, 64652, 64653, 64654, 64655, 64656, 64657, 64658, 64659, 64660, 64661, 64662, 64663, 64664, 64665, 64666, 64667, 64668, 64669, 64670, 64671, 64672, 64673, 64674, 64675, 64676, 64677, 64678, 64679, 64680, 64681, 64682, 64683, 64684, 64685, 64686, 64687, 64688, 64689, 64690, 64691, 64692, 64693, 64694, 64695, 64696, 64697, 64698, 64699, 64700, 64701, 64702, 64703, 64704, 64705, 64706, 64707, 64708, 64709, 64710, 64711, 64712, 64713, 64714, 64715, 64716, 64717, 64718, 64719, 64720, 64721, 64722, 64723, 64724, 64725, 64726, 64727, 64728, 64729, 64730, 64731, 64732, 64733, 64734, 64735, 64736, 64737, 64738, 64739, 64740, 64741, 64742, 64743, 64744, 64745, 64746, 64747, 64748, 64749, 64750, 64751, 64752, 64753, 64754, 64755, 64756, 64757, 64758, 64759, 64760, 64761, 64762, 64763, 64764, 64765, 64766, 64767, 64768, 64769, 64770, 64771, 64772, 64773, 64774, 64775, 64776, 64777, 64778, 64779, 64780, 64781, 64782, 64783, 64784, 64785, 64786, 64787, 64788, 64789, 64790, 64791, 64792, 64793, 64794, 64795, 64796, 64797, 64798, 64799, 64800, 64801, 64802, 64803, 64804, 64805, 64806, 64807, 64808, 64809, 64810, 64811, 64812, 64813, 64814, 64815, 64816, 64817, 64818, 64819, 64820, 64821, 64822, 64823, 64824, 64825, 64826, 64827, 64828, 64829, 64848, 64849, 64850, 64851, 64852, 64853, 64854, 64855, 64856, 64857, 64858, 64859, 64860, 64861, 64862, 64863, 64864, 64865, 64866, 64867, 64868, 64869, 64870, 64871, 64872, 64873, 64874, 64875, 64876, 64877, 64878, 64879, 64880, 64881, 64882, 64883, 64884, 64885, 64886, 64887, 64888, 64889, 64890, 64891, 64892, 64893, 64894, 64895, 64896, 64897, 64898, 64899, 64900, 64901, 64902, 64903, 64904, 64905, 64906, 64907, 64908, 64909, 64910, 64911, 64914, 64915, 64916, 64917, 64918, 64919, 64920, 64921, 64922, 64923, 64924, 64925, 64926, 64927, 64928, 64929, 64930, 64931, 64932, 64933, 64934, 64935, 64936, 64937, 64938, 64939, 64940, 64941, 64942, 64943, 64944, 64945, 64946, 64947, 64948, 64949, 64950, 64951, 64952, 64953, 64954, 64955, 64956, 64957, 64958, 64959, 64960, 64961, 64962, 64963, 64964, 64965, 64966, 64967, 65008, 65009, 65010, 65011, 65012, 65013, 65014, 65015, 65016, 65017, 65018, 65019, 65136, 65137, 65138, 65139, 65140, 65142, 65143, 65144, 65145, 65146, 65147, 65148, 65149, 65150, 65151, 65152, 65153, 65154, 65155, 65156, 65157, 65158, 65159, 65160, 65161, 65162, 65163, 65164, 65165, 65166, 65167, 65168, 65169, 65170, 65171, 65172, 65173, 65174, 65175, 65176, 65177, 65178, 65179, 65180, 65181, 65182, 65183, 65184, 65185, 65186, 65187, 65188, 65189, 65190, 65191, 65192, 65193, 65194, 65195, 65196, 65197, 65198, 65199, 65200, 65201, 65202, 65203, 65204, 65205, 65206, 65207, 65208, 65209, 65210, 65211, 65212, 65213, 65214, 65215, 65216, 65217, 65218, 65219, 65220, 65221, 65222, 65223, 65224, 65225, 65226, 65227, 65228, 65229, 65230, 65231, 65232, 65233, 65234, 65235, 65236, 65237, 65238, 65239, 65240, 65241, 65242, 65243, 65244, 65245, 65246, 65247, 65248, 65249, 65250, 65251, 65252, 65253, 65254, 65255, 65256, 65257, 65258, 65259, 65260, 65261, 65262, 65263, 65264, 65265, 65266, 65267, 65268, 65269, 65270, 65271, 65272, 65273, 65274, 65275, 65276, 65313, 65314, 65315, 65316, 65317, 65318, 65319, 65320, 65321, 65322, 65323, 65324, 65325, 65326, 65327, 65328, 65329, 65330, 65331, 65332, 65333, 65334, 65335, 65336, 65337, 65338, 65345, 65346, 65347, 65348, 65349, 65350, 65351, 65352, 65353, 65354, 65355, 65356, 65357, 65358, 65359, 65360, 65361, 65362, 65363, 65364, 65365, 65366, 65367, 65368, 65369, 65370, 65382, 65383, 65384, 65385, 65386, 65387, 65388, 65389, 65390, 65391, 65392, 65393, 65394, 65395, 65396, 65397, 65398, 65399, 65400, 65401, 65402, 65403, 65404, 65405, 65406, 65407, 65408, 65409, 65410, 65411, 65412, 65413, 65414, 65415, 65416, 65417, 65418, 65419, 65420, 65421, 65422, 65423, 65424, 65425, 65426, 65427, 65428, 65429, 65430, 65431, 65432, 65433, 65434, 65435, 65436, 65437, 65438, 65439, 65440, 65441, 65442, 65443, 65444, 65445, 65446, 65447, 65448, 65449, 65450, 65451, 65452, 65453, 65454, 65455, 65456, 65457, 65458, 65459, 65460, 65461, 65462, 65463, 65464, 65465, 65466, 65467, 65468, 65469, 65470, 65474, 65475, 65476, 65477, 65478, 65479, 65482, 65483, 65484, 65485, 65486, 65487, 65490, 65491, 65492, 65493, 65494, 65495, 65498, 65499, 65500, 65536, 65537, 65538, 65539, 65540, 65541, 65542, 65543, 65544, 65545, 65546, 65547, 65549, 65550, 65551, 65552, 65553, 65554, 65555, 65556, 65557, 65558, 65559, 65560, 65561, 65562, 65563, 65564, 65565, 65566, 65567, 65568, 65569, 65570, 65571, 65572, 65573, 65574, 65576, 65577, 65578, 65579, 65580, 65581, 65582, 65583, 65584, 65585, 65586, 65587, 65588, 65589, 65590, 65591, 65592, 65593, 65594, 65596, 65597, 65599, 65600, 65601, 65602, 65603, 65604, 65605, 65606, 65607, 65608, 65609, 65610, 65611, 65612, 65613, 65616, 65617, 65618, 65619, 65620, 65621, 65622, 65623, 65624, 65625, 65626, 65627, 65628, 65629, 65664, 65665, 65666, 65667, 65668, 65669, 65670, 65671, 65672, 65673, 65674, 65675, 65676, 65677, 65678, 65679, 65680, 65681, 65682, 65683, 65684, 65685, 65686, 65687, 65688, 65689, 65690, 65691, 65692, 65693, 65694, 65695, 65696, 65697, 65698, 65699, 65700, 65701, 65702, 65703, 65704, 65705, 65706, 65707, 65708, 65709, 65710, 65711, 65712, 65713, 65714, 65715, 65716, 65717, 65718, 65719, 65720, 65721, 65722, 65723, 65724, 65725, 65726, 65727, 65728, 65729, 65730, 65731, 65732, 65733, 65734, 65735, 65736, 65737, 65738, 65739, 65740, 65741, 65742, 65743, 65744, 65745, 65746, 65747, 65748, 65749, 65750, 65751, 65752, 65753, 65754, 65755, 65756, 65757, 65758, 65759, 65760, 65761, 65762, 65763, 65764, 65765, 65766, 65767, 65768, 65769, 65770, 65771, 65772, 65773, 65774, 65775, 65776, 65777, 65778, 65779, 65780, 65781, 65782, 65783, 65784, 65785, 65786, 66176, 66177, 66178, 66179, 66180, 66181, 66182, 66183, 66184, 66185, 66186, 66187, 66188, 66189, 66190, 66191, 66192, 66193, 66194, 66195, 66196, 66197, 66198, 66199, 66200, 66201, 66202, 66203, 66204, 66208, 66209, 66210, 66211, 66212, 66213, 66214, 66215, 66216, 66217, 66218, 66219, 66220, 66221, 66222, 66223, 66224, 66225, 66226, 66227, 66228, 66229, 66230, 66231, 66232, 66233, 66234, 66235, 66236, 66237, 66238, 66239, 66240, 66241, 66242, 66243, 66244, 66245, 66246, 66247, 66248, 66249, 66250, 66251, 66252, 66253, 66254, 66255, 66256, 66304, 66305, 66306, 66307, 66308, 66309, 66310, 66311, 66312, 66313, 66314, 66315, 66316, 66317, 66318, 66319, 66320, 66321, 66322, 66323, 66324, 66325, 66326, 66327, 66328, 66329, 66330, 66331, 66332, 66333, 66334, 66335, 66352, 66353, 66354, 66355, 66356, 66357, 66358, 66359, 66360, 66361, 66362, 66363, 66364, 66365, 66366, 66367, 66368, 66370, 66371, 66372, 66373, 66374, 66375, 66376, 66377, 66384, 66385, 66386, 66387, 66388, 66389, 66390, 66391, 66392, 66393, 66394, 66395, 66396, 66397, 66398, 66399, 66400, 66401, 66402, 66403, 66404, 66405, 66406, 66407, 66408, 66409, 66410, 66411, 66412, 66413, 66414, 66415, 66416, 66417, 66418, 66419, 66420, 66421, 66432, 66433, 66434, 66435, 66436, 66437, 66438, 66439, 66440, 66441, 66442, 66443, 66444, 66445, 66446, 66447, 66448, 66449, 66450, 66451, 66452, 66453, 66454, 66455, 66456, 66457, 66458, 66459, 66460, 66461, 66464, 66465, 66466, 66467, 66468, 66469, 66470, 66471, 66472, 66473, 66474, 66475, 66476, 66477, 66478, 66479, 66480, 66481, 66482, 66483, 66484, 66485, 66486, 66487, 66488, 66489, 66490, 66491, 66492, 66493, 66494, 66495, 66496, 66497, 66498, 66499, 66504, 66505, 66506, 66507, 66508, 66509, 66510, 66511, 66560, 66561, 66562, 66563, 66564, 66565, 66566, 66567, 66568, 66569, 66570, 66571, 66572, 66573, 66574, 66575, 66576, 66577, 66578, 66579, 66580, 66581, 66582, 66583, 66584, 66585, 66586, 66587, 66588, 66589, 66590, 66591, 66592, 66593, 66594, 66595, 66596, 66597, 66598, 66599, 66600, 66601, 66602, 66603, 66604, 66605, 66606, 66607, 66608, 66609, 66610, 66611, 66612, 66613, 66614, 66615, 66616, 66617, 66618, 66619, 66620, 66621, 66622, 66623, 66624, 66625, 66626, 66627, 66628, 66629, 66630, 66631, 66632, 66633, 66634, 66635, 66636, 66637, 66638, 66639, 66640, 66641, 66642, 66643, 66644, 66645, 66646, 66647, 66648, 66649, 66650, 66651, 66652, 66653, 66654, 66655, 66656, 66657, 66658, 66659, 66660, 66661, 66662, 66663, 66664, 66665, 66666, 66667, 66668, 66669, 66670, 66671, 66672, 66673, 66674, 66675, 66676, 66677, 66678, 66679, 66680, 66681, 66682, 66683, 66684, 66685, 66686, 66687, 66688, 66689, 66690, 66691, 66692, 66693, 66694, 66695, 66696, 66697, 66698, 66699, 66700, 66701, 66702, 66703, 66704, 66705, 66706, 66707, 66708, 66709, 66710, 66711, 66712, 66713, 66714, 66715, 66716, 66717, 66816, 66817, 66818, 66819, 66820, 66821, 66822, 66823, 66824, 66825, 66826, 66827, 66828, 66829, 66830, 66831, 66832, 66833, 66834, 66835, 66836, 66837, 66838, 66839, 66840, 66841, 66842, 66843, 66844, 66845, 66846, 66847, 66848, 66849, 66850, 66851, 66852, 66853, 66854, 66855, 66864, 66865, 66866, 66867, 66868, 66869, 66870, 66871, 66872, 66873, 66874, 66875, 66876, 66877, 66878, 66879, 66880, 66881, 66882, 66883, 66884, 66885, 66886, 66887, 66888, 66889, 66890, 66891, 66892, 66893, 66894, 66895, 66896, 66897, 66898, 66899, 66900, 66901, 66902, 66903, 66904, 66905, 66906, 66907, 66908, 66909, 66910, 66911, 66912, 66913, 66914, 66915, 67072, 67073, 67074, 67075, 67076, 67077, 67078, 67079, 67080, 67081, 67082, 67083, 67084, 67085, 67086, 67087, 67088, 67089, 67090, 67091, 67092, 67093, 67094, 67095, 67096, 67097, 67098, 67099, 67100, 67101, 67102, 67103, 67104, 67105, 67106, 67107, 67108, 67109, 67110, 67111, 67112, 67113, 67114, 67115, 67116, 67117, 67118, 67119, 67120, 67121, 67122, 67123, 67124, 67125, 67126, 67127, 67128, 67129, 67130, 67131, 67132, 67133, 67134, 67135, 67136, 67137, 67138, 67139, 67140, 67141, 67142, 67143, 67144, 67145, 67146, 67147, 67148, 67149, 67150, 67151, 67152, 67153, 67154, 67155, 67156, 67157, 67158, 67159, 67160, 67161, 67162, 67163, 67164, 67165, 67166, 67167, 67168, 67169, 67170, 67171, 67172, 67173, 67174, 67175, 67176, 67177, 67178, 67179, 67180, 67181, 67182, 67183, 67184, 67185, 67186, 67187, 67188, 67189, 67190, 67191, 67192, 67193, 67194, 67195, 67196, 67197, 67198, 67199, 67200, 67201, 67202, 67203, 67204, 67205, 67206, 67207, 67208, 67209, 67210, 67211, 67212, 67213, 67214, 67215, 67216, 67217, 67218, 67219, 67220, 67221, 67222, 67223, 67224, 67225, 67226, 67227, 67228, 67229, 67230, 67231, 67232, 67233, 67234, 67235, 67236, 67237, 67238, 67239, 67240, 67241, 67242, 67243, 67244, 67245, 67246, 67247, 67248, 67249, 67250, 67251, 67252, 67253, 67254, 67255, 67256, 67257, 67258, 67259, 67260, 67261, 67262, 67263, 67264, 67265, 67266, 67267, 67268, 67269, 67270, 67271, 67272, 67273, 67274, 67275, 67276, 67277, 67278, 67279, 67280, 67281, 67282, 67283, 67284, 67285, 67286, 67287, 67288, 67289, 67290, 67291, 67292, 67293, 67294, 67295, 67296, 67297, 67298, 67299, 67300, 67301, 67302, 67303, 67304, 67305, 67306, 67307, 67308, 67309, 67310, 67311, 67312, 67313, 67314, 67315, 67316, 67317, 67318, 67319, 67320, 67321, 67322, 67323, 67324, 67325, 67326, 67327, 67328, 67329, 67330, 67331, 67332, 67333, 67334, 67335, 67336, 67337, 67338, 67339, 67340, 67341, 67342, 67343, 67344, 67345, 67346, 67347, 67348, 67349, 67350, 67351, 67352, 67353, 67354, 67355, 67356, 67357, 67358, 67359, 67360, 67361, 67362, 67363, 67364, 67365, 67366, 67367, 67368, 67369, 67370, 67371, 67372, 67373, 67374, 67375, 67376, 67377, 67378, 67379, 67380, 67381, 67382, 67392, 67393, 67394, 67395, 67396, 67397, 67398, 67399, 67400, 67401, 67402, 67403, 67404, 67405, 67406, 67407, 67408, 67409, 67410, 67411, 67412, 67413, 67424, 67425, 67426, 67427, 67428, 67429, 67430, 67431, 67584, 67585, 67586, 67587, 67588, 67589, 67592, 67594, 67595, 67596, 67597, 67598, 67599, 67600, 67601, 67602, 67603, 67604, 67605, 67606, 67607, 67608, 67609, 67610, 67611, 67612, 67613, 67614, 67615, 67616, 67617, 67618, 67619, 67620, 67621, 67622, 67623, 67624, 67625, 67626, 67627, 67628, 67629, 67630, 67631, 67632, 67633, 67634, 67635, 67636, 67637, 67639, 67640, 67644, 67647, 67648, 67649, 67650, 67651, 67652, 67653, 67654, 67655, 67656, 67657, 67658, 67659, 67660, 67661, 67662, 67663, 67664, 67665, 67666, 67667, 67668, 67669, 67680, 67681, 67682, 67683, 67684, 67685, 67686, 67687, 67688, 67689, 67690, 67691, 67692, 67693, 67694, 67695, 67696, 67697, 67698, 67699, 67700, 67701, 67702, 67712, 67713, 67714, 67715, 67716, 67717, 67718, 67719, 67720, 67721, 67722, 67723, 67724, 67725, 67726, 67727, 67728, 67729, 67730, 67731, 67732, 67733, 67734, 67735, 67736, 67737, 67738, 67739, 67740, 67741, 67742, 67808, 67809, 67810, 67811, 67812, 67813, 67814, 67815, 67816, 67817, 67818, 67819, 67820, 67821, 67822, 67823, 67824, 67825, 67826, 67828, 67829, 67840, 67841, 67842, 67843, 67844, 67845, 67846, 67847, 67848, 67849, 67850, 67851, 67852, 67853, 67854, 67855, 67856, 67857, 67858, 67859, 67860, 67861, 67872, 67873, 67874, 67875, 67876, 67877, 67878, 67879, 67880, 67881, 67882, 67883, 67884, 67885, 67886, 67887, 67888, 67889, 67890, 67891, 67892, 67893, 67894, 67895, 67896, 67897, 67968, 67969, 67970, 67971, 67972, 67973, 67974, 67975, 67976, 67977, 67978, 67979, 67980, 67981, 67982, 67983, 67984, 67985, 67986, 67987, 67988, 67989, 67990, 67991, 67992, 67993, 67994, 67995, 67996, 67997, 67998, 67999, 68000, 68001, 68002, 68003, 68004, 68005, 68006, 68007, 68008, 68009, 68010, 68011, 68012, 68013, 68014, 68015, 68016, 68017, 68018, 68019, 68020, 68021, 68022, 68023, 68030, 68031, 68096, 68112, 68113, 68114, 68115, 68117, 68118, 68119, 68121, 68122, 68123, 68124, 68125, 68126, 68127, 68128, 68129, 68130, 68131, 68132, 68133, 68134, 68135, 68136, 68137, 68138, 68139, 68140, 68141, 68142, 68143, 68144, 68145, 68146, 68147, 68192, 68193, 68194, 68195, 68196, 68197, 68198, 68199, 68200, 68201, 68202, 68203, 68204, 68205, 68206, 68207, 68208, 68209, 68210, 68211, 68212, 68213, 68214, 68215, 68216, 68217, 68218, 68219, 68220, 68224, 68225, 68226, 68227, 68228, 68229, 68230, 68231, 68232, 68233, 68234, 68235, 68236, 68237, 68238, 68239, 68240, 68241, 68242, 68243, 68244, 68245, 68246, 68247, 68248, 68249, 68250, 68251, 68252, 68288, 68289, 68290, 68291, 68292, 68293, 68294, 68295, 68297, 68298, 68299, 68300, 68301, 68302, 68303, 68304, 68305, 68306, 68307, 68308, 68309, 68310, 68311, 68312, 68313, 68314, 68315, 68316, 68317, 68318, 68319, 68320, 68321, 68322, 68323, 68324, 68352, 68353, 68354, 68355, 68356, 68357, 68358, 68359, 68360, 68361, 68362, 68363, 68364, 68365, 68366, 68367, 68368, 68369, 68370, 68371, 68372, 68373, 68374, 68375, 68376, 68377, 68378, 68379, 68380, 68381, 68382, 68383, 68384, 68385, 68386, 68387, 68388, 68389, 68390, 68391, 68392, 68393, 68394, 68395, 68396, 68397, 68398, 68399, 68400, 68401, 68402, 68403, 68404, 68405, 68416, 68417, 68418, 68419, 68420, 68421, 68422, 68423, 68424, 68425, 68426, 68427, 68428, 68429, 68430, 68431, 68432, 68433, 68434, 68435, 68436, 68437, 68448, 68449, 68450, 68451, 68452, 68453, 68454, 68455, 68456, 68457, 68458, 68459, 68460, 68461, 68462, 68463, 68464, 68465, 68466, 68480, 68481, 68482, 68483, 68484, 68485, 68486, 68487, 68488, 68489, 68490, 68491, 68492, 68493, 68494, 68495, 68496, 68497, 68608, 68609, 68610, 68611, 68612, 68613, 68614, 68615, 68616, 68617, 68618, 68619, 68620, 68621, 68622, 68623, 68624, 68625, 68626, 68627, 68628, 68629, 68630, 68631, 68632, 68633, 68634, 68635, 68636, 68637, 68638, 68639, 68640, 68641, 68642, 68643, 68644, 68645, 68646, 68647, 68648, 68649, 68650, 68651, 68652, 68653, 68654, 68655, 68656, 68657, 68658, 68659, 68660, 68661, 68662, 68663, 68664, 68665, 68666, 68667, 68668, 68669, 68670, 68671, 68672, 68673, 68674, 68675, 68676, 68677, 68678, 68679, 68680, 68736, 68737, 68738, 68739, 68740, 68741, 68742, 68743, 68744, 68745, 68746, 68747, 68748, 68749, 68750, 68751, 68752, 68753, 68754, 68755, 68756, 68757, 68758, 68759, 68760, 68761, 68762, 68763, 68764, 68765, 68766, 68767, 68768, 68769, 68770, 68771, 68772, 68773, 68774, 68775, 68776, 68777, 68778, 68779, 68780, 68781, 68782, 68783, 68784, 68785, 68786, 68800, 68801, 68802, 68803, 68804, 68805, 68806, 68807, 68808, 68809, 68810, 68811, 68812, 68813, 68814, 68815, 68816, 68817, 68818, 68819, 68820, 68821, 68822, 68823, 68824, 68825, 68826, 68827, 68828, 68829, 68830, 68831, 68832, 68833, 68834, 68835, 68836, 68837, 68838, 68839, 68840, 68841, 68842, 68843, 68844, 68845, 68846, 68847, 68848, 68849, 68850, 69635, 69636, 69637, 69638, 69639, 69640, 69641, 69642, 69643, 69644, 69645, 69646, 69647, 69648, 69649, 69650, 69651, 69652, 69653, 69654, 69655, 69656, 69657, 69658, 69659, 69660, 69661, 69662, 69663, 69664, 69665, 69666, 69667, 69668, 69669, 69670, 69671, 69672, 69673, 69674, 69675, 69676, 69677, 69678, 69679, 69680, 69681, 69682, 69683, 69684, 69685, 69686, 69687, 69763, 69764, 69765, 69766, 69767, 69768, 69769, 69770, 69771, 69772, 69773, 69774, 69775, 69776, 69777, 69778, 69779, 69780, 69781, 69782, 69783, 69784, 69785, 69786, 69787, 69788, 69789, 69790, 69791, 69792, 69793, 69794, 69795, 69796, 69797, 69798, 69799, 69800, 69801, 69802, 69803, 69804, 69805, 69806, 69807, 69840, 69841, 69842, 69843, 69844, 69845, 69846, 69847, 69848, 69849, 69850, 69851, 69852, 69853, 69854, 69855, 69856, 69857, 69858, 69859, 69860, 69861, 69862, 69863, 69864, 69891, 69892, 69893, 69894, 69895, 69896, 69897, 69898, 69899, 69900, 69901, 69902, 69903, 69904, 69905, 69906, 69907, 69908, 69909, 69910, 69911, 69912, 69913, 69914, 69915, 69916, 69917, 69918, 69919, 69920, 69921, 69922, 69923, 69924, 69925, 69926, 69968, 69969, 69970, 69971, 69972, 69973, 69974, 69975, 69976, 69977, 69978, 69979, 69980, 69981, 69982, 69983, 69984, 69985, 69986, 69987, 69988, 69989, 69990, 69991, 69992, 69993, 69994, 69995, 69996, 69997, 69998, 69999, 70000, 70001, 70002, 70006, 70019, 70020, 70021, 70022, 70023, 70024, 70025, 70026, 70027, 70028, 70029, 70030, 70031, 70032, 70033, 70034, 70035, 70036, 70037, 70038, 70039, 70040, 70041, 70042, 70043, 70044, 70045, 70046, 70047, 70048, 70049, 70050, 70051, 70052, 70053, 70054, 70055, 70056, 70057, 70058, 70059, 70060, 70061, 70062, 70063, 70064, 70065, 70066, 70081, 70082, 70083, 70084, 70106, 70108, 70144, 70145, 70146, 70147, 70148, 70149, 70150, 70151, 70152, 70153, 70154, 70155, 70156, 70157, 70158, 70159, 70160, 70161, 70163, 70164, 70165, 70166, 70167, 70168, 70169, 70170, 70171, 70172, 70173, 70174, 70175, 70176, 70177, 70178, 70179, 70180, 70181, 70182, 70183, 70184, 70185, 70186, 70187, 70272, 70273, 70274, 70275, 70276, 70277, 70278, 70280, 70282, 70283, 70284, 70285, 70287, 70288, 70289, 70290, 70291, 70292, 70293, 70294, 70295, 70296, 70297, 70298, 70299, 70300, 70301, 70303, 70304, 70305, 70306, 70307, 70308, 70309, 70310, 70311, 70312, 70320, 70321, 70322, 70323, 70324, 70325, 70326, 70327, 70328, 70329, 70330, 70331, 70332, 70333, 70334, 70335, 70336, 70337, 70338, 70339, 70340, 70341, 70342, 70343, 70344, 70345, 70346, 70347, 70348, 70349, 70350, 70351, 70352, 70353, 70354, 70355, 70356, 70357, 70358, 70359, 70360, 70361, 70362, 70363, 70364, 70365, 70366, 70405, 70406, 70407, 70408, 70409, 70410, 70411, 70412, 70415, 70416, 70419, 70420, 70421, 70422, 70423, 70424, 70425, 70426, 70427, 70428, 70429, 70430, 70431, 70432, 70433, 70434, 70435, 70436, 70437, 70438, 70439, 70440, 70442, 70443, 70444, 70445, 70446, 70447, 70448, 70450, 70451, 70453, 70454, 70455, 70456, 70457, 70461, 70480, 70493, 70494, 70495, 70496, 70497, 70784, 70785, 70786, 70787, 70788, 70789, 70790, 70791, 70792, 70793, 70794, 70795, 70796, 70797, 70798, 70799, 70800, 70801, 70802, 70803, 70804, 70805, 70806, 70807, 70808, 70809, 70810, 70811, 70812, 70813, 70814, 70815, 70816, 70817, 70818, 70819, 70820, 70821, 70822, 70823, 70824, 70825, 70826, 70827, 70828, 70829, 70830, 70831, 70852, 70853, 70855, 71040, 71041, 71042, 71043, 71044, 71045, 71046, 71047, 71048, 71049, 71050, 71051, 71052, 71053, 71054, 71055, 71056, 71057, 71058, 71059, 71060, 71061, 71062, 71063, 71064, 71065, 71066, 71067, 71068, 71069, 71070, 71071, 71072, 71073, 71074, 71075, 71076, 71077, 71078, 71079, 71080, 71081, 71082, 71083, 71084, 71085, 71086, 71128, 71129, 71130, 71131, 71168, 71169, 71170, 71171, 71172, 71173, 71174, 71175, 71176, 71177, 71178, 71179, 71180, 71181, 71182, 71183, 71184, 71185, 71186, 71187, 71188, 71189, 71190, 71191, 71192, 71193, 71194, 71195, 71196, 71197, 71198, 71199, 71200, 71201, 71202, 71203, 71204, 71205, 71206, 71207, 71208, 71209, 71210, 71211, 71212, 71213, 71214, 71215, 71236, 71296, 71297, 71298, 71299, 71300, 71301, 71302, 71303, 71304, 71305, 71306, 71307, 71308, 71309, 71310, 71311, 71312, 71313, 71314, 71315, 71316, 71317, 71318, 71319, 71320, 71321, 71322, 71323, 71324, 71325, 71326, 71327, 71328, 71329, 71330, 71331, 71332, 71333, 71334, 71335, 71336, 71337, 71338, 71424, 71425, 71426, 71427, 71428, 71429, 71430, 71431, 71432, 71433, 71434, 71435, 71436, 71437, 71438, 71439, 71440, 71441, 71442, 71443, 71444, 71445, 71446, 71447, 71448, 71449, 71840, 71841, 71842, 71843, 71844, 71845, 71846, 71847, 71848, 71849, 71850, 71851, 71852, 71853, 71854, 71855, 71856, 71857, 71858, 71859, 71860, 71861, 71862, 71863, 71864, 71865, 71866, 71867, 71868, 71869, 71870, 71871, 71872, 71873, 71874, 71875, 71876, 71877, 71878, 71879, 71880, 71881, 71882, 71883, 71884, 71885, 71886, 71887, 71888, 71889, 71890, 71891, 71892, 71893, 71894, 71895, 71896, 71897, 71898, 71899, 71900, 71901, 71902, 71903, 71935, 72384, 72385, 72386, 72387, 72388, 72389, 72390, 72391, 72392, 72393, 72394, 72395, 72396, 72397, 72398, 72399, 72400, 72401, 72402, 72403, 72404, 72405, 72406, 72407, 72408, 72409, 72410, 72411, 72412, 72413, 72414, 72415, 72416, 72417, 72418, 72419, 72420, 72421, 72422, 72423, 72424, 72425, 72426, 72427, 72428, 72429, 72430, 72431, 72432, 72433, 72434, 72435, 72436, 72437, 72438, 72439, 72440, 73728, 73729, 73730, 73731, 73732, 73733, 73734, 73735, 73736, 73737, 73738, 73739, 73740, 73741, 73742, 73743, 73744, 73745, 73746, 73747, 73748, 73749, 73750, 73751, 73752, 73753, 73754, 73755, 73756, 73757, 73758, 73759, 73760, 73761, 73762, 73763, 73764, 73765, 73766, 73767, 73768, 73769, 73770, 73771, 73772, 73773, 73774, 73775, 73776, 73777, 73778, 73779, 73780, 73781, 73782, 73783, 73784, 73785, 73786, 73787, 73788, 73789, 73790, 73791, 73792, 73793, 73794, 73795, 73796, 73797, 73798, 73799, 73800, 73801, 73802, 73803, 73804, 73805, 73806, 73807, 73808, 73809, 73810, 73811, 73812, 73813, 73814, 73815, 73816, 73817, 73818, 73819, 73820, 73821, 73822, 73823, 73824, 73825, 73826, 73827, 73828, 73829, 73830, 73831, 73832, 73833, 73834, 73835, 73836, 73837, 73838, 73839, 73840, 73841, 73842, 73843, 73844, 73845, 73846, 73847, 73848, 73849, 73850, 73851, 73852, 73853, 73854, 73855, 73856, 73857, 73858, 73859, 73860, 73861, 73862, 73863, 73864, 73865, 73866, 73867, 73868, 73869, 73870, 73871, 73872, 73873, 73874, 73875, 73876, 73877, 73878, 73879, 73880, 73881, 73882, 73883, 73884, 73885, 73886, 73887, 73888, 73889, 73890, 73891, 73892, 73893, 73894, 73895, 73896, 73897, 73898, 73899, 73900, 73901, 73902, 73903, 73904, 73905, 73906, 73907, 73908, 73909, 73910, 73911, 73912, 73913, 73914, 73915, 73916, 73917, 73918, 73919, 73920, 73921, 73922, 73923, 73924, 73925, 73926, 73927, 73928, 73929, 73930, 73931, 73932, 73933, 73934, 73935, 73936, 73937, 73938, 73939, 73940, 73941, 73942, 73943, 73944, 73945, 73946, 73947, 73948, 73949, 73950, 73951, 73952, 73953, 73954, 73955, 73956, 73957, 73958, 73959, 73960, 73961, 73962, 73963, 73964, 73965, 73966, 73967, 73968, 73969, 73970, 73971, 73972, 73973, 73974, 73975, 73976, 73977, 73978, 73979, 73980, 73981, 73982, 73983, 73984, 73985, 73986, 73987, 73988, 73989, 73990, 73991, 73992, 73993, 73994, 73995, 73996, 73997, 73998, 73999, 74000, 74001, 74002, 74003, 74004, 74005, 74006, 74007, 74008, 74009, 74010, 74011, 74012, 74013, 74014, 74015, 74016, 74017, 74018, 74019, 74020, 74021, 74022, 74023, 74024, 74025, 74026, 74027, 74028, 74029, 74030, 74031, 74032, 74033, 74034, 74035, 74036, 74037, 74038, 74039, 74040, 74041, 74042, 74043, 74044, 74045, 74046, 74047, 74048, 74049, 74050, 74051, 74052, 74053, 74054, 74055, 74056, 74057, 74058, 74059, 74060, 74061, 74062, 74063, 74064, 74065, 74066, 74067, 74068, 74069, 74070, 74071, 74072, 74073, 74074, 74075, 74076, 74077, 74078, 74079, 74080, 74081, 74082, 74083, 74084, 74085, 74086, 74087, 74088, 74089, 74090, 74091, 74092, 74093, 74094, 74095, 74096, 74097, 74098, 74099, 74100, 74101, 74102, 74103, 74104, 74105, 74106, 74107, 74108, 74109, 74110, 74111, 74112, 74113, 74114, 74115, 74116, 74117, 74118, 74119, 74120, 74121, 74122, 74123, 74124, 74125, 74126, 74127, 74128, 74129, 74130, 74131, 74132, 74133, 74134, 74135, 74136, 74137, 74138, 74139, 74140, 74141, 74142, 74143, 74144, 74145, 74146, 74147, 74148, 74149, 74150, 74151, 74152, 74153, 74154, 74155, 74156, 74157, 74158, 74159, 74160, 74161, 74162, 74163, 74164, 74165, 74166, 74167, 74168, 74169, 74170, 74171, 74172, 74173, 74174, 74175, 74176, 74177, 74178, 74179, 74180, 74181, 74182, 74183, 74184, 74185, 74186, 74187, 74188, 74189, 74190, 74191, 74192, 74193, 74194, 74195, 74196, 74197, 74198, 74199, 74200, 74201, 74202, 74203, 74204, 74205, 74206, 74207, 74208, 74209, 74210, 74211, 74212, 74213, 74214, 74215, 74216, 74217, 74218, 74219, 74220, 74221, 74222, 74223, 74224, 74225, 74226, 74227, 74228, 74229, 74230, 74231, 74232, 74233, 74234, 74235, 74236, 74237, 74238, 74239, 74240, 74241, 74242, 74243, 74244, 74245, 74246, 74247, 74248, 74249, 74250, 74251, 74252, 74253, 74254, 74255, 74256, 74257, 74258, 74259, 74260, 74261, 74262, 74263, 74264, 74265, 74266, 74267, 74268, 74269, 74270, 74271, 74272, 74273, 74274, 74275, 74276, 74277, 74278, 74279, 74280, 74281, 74282, 74283, 74284, 74285, 74286, 74287, 74288, 74289, 74290, 74291, 74292, 74293, 74294, 74295, 74296, 74297, 74298, 74299, 74300, 74301, 74302, 74303, 74304, 74305, 74306, 74307, 74308, 74309, 74310, 74311, 74312, 74313, 74314, 74315, 74316, 74317, 74318, 74319, 74320, 74321, 74322, 74323, 74324, 74325, 74326, 74327, 74328, 74329, 74330, 74331, 74332, 74333, 74334, 74335, 74336, 74337, 74338, 74339, 74340, 74341, 74342, 74343, 74344, 74345, 74346, 74347, 74348, 74349, 74350, 74351, 74352, 74353, 74354, 74355, 74356, 74357, 74358, 74359, 74360, 74361, 74362, 74363, 74364, 74365, 74366, 74367, 74368, 74369, 74370, 74371, 74372, 74373, 74374, 74375, 74376, 74377, 74378, 74379, 74380, 74381, 74382, 74383, 74384, 74385, 74386, 74387, 74388, 74389, 74390, 74391, 74392, 74393, 74394, 74395, 74396, 74397, 74398, 74399, 74400, 74401, 74402, 74403, 74404, 74405, 74406, 74407, 74408, 74409, 74410, 74411, 74412, 74413, 74414, 74415, 74416, 74417, 74418, 74419, 74420, 74421, 74422, 74423, 74424, 74425, 74426, 74427, 74428, 74429, 74430, 74431, 74432, 74433, 74434, 74435, 74436, 74437, 74438, 74439, 74440, 74441, 74442, 74443, 74444, 74445, 74446, 74447, 74448, 74449, 74450, 74451, 74452, 74453, 74454, 74455, 74456, 74457, 74458, 74459, 74460, 74461, 74462, 74463, 74464, 74465, 74466, 74467, 74468, 74469, 74470, 74471, 74472, 74473, 74474, 74475, 74476, 74477, 74478, 74479, 74480, 74481, 74482, 74483, 74484, 74485, 74486, 74487, 74488, 74489, 74490, 74491, 74492, 74493, 74494, 74495, 74496, 74497, 74498, 74499, 74500, 74501, 74502, 74503, 74504, 74505, 74506, 74507, 74508, 74509, 74510, 74511, 74512, 74513, 74514, 74515, 74516, 74517, 74518, 74519, 74520, 74521, 74522, 74523, 74524, 74525, 74526, 74527, 74528, 74529, 74530, 74531, 74532, 74533, 74534, 74535, 74536, 74537, 74538, 74539, 74540, 74541, 74542, 74543, 74544, 74545, 74546, 74547, 74548, 74549, 74550, 74551, 74552, 74553, 74554, 74555, 74556, 74557, 74558, 74559, 74560, 74561, 74562, 74563, 74564, 74565, 74566, 74567, 74568, 74569, 74570, 74571, 74572, 74573, 74574, 74575, 74576, 74577, 74578, 74579, 74580, 74581, 74582, 74583, 74584, 74585, 74586, 74587, 74588, 74589, 74590, 74591, 74592, 74593, 74594, 74595, 74596, 74597, 74598, 74599, 74600, 74601, 74602, 74603, 74604, 74605, 74606, 74607, 74608, 74609, 74610, 74611, 74612, 74613, 74614, 74615, 74616, 74617, 74618, 74619, 74620, 74621, 74622, 74623, 74624, 74625, 74626, 74627, 74628, 74629, 74630, 74631, 74632, 74633, 74634, 74635, 74636, 74637, 74638, 74639, 74640, 74641, 74642, 74643, 74644, 74645, 74646, 74647, 74648, 74649, 74880, 74881, 74882, 74883, 74884, 74885, 74886, 74887, 74888, 74889, 74890, 74891, 74892, 74893, 74894, 74895, 74896, 74897, 74898, 74899, 74900, 74901, 74902, 74903, 74904, 74905, 74906, 74907, 74908, 74909, 74910, 74911, 74912, 74913, 74914, 74915, 74916, 74917, 74918, 74919, 74920, 74921, 74922, 74923, 74924, 74925, 74926, 74927, 74928, 74929, 74930, 74931, 74932, 74933, 74934, 74935, 74936, 74937, 74938, 74939, 74940, 74941, 74942, 74943, 74944, 74945, 74946, 74947, 74948, 74949, 74950, 74951, 74952, 74953, 74954, 74955, 74956, 74957, 74958, 74959, 74960, 74961, 74962, 74963, 74964, 74965, 74966, 74967, 74968, 74969, 74970, 74971, 74972, 74973, 74974, 74975, 74976, 74977, 74978, 74979, 74980, 74981, 74982, 74983, 74984, 74985, 74986, 74987, 74988, 74989, 74990, 74991, 74992, 74993, 74994, 74995, 74996, 74997, 74998, 74999, 75000, 75001, 75002, 75003, 75004, 75005, 75006, 75007, 75008, 75009, 75010, 75011, 75012, 75013, 75014, 75015, 75016, 75017, 75018, 75019, 75020, 75021, 75022, 75023, 75024, 75025, 75026, 75027, 75028, 75029, 75030, 75031, 75032, 75033, 75034, 75035, 75036, 75037, 75038, 75039, 75040, 75041, 75042, 75043, 75044, 75045, 75046, 75047, 75048, 75049, 75050, 75051, 75052, 75053, 75054, 75055, 75056, 75057, 75058, 75059, 75060, 75061, 75062, 75063, 75064, 75065, 75066, 75067, 75068, 75069, 75070, 75071, 75072, 75073, 75074, 75075, 77824, 77825, 77826, 77827, 77828, 77829, 77830, 77831, 77832, 77833, 77834, 77835, 77836, 77837, 77838, 77839, 77840, 77841, 77842, 77843, 77844, 77845, 77846, 77847, 77848, 77849, 77850, 77851, 77852, 77853, 77854, 77855, 77856, 77857, 77858, 77859, 77860, 77861, 77862, 77863, 77864, 77865, 77866, 77867, 77868, 77869, 77870, 77871, 77872, 77873, 77874, 77875, 77876, 77877, 77878, 77879, 77880, 77881, 77882, 77883, 77884, 77885, 77886, 77887, 77888, 77889, 77890, 77891, 77892, 77893, 77894, 77895, 77896, 77897, 77898, 77899, 77900, 77901, 77902, 77903, 77904, 77905, 77906, 77907, 77908, 77909, 77910, 77911, 77912, 77913, 77914, 77915, 77916, 77917, 77918, 77919, 77920, 77921, 77922, 77923, 77924, 77925, 77926, 77927, 77928, 77929, 77930, 77931, 77932, 77933, 77934, 77935, 77936, 77937, 77938, 77939, 77940, 77941, 77942, 77943, 77944, 77945, 77946, 77947, 77948, 77949, 77950, 77951, 77952, 77953, 77954, 77955, 77956, 77957, 77958, 77959, 77960, 77961, 77962, 77963, 77964, 77965, 77966, 77967, 77968, 77969, 77970, 77971, 77972, 77973, 77974, 77975, 77976, 77977, 77978, 77979, 77980, 77981, 77982, 77983, 77984, 77985, 77986, 77987, 77988, 77989, 77990, 77991, 77992, 77993, 77994, 77995, 77996, 77997, 77998, 77999, 78000, 78001, 78002, 78003, 78004, 78005, 78006, 78007, 78008, 78009, 78010, 78011, 78012, 78013, 78014, 78015, 78016, 78017, 78018, 78019, 78020, 78021, 78022, 78023, 78024, 78025, 78026, 78027, 78028, 78029, 78030, 78031, 78032, 78033, 78034, 78035, 78036, 78037, 78038, 78039, 78040, 78041, 78042, 78043, 78044, 78045, 78046, 78047, 78048, 78049, 78050, 78051, 78052, 78053, 78054, 78055, 78056, 78057, 78058, 78059, 78060, 78061, 78062, 78063, 78064, 78065, 78066, 78067, 78068, 78069, 78070, 78071, 78072, 78073, 78074, 78075, 78076, 78077, 78078, 78079, 78080, 78081, 78082, 78083, 78084, 78085, 78086, 78087, 78088, 78089, 78090, 78091, 78092, 78093, 78094, 78095, 78096, 78097, 78098, 78099, 78100, 78101, 78102, 78103, 78104, 78105, 78106, 78107, 78108, 78109, 78110, 78111, 78112, 78113, 78114, 78115, 78116, 78117, 78118, 78119, 78120, 78121, 78122, 78123, 78124, 78125, 78126, 78127, 78128, 78129, 78130, 78131, 78132, 78133, 78134, 78135, 78136, 78137, 78138, 78139, 78140, 78141, 78142, 78143, 78144, 78145, 78146, 78147, 78148, 78149, 78150, 78151, 78152, 78153, 78154, 78155, 78156, 78157, 78158, 78159, 78160, 78161, 78162, 78163, 78164, 78165, 78166, 78167, 78168, 78169, 78170, 78171, 78172, 78173, 78174, 78175, 78176, 78177, 78178, 78179, 78180, 78181, 78182, 78183, 78184, 78185, 78186, 78187, 78188, 78189, 78190, 78191, 78192, 78193, 78194, 78195, 78196, 78197, 78198, 78199, 78200, 78201, 78202, 78203, 78204, 78205, 78206, 78207, 78208, 78209, 78210, 78211, 78212, 78213, 78214, 78215, 78216, 78217, 78218, 78219, 78220, 78221, 78222, 78223, 78224, 78225, 78226, 78227, 78228, 78229, 78230, 78231, 78232, 78233, 78234, 78235, 78236, 78237, 78238, 78239, 78240, 78241, 78242, 78243, 78244, 78245, 78246, 78247, 78248, 78249, 78250, 78251, 78252, 78253, 78254, 78255, 78256, 78257, 78258, 78259, 78260, 78261, 78262, 78263, 78264, 78265, 78266, 78267, 78268, 78269, 78270, 78271, 78272, 78273, 78274, 78275, 78276, 78277, 78278, 78279, 78280, 78281, 78282, 78283, 78284, 78285, 78286, 78287, 78288, 78289, 78290, 78291, 78292, 78293, 78294, 78295, 78296, 78297, 78298, 78299, 78300, 78301, 78302, 78303, 78304, 78305, 78306, 78307, 78308, 78309, 78310, 78311, 78312, 78313, 78314, 78315, 78316, 78317, 78318, 78319, 78320, 78321, 78322, 78323, 78324, 78325, 78326, 78327, 78328, 78329, 78330, 78331, 78332, 78333, 78334, 78335, 78336, 78337, 78338, 78339, 78340, 78341, 78342, 78343, 78344, 78345, 78346, 78347, 78348, 78349, 78350, 78351, 78352, 78353, 78354, 78355, 78356, 78357, 78358, 78359, 78360, 78361, 78362, 78363, 78364, 78365, 78366, 78367, 78368, 78369, 78370, 78371, 78372, 78373, 78374, 78375, 78376, 78377, 78378, 78379, 78380, 78381, 78382, 78383, 78384, 78385, 78386, 78387, 78388, 78389, 78390, 78391, 78392, 78393, 78394, 78395, 78396, 78397, 78398, 78399, 78400, 78401, 78402, 78403, 78404, 78405, 78406, 78407, 78408, 78409, 78410, 78411, 78412, 78413, 78414, 78415, 78416, 78417, 78418, 78419, 78420, 78421, 78422, 78423, 78424, 78425, 78426, 78427, 78428, 78429, 78430, 78431, 78432, 78433, 78434, 78435, 78436, 78437, 78438, 78439, 78440, 78441, 78442, 78443, 78444, 78445, 78446, 78447, 78448, 78449, 78450, 78451, 78452, 78453, 78454, 78455, 78456, 78457, 78458, 78459, 78460, 78461, 78462, 78463, 78464, 78465, 78466, 78467, 78468, 78469, 78470, 78471, 78472, 78473, 78474, 78475, 78476, 78477, 78478, 78479, 78480, 78481, 78482, 78483, 78484, 78485, 78486, 78487, 78488, 78489, 78490, 78491, 78492, 78493, 78494, 78495, 78496, 78497, 78498, 78499, 78500, 78501, 78502, 78503, 78504, 78505, 78506, 78507, 78508, 78509, 78510, 78511, 78512, 78513, 78514, 78515, 78516, 78517, 78518, 78519, 78520, 78521, 78522, 78523, 78524, 78525, 78526, 78527, 78528, 78529, 78530, 78531, 78532, 78533, 78534, 78535, 78536, 78537, 78538, 78539, 78540, 78541, 78542, 78543, 78544, 78545, 78546, 78547, 78548, 78549, 78550, 78551, 78552, 78553, 78554, 78555, 78556, 78557, 78558, 78559, 78560, 78561, 78562, 78563, 78564, 78565, 78566, 78567, 78568, 78569, 78570, 78571, 78572, 78573, 78574, 78575, 78576, 78577, 78578, 78579, 78580, 78581, 78582, 78583, 78584, 78585, 78586, 78587, 78588, 78589, 78590, 78591, 78592, 78593, 78594, 78595, 78596, 78597, 78598, 78599, 78600, 78601, 78602, 78603, 78604, 78605, 78606, 78607, 78608, 78609, 78610, 78611, 78612, 78613, 78614, 78615, 78616, 78617, 78618, 78619, 78620, 78621, 78622, 78623, 78624, 78625, 78626, 78627, 78628, 78629, 78630, 78631, 78632, 78633, 78634, 78635, 78636, 78637, 78638, 78639, 78640, 78641, 78642, 78643, 78644, 78645, 78646, 78647, 78648, 78649, 78650, 78651, 78652, 78653, 78654, 78655, 78656, 78657, 78658, 78659, 78660, 78661, 78662, 78663, 78664, 78665, 78666, 78667, 78668, 78669, 78670, 78671, 78672, 78673, 78674, 78675, 78676, 78677, 78678, 78679, 78680, 78681, 78682, 78683, 78684, 78685, 78686, 78687, 78688, 78689, 78690, 78691, 78692, 78693, 78694, 78695, 78696, 78697, 78698, 78699, 78700, 78701, 78702, 78703, 78704, 78705, 78706, 78707, 78708, 78709, 78710, 78711, 78712, 78713, 78714, 78715, 78716, 78717, 78718, 78719, 78720, 78721, 78722, 78723, 78724, 78725, 78726, 78727, 78728, 78729, 78730, 78731, 78732, 78733, 78734, 78735, 78736, 78737, 78738, 78739, 78740, 78741, 78742, 78743, 78744, 78745, 78746, 78747, 78748, 78749, 78750, 78751, 78752, 78753, 78754, 78755, 78756, 78757, 78758, 78759, 78760, 78761, 78762, 78763, 78764, 78765, 78766, 78767, 78768, 78769, 78770, 78771, 78772, 78773, 78774, 78775, 78776, 78777, 78778, 78779, 78780, 78781, 78782, 78783, 78784, 78785, 78786, 78787, 78788, 78789, 78790, 78791, 78792, 78793, 78794, 78795, 78796, 78797, 78798, 78799, 78800, 78801, 78802, 78803, 78804, 78805, 78806, 78807, 78808, 78809, 78810, 78811, 78812, 78813, 78814, 78815, 78816, 78817, 78818, 78819, 78820, 78821, 78822, 78823, 78824, 78825, 78826, 78827, 78828, 78829, 78830, 78831, 78832, 78833, 78834, 78835, 78836, 78837, 78838, 78839, 78840, 78841, 78842, 78843, 78844, 78845, 78846, 78847, 78848, 78849, 78850, 78851, 78852, 78853, 78854, 78855, 78856, 78857, 78858, 78859, 78860, 78861, 78862, 78863, 78864, 78865, 78866, 78867, 78868, 78869, 78870, 78871, 78872, 78873, 78874, 78875, 78876, 78877, 78878, 78879, 78880, 78881, 78882, 78883, 78884, 78885, 78886, 78887, 78888, 78889, 78890, 78891, 78892, 78893, 78894, 82944, 82945, 82946, 82947, 82948, 82949, 82950, 82951, 82952, 82953, 82954, 82955, 82956, 82957, 82958, 82959, 82960, 82961, 82962, 82963, 82964, 82965, 82966, 82967, 82968, 82969, 82970, 82971, 82972, 82973, 82974, 82975, 82976, 82977, 82978, 82979, 82980, 82981, 82982, 82983, 82984, 82985, 82986, 82987, 82988, 82989, 82990, 82991, 82992, 82993, 82994, 82995, 82996, 82997, 82998, 82999, 83000, 83001, 83002, 83003, 83004, 83005, 83006, 83007, 83008, 83009, 83010, 83011, 83012, 83013, 83014, 83015, 83016, 83017, 83018, 83019, 83020, 83021, 83022, 83023, 83024, 83025, 83026, 83027, 83028, 83029, 83030, 83031, 83032, 83033, 83034, 83035, 83036, 83037, 83038, 83039, 83040, 83041, 83042, 83043, 83044, 83045, 83046, 83047, 83048, 83049, 83050, 83051, 83052, 83053, 83054, 83055, 83056, 83057, 83058, 83059, 83060, 83061, 83062, 83063, 83064, 83065, 83066, 83067, 83068, 83069, 83070, 83071, 83072, 83073, 83074, 83075, 83076, 83077, 83078, 83079, 83080, 83081, 83082, 83083, 83084, 83085, 83086, 83087, 83088, 83089, 83090, 83091, 83092, 83093, 83094, 83095, 83096, 83097, 83098, 83099, 83100, 83101, 83102, 83103, 83104, 83105, 83106, 83107, 83108, 83109, 83110, 83111, 83112, 83113, 83114, 83115, 83116, 83117, 83118, 83119, 83120, 83121, 83122, 83123, 83124, 83125, 83126, 83127, 83128, 83129, 83130, 83131, 83132, 83133, 83134, 83135, 83136, 83137, 83138, 83139, 83140, 83141, 83142, 83143, 83144, 83145, 83146, 83147, 83148, 83149, 83150, 83151, 83152, 83153, 83154, 83155, 83156, 83157, 83158, 83159, 83160, 83161, 83162, 83163, 83164, 83165, 83166, 83167, 83168, 83169, 83170, 83171, 83172, 83173, 83174, 83175, 83176, 83177, 83178, 83179, 83180, 83181, 83182, 83183, 83184, 83185, 83186, 83187, 83188, 83189, 83190, 83191, 83192, 83193, 83194, 83195, 83196, 83197, 83198, 83199, 83200, 83201, 83202, 83203, 83204, 83205, 83206, 83207, 83208, 83209, 83210, 83211, 83212, 83213, 83214, 83215, 83216, 83217, 83218, 83219, 83220, 83221, 83222, 83223, 83224, 83225, 83226, 83227, 83228, 83229, 83230, 83231, 83232, 83233, 83234, 83235, 83236, 83237, 83238, 83239, 83240, 83241, 83242, 83243, 83244, 83245, 83246, 83247, 83248, 83249, 83250, 83251, 83252, 83253, 83254, 83255, 83256, 83257, 83258, 83259, 83260, 83261, 83262, 83263, 83264, 83265, 83266, 83267, 83268, 83269, 83270, 83271, 83272, 83273, 83274, 83275, 83276, 83277, 83278, 83279, 83280, 83281, 83282, 83283, 83284, 83285, 83286, 83287, 83288, 83289, 83290, 83291, 83292, 83293, 83294, 83295, 83296, 83297, 83298, 83299, 83300, 83301, 83302, 83303, 83304, 83305, 83306, 83307, 83308, 83309, 83310, 83311, 83312, 83313, 83314, 83315, 83316, 83317, 83318, 83319, 83320, 83321, 83322, 83323, 83324, 83325, 83326, 83327, 83328, 83329, 83330, 83331, 83332, 83333, 83334, 83335, 83336, 83337, 83338, 83339, 83340, 83341, 83342, 83343, 83344, 83345, 83346, 83347, 83348, 83349, 83350, 83351, 83352, 83353, 83354, 83355, 83356, 83357, 83358, 83359, 83360, 83361, 83362, 83363, 83364, 83365, 83366, 83367, 83368, 83369, 83370, 83371, 83372, 83373, 83374, 83375, 83376, 83377, 83378, 83379, 83380, 83381, 83382, 83383, 83384, 83385, 83386, 83387, 83388, 83389, 83390, 83391, 83392, 83393, 83394, 83395, 83396, 83397, 83398, 83399, 83400, 83401, 83402, 83403, 83404, 83405, 83406, 83407, 83408, 83409, 83410, 83411, 83412, 83413, 83414, 83415, 83416, 83417, 83418, 83419, 83420, 83421, 83422, 83423, 83424, 83425, 83426, 83427, 83428, 83429, 83430, 83431, 83432, 83433, 83434, 83435, 83436, 83437, 83438, 83439, 83440, 83441, 83442, 83443, 83444, 83445, 83446, 83447, 83448, 83449, 83450, 83451, 83452, 83453, 83454, 83455, 83456, 83457, 83458, 83459, 83460, 83461, 83462, 83463, 83464, 83465, 83466, 83467, 83468, 83469, 83470, 83471, 83472, 83473, 83474, 83475, 83476, 83477, 83478, 83479, 83480, 83481, 83482, 83483, 83484, 83485, 83486, 83487, 83488, 83489, 83490, 83491, 83492, 83493, 83494, 83495, 83496, 83497, 83498, 83499, 83500, 83501, 83502, 83503, 83504, 83505, 83506, 83507, 83508, 83509, 83510, 83511, 83512, 83513, 83514, 83515, 83516, 83517, 83518, 83519, 83520, 83521, 83522, 83523, 83524, 83525, 83526, 92160, 92161, 92162, 92163, 92164, 92165, 92166, 92167, 92168, 92169, 92170, 92171, 92172, 92173, 92174, 92175, 92176, 92177, 92178, 92179, 92180, 92181, 92182, 92183, 92184, 92185, 92186, 92187, 92188, 92189, 92190, 92191, 92192, 92193, 92194, 92195, 92196, 92197, 92198, 92199, 92200, 92201, 92202, 92203, 92204, 92205, 92206, 92207, 92208, 92209, 92210, 92211, 92212, 92213, 92214, 92215, 92216, 92217, 92218, 92219, 92220, 92221, 92222, 92223, 92224, 92225, 92226, 92227, 92228, 92229, 92230, 92231, 92232, 92233, 92234, 92235, 92236, 92237, 92238, 92239, 92240, 92241, 92242, 92243, 92244, 92245, 92246, 92247, 92248, 92249, 92250, 92251, 92252, 92253, 92254, 92255, 92256, 92257, 92258, 92259, 92260, 92261, 92262, 92263, 92264, 92265, 92266, 92267, 92268, 92269, 92270, 92271, 92272, 92273, 92274, 92275, 92276, 92277, 92278, 92279, 92280, 92281, 92282, 92283, 92284, 92285, 92286, 92287, 92288, 92289, 92290, 92291, 92292, 92293, 92294, 92295, 92296, 92297, 92298, 92299, 92300, 92301, 92302, 92303, 92304, 92305, 92306, 92307, 92308, 92309, 92310, 92311, 92312, 92313, 92314, 92315, 92316, 92317, 92318, 92319, 92320, 92321, 92322, 92323, 92324, 92325, 92326, 92327, 92328, 92329, 92330, 92331, 92332, 92333, 92334, 92335, 92336, 92337, 92338, 92339, 92340, 92341, 92342, 92343, 92344, 92345, 92346, 92347, 92348, 92349, 92350, 92351, 92352, 92353, 92354, 92355, 92356, 92357, 92358, 92359, 92360, 92361, 92362, 92363, 92364, 92365, 92366, 92367, 92368, 92369, 92370, 92371, 92372, 92373, 92374, 92375, 92376, 92377, 92378, 92379, 92380, 92381, 92382, 92383, 92384, 92385, 92386, 92387, 92388, 92389, 92390, 92391, 92392, 92393, 92394, 92395, 92396, 92397, 92398, 92399, 92400, 92401, 92402, 92403, 92404, 92405, 92406, 92407, 92408, 92409, 92410, 92411, 92412, 92413, 92414, 92415, 92416, 92417, 92418, 92419, 92420, 92421, 92422, 92423, 92424, 92425, 92426, 92427, 92428, 92429, 92430, 92431, 92432, 92433, 92434, 92435, 92436, 92437, 92438, 92439, 92440, 92441, 92442, 92443, 92444, 92445, 92446, 92447, 92448, 92449, 92450, 92451, 92452, 92453, 92454, 92455, 92456, 92457, 92458, 92459, 92460, 92461, 92462, 92463, 92464, 92465, 92466, 92467, 92468, 92469, 92470, 92471, 92472, 92473, 92474, 92475, 92476, 92477, 92478, 92479, 92480, 92481, 92482, 92483, 92484, 92485, 92486, 92487, 92488, 92489, 92490, 92491, 92492, 92493, 92494, 92495, 92496, 92497, 92498, 92499, 92500, 92501, 92502, 92503, 92504, 92505, 92506, 92507, 92508, 92509, 92510, 92511, 92512, 92513, 92514, 92515, 92516, 92517, 92518, 92519, 92520, 92521, 92522, 92523, 92524, 92525, 92526, 92527, 92528, 92529, 92530, 92531, 92532, 92533, 92534, 92535, 92536, 92537, 92538, 92539, 92540, 92541, 92542, 92543, 92544, 92545, 92546, 92547, 92548, 92549, 92550, 92551, 92552, 92553, 92554, 92555, 92556, 92557, 92558, 92559, 92560, 92561, 92562, 92563, 92564, 92565, 92566, 92567, 92568, 92569, 92570, 92571, 92572, 92573, 92574, 92575, 92576, 92577, 92578, 92579, 92580, 92581, 92582, 92583, 92584, 92585, 92586, 92587, 92588, 92589, 92590, 92591, 92592, 92593, 92594, 92595, 92596, 92597, 92598, 92599, 92600, 92601, 92602, 92603, 92604, 92605, 92606, 92607, 92608, 92609, 92610, 92611, 92612, 92613, 92614, 92615, 92616, 92617, 92618, 92619, 92620, 92621, 92622, 92623, 92624, 92625, 92626, 92627, 92628, 92629, 92630, 92631, 92632, 92633, 92634, 92635, 92636, 92637, 92638, 92639, 92640, 92641, 92642, 92643, 92644, 92645, 92646, 92647, 92648, 92649, 92650, 92651, 92652, 92653, 92654, 92655, 92656, 92657, 92658, 92659, 92660, 92661, 92662, 92663, 92664, 92665, 92666, 92667, 92668, 92669, 92670, 92671, 92672, 92673, 92674, 92675, 92676, 92677, 92678, 92679, 92680, 92681, 92682, 92683, 92684, 92685, 92686, 92687, 92688, 92689, 92690, 92691, 92692, 92693, 92694, 92695, 92696, 92697, 92698, 92699, 92700, 92701, 92702, 92703, 92704, 92705, 92706, 92707, 92708, 92709, 92710, 92711, 92712, 92713, 92714, 92715, 92716, 92717, 92718, 92719, 92720, 92721, 92722, 92723, 92724, 92725, 92726, 92727, 92728, 92736, 92737, 92738, 92739, 92740, 92741, 92742, 92743, 92744, 92745, 92746, 92747, 92748, 92749, 92750, 92751, 92752, 92753, 92754, 92755, 92756, 92757, 92758, 92759, 92760, 92761, 92762, 92763, 92764, 92765, 92766, 92880, 92881, 92882, 92883, 92884, 92885, 92886, 92887, 92888, 92889, 92890, 92891, 92892, 92893, 92894, 92895, 92896, 92897, 92898, 92899, 92900, 92901, 92902, 92903, 92904, 92905, 92906, 92907, 92908, 92909, 92928, 92929, 92930, 92931, 92932, 92933, 92934, 92935, 92936, 92937, 92938, 92939, 92940, 92941, 92942, 92943, 92944, 92945, 92946, 92947, 92948, 92949, 92950, 92951, 92952, 92953, 92954, 92955, 92956, 92957, 92958, 92959, 92960, 92961, 92962, 92963, 92964, 92965, 92966, 92967, 92968, 92969, 92970, 92971, 92972, 92973, 92974, 92975, 92992, 92993, 92994, 92995, 93027, 93028, 93029, 93030, 93031, 93032, 93033, 93034, 93035, 93036, 93037, 93038, 93039, 93040, 93041, 93042, 93043, 93044, 93045, 93046, 93047, 93053, 93054, 93055, 93056, 93057, 93058, 93059, 93060, 93061, 93062, 93063, 93064, 93065, 93066, 93067, 93068, 93069, 93070, 93071, 93952, 93953, 93954, 93955, 93956, 93957, 93958, 93959, 93960, 93961, 93962, 93963, 93964, 93965, 93966, 93967, 93968, 93969, 93970, 93971, 93972, 93973, 93974, 93975, 93976, 93977, 93978, 93979, 93980, 93981, 93982, 93983, 93984, 93985, 93986, 93987, 93988, 93989, 93990, 93991, 93992, 93993, 93994, 93995, 93996, 93997, 93998, 93999, 94000, 94001, 94002, 94003, 94004, 94005, 94006, 94007, 94008, 94009, 94010, 94011, 94012, 94013, 94014, 94015, 94016, 94017, 94018, 94019, 94020, 94032, 94099, 94100, 94101, 94102, 94103, 94104, 94105, 94106, 94107, 94108, 94109, 94110, 94111, 110592, 110593, 113664, 113665, 113666, 113667, 113668, 113669, 113670, 113671, 113672, 113673, 113674, 113675, 113676, 113677, 113678, 113679, 113680, 113681, 113682, 113683, 113684, 113685, 113686, 113687, 113688, 113689, 113690, 113691, 113692, 113693, 113694, 113695, 113696, 113697, 113698, 113699, 113700, 113701, 113702, 113703, 113704, 113705, 113706, 113707, 113708, 113709, 113710, 113711, 113712, 113713, 113714, 113715, 113716, 113717, 113718, 113719, 113720, 113721, 113722, 113723, 113724, 113725, 113726, 113727, 113728, 113729, 113730, 113731, 113732, 113733, 113734, 113735, 113736, 113737, 113738, 113739, 113740, 113741, 113742, 113743, 113744, 113745, 113746, 113747, 113748, 113749, 113750, 113751, 113752, 113753, 113754, 113755, 113756, 113757, 113758, 113759, 113760, 113761, 113762, 113763, 113764, 113765, 113766, 113767, 113768, 113769, 113770, 113776, 113777, 113778, 113779, 113780, 113781, 113782, 113783, 113784, 113785, 113786, 113787, 113788, 113792, 113793, 113794, 113795, 113796, 113797, 113798, 113799, 113800, 113808, 113809, 113810, 113811, 113812, 113813, 113814, 113815, 113816, 113817, 119808, 119809, 119810, 119811, 119812, 119813, 119814, 119815, 119816, 119817, 119818, 119819, 119820, 119821, 119822, 119823, 119824, 119825, 119826, 119827, 119828, 119829, 119830, 119831, 119832, 119833, 119834, 119835, 119836, 119837, 119838, 119839, 119840, 119841, 119842, 119843, 119844, 119845, 119846, 119847, 119848, 119849, 119850, 119851, 119852, 119853, 119854, 119855, 119856, 119857, 119858, 119859, 119860, 119861, 119862, 119863, 119864, 119865, 119866, 119867, 119868, 119869, 119870, 119871, 119872, 119873, 119874, 119875, 119876, 119877, 119878, 119879, 119880, 119881, 119882, 119883, 119884, 119885, 119886, 119887, 119888, 119889, 119890, 119891, 119892, 119894, 119895, 119896, 119897, 119898, 119899, 119900, 119901, 119902, 119903, 119904, 119905, 119906, 119907, 119908, 119909, 119910, 119911, 119912, 119913, 119914, 119915, 119916, 119917, 119918, 119919, 119920, 119921, 119922, 119923, 119924, 119925, 119926, 119927, 119928, 119929, 119930, 119931, 119932, 119933, 119934, 119935, 119936, 119937, 119938, 119939, 119940, 119941, 119942, 119943, 119944, 119945, 119946, 119947, 119948, 119949, 119950, 119951, 119952, 119953, 119954, 119955, 119956, 119957, 119958, 119959, 119960, 119961, 119962, 119963, 119964, 119966, 119967, 119970, 119973, 119974, 119977, 119978, 119979, 119980, 119982, 119983, 119984, 119985, 119986, 119987, 119988, 119989, 119990, 119991, 119992, 119993, 119995, 119997, 119998, 119999, 120000, 120001, 120002, 120003, 120005, 120006, 120007, 120008, 120009, 120010, 120011, 120012, 120013, 120014, 120015, 120016, 120017, 120018, 120019, 120020, 120021, 120022, 120023, 120024, 120025, 120026, 120027, 120028, 120029, 120030, 120031, 120032, 120033, 120034, 120035, 120036, 120037, 120038, 120039, 120040, 120041, 120042, 120043, 120044, 120045, 120046, 120047, 120048, 120049, 120050, 120051, 120052, 120053, 120054, 120055, 120056, 120057, 120058, 120059, 120060, 120061, 120062, 120063, 120064, 120065, 120066, 120067, 120068, 120069, 120071, 120072, 120073, 120074, 120077, 120078, 120079, 120080, 120081, 120082, 120083, 120084, 120086, 120087, 120088, 120089, 120090, 120091, 120092, 120094, 120095, 120096, 120097, 120098, 120099, 120100, 120101, 120102, 120103, 120104, 120105, 120106, 120107, 120108, 120109, 120110, 120111, 120112, 120113, 120114, 120115, 120116, 120117, 120118, 120119, 120120, 120121, 120123, 120124, 120125, 120126, 120128, 120129, 120130, 120131, 120132, 120134, 120138, 120139, 120140, 120141, 120142, 120143, 120144, 120146, 120147, 120148, 120149, 120150, 120151, 120152, 120153, 120154, 120155, 120156, 120157, 120158, 120159, 120160, 120161, 120162, 120163, 120164, 120165, 120166, 120167, 120168, 120169, 120170, 120171, 120172, 120173, 120174, 120175, 120176, 120177, 120178, 120179, 120180, 120181, 120182, 120183, 120184, 120185, 120186, 120187, 120188, 120189, 120190, 120191, 120192, 120193, 120194, 120195, 120196, 120197, 120198, 120199, 120200, 120201, 120202, 120203, 120204, 120205, 120206, 120207, 120208, 120209, 120210, 120211, 120212, 120213, 120214, 120215, 120216, 120217, 120218, 120219, 120220, 120221, 120222, 120223, 120224, 120225, 120226, 120227, 120228, 120229, 120230, 120231, 120232, 120233, 120234, 120235, 120236, 120237, 120238, 120239, 120240, 120241, 120242, 120243, 120244, 120245, 120246, 120247, 120248, 120249, 120250, 120251, 120252, 120253, 120254, 120255, 120256, 120257, 120258, 120259, 120260, 120261, 120262, 120263, 120264, 120265, 120266, 120267, 120268, 120269, 120270, 120271, 120272, 120273, 120274, 120275, 120276, 120277, 120278, 120279, 120280, 120281, 120282, 120283, 120284, 120285, 120286, 120287, 120288, 120289, 120290, 120291, 120292, 120293, 120294, 120295, 120296, 120297, 120298, 120299, 120300, 120301, 120302, 120303, 120304, 120305, 120306, 120307, 120308, 120309, 120310, 120311, 120312, 120313, 120314, 120315, 120316, 120317, 120318, 120319, 120320, 120321, 120322, 120323, 120324, 120325, 120326, 120327, 120328, 120329, 120330, 120331, 120332, 120333, 120334, 120335, 120336, 120337, 120338, 120339, 120340, 120341, 120342, 120343, 120344, 120345, 120346, 120347, 120348, 120349, 120350, 120351, 120352, 120353, 120354, 120355, 120356, 120357, 120358, 120359, 120360, 120361, 120362, 120363, 120364, 120365, 120366, 120367, 120368, 120369, 120370, 120371, 120372, 120373, 120374, 120375, 120376, 120377, 120378, 120379, 120380, 120381, 120382, 120383, 120384, 120385, 120386, 120387, 120388, 120389, 120390, 120391, 120392, 120393, 120394, 120395, 120396, 120397, 120398, 120399, 120400, 120401, 120402, 120403, 120404, 120405, 120406, 120407, 120408, 120409, 120410, 120411, 120412, 120413, 120414, 120415, 120416, 120417, 120418, 120419, 120420, 120421, 120422, 120423, 120424, 120425, 120426, 120427, 120428, 120429, 120430, 120431, 120432, 120433, 120434, 120435, 120436, 120437, 120438, 120439, 120440, 120441, 120442, 120443, 120444, 120445, 120446, 120447, 120448, 120449, 120450, 120451, 120452, 120453, 120454, 120455, 120456, 120457, 120458, 120459, 120460, 120461, 120462, 120463, 120464, 120465, 120466, 120467, 120468, 120469, 120470, 120471, 120472, 120473, 120474, 120475, 120476, 120477, 120478, 120479, 120480, 120481, 120482, 120483, 120484, 120485, 120488, 120489, 120490, 120491, 120492, 120493, 120494, 120495, 120496, 120497, 120498, 120499, 120500, 120501, 120502, 120503, 120504, 120505, 120506, 120507, 120508, 120509, 120510, 120511, 120512, 120514, 120515, 120516, 120517, 120518, 120519, 120520, 120521, 120522, 120523, 120524, 120525, 120526, 120527, 120528, 120529, 120530, 120531, 120532, 120533, 120534, 120535, 120536, 120537, 120538, 120540, 120541, 120542, 120543, 120544, 120545, 120546, 120547, 120548, 120549, 120550, 120551, 120552, 120553, 120554, 120555, 120556, 120557, 120558, 120559, 120560, 120561, 120562, 120563, 120564, 120565, 120566, 120567, 120568, 120569, 120570, 120572, 120573, 120574, 120575, 120576, 120577, 120578, 120579, 120580, 120581, 120582, 120583, 120584, 120585, 120586, 120587, 120588, 120589, 120590, 120591, 120592, 120593, 120594, 120595, 120596, 120598, 120599, 120600, 120601, 120602, 120603, 120604, 120605, 120606, 120607, 120608, 120609, 120610, 120611, 120612, 120613, 120614, 120615, 120616, 120617, 120618, 120619, 120620, 120621, 120622, 120623, 120624, 120625, 120626, 120627, 120628, 120630, 120631, 120632, 120633, 120634, 120635, 120636, 120637, 120638, 120639, 120640, 120641, 120642, 120643, 120644, 120645, 120646, 120647, 120648, 120649, 120650, 120651, 120652, 120653, 120654, 120656, 120657, 120658, 120659, 120660, 120661, 120662, 120663, 120664, 120665, 120666, 120667, 120668, 120669, 120670, 120671, 120672, 120673, 120674, 120675, 120676, 120677, 120678, 120679, 120680, 120681, 120682, 120683, 120684, 120685, 120686, 120688, 120689, 120690, 120691, 120692, 120693, 120694, 120695, 120696, 120697, 120698, 120699, 120700, 120701, 120702, 120703, 120704, 120705, 120706, 120707, 120708, 120709, 120710, 120711, 120712, 120714, 120715, 120716, 120717, 120718, 120719, 120720, 120721, 120722, 120723, 120724, 120725, 120726, 120727, 120728, 120729, 120730, 120731, 120732, 120733, 120734, 120735, 120736, 120737, 120738, 120739, 120740, 120741, 120742, 120743, 120744, 120746, 120747, 120748, 120749, 120750, 120751, 120752, 120753, 120754, 120755, 120756, 120757, 120758, 120759, 120760, 120761, 120762, 120763, 120764, 120765, 120766, 120767, 120768, 120769, 120770, 120772, 120773, 120774, 120775, 120776, 120777, 120778, 120779, 124928, 124929, 124930, 124931, 124932, 124933, 124934, 124935, 124936, 124937, 124938, 124939, 124940, 124941, 124942, 124943, 124944, 124945, 124946, 124947, 124948, 124949, 124950, 124951, 124952, 124953, 124954, 124955, 124956, 124957, 124958, 124959, 124960, 124961, 124962, 124963, 124964, 124965, 124966, 124967, 124968, 124969, 124970, 124971, 124972, 124973, 124974, 124975, 124976, 124977, 124978, 124979, 124980, 124981, 124982, 124983, 124984, 124985, 124986, 124987, 124988, 124989, 124990, 124991, 124992, 124993, 124994, 124995, 124996, 124997, 124998, 124999, 125000, 125001, 125002, 125003, 125004, 125005, 125006, 125007, 125008, 125009, 125010, 125011, 125012, 125013, 125014, 125015, 125016, 125017, 125018, 125019, 125020, 125021, 125022, 125023, 125024, 125025, 125026, 125027, 125028, 125029, 125030, 125031, 125032, 125033, 125034, 125035, 125036, 125037, 125038, 125039, 125040, 125041, 125042, 125043, 125044, 125045, 125046, 125047, 125048, 125049, 125050, 125051, 125052, 125053, 125054, 125055, 125056, 125057, 125058, 125059, 125060, 125061, 125062, 125063, 125064, 125065, 125066, 125067, 125068, 125069, 125070, 125071, 125072, 125073, 125074, 125075, 125076, 125077, 125078, 125079, 125080, 125081, 125082, 125083, 125084, 125085, 125086, 125087, 125088, 125089, 125090, 125091, 125092, 125093, 125094, 125095, 125096, 125097, 125098, 125099, 125100, 125101, 125102, 125103, 125104, 125105, 125106, 125107, 125108, 125109, 125110, 125111, 125112, 125113, 125114, 125115, 125116, 125117, 125118, 125119, 125120, 125121, 125122, 125123, 125124, 126464, 126465, 126466, 126467, 126469, 126470, 126471, 126472, 126473, 126474, 126475, 126476, 126477, 126478, 126479, 126480, 126481, 126482, 126483, 126484, 126485, 126486, 126487, 126488, 126489, 126490, 126491, 126492, 126493, 126494, 126495, 126497, 126498, 126500, 126503, 126505, 126506, 126507, 126508, 126509, 126510, 126511, 126512, 126513, 126514, 126516, 126517, 126518, 126519, 126521, 126523, 126530, 126535, 126537, 126539, 126541, 126542, 126543, 126545, 126546, 126548, 126551, 126553, 126555, 126557, 126559, 126561, 126562, 126564, 126567, 126568, 126569, 126570, 126572, 126573, 126574, 126575, 126576, 126577, 126578, 126580, 126581, 126582, 126583, 126585, 126586, 126587, 126588, 126590, 126592, 126593, 126594, 126595, 126596, 126597, 126598, 126599, 126600, 126601, 126603, 126604, 126605, 126606, 126607, 126608, 126609, 126610, 126611, 126612, 126613, 126614, 126615, 126616, 126617, 126618, 126619, 126625, 126626, 126627, 126629, 126630, 126631, 126632, 126633, 126635, 126636, 126637, 126638, 126639, 126640, 126641, 126642, 126643, 126644, 126645, 126646, 126647, 126648, 126649, 126650, 126651, 131072, 173782, 173824, 177972, 177984, 178205, 178208, 183969, 194560, 194561, 194562, 194563, 194564, 194565, 194566, 194567, 194568, 194569, 194570, 194571, 194572, 194573, 194574, 194575, 194576, 194577, 194578, 194579, 194580, 194581, 194582, 194583, 194584, 194585, 194586, 194587, 194588, 194589, 194590, 194591, 194592, 194593, 194594, 194595, 194596, 194597, 194598, 194599, 194600, 194601, 194602, 194603, 194604, 194605, 194606, 194607, 194608, 194609, 194610, 194611, 194612, 194613, 194614, 194615, 194616, 194617, 194618, 194619, 194620, 194621, 194622, 194623, 194624, 194625, 194626, 194627, 194628, 194629, 194630, 194631, 194632, 194633, 194634, 194635, 194636, 194637, 194638, 194639, 194640, 194641, 194642, 194643, 194644, 194645, 194646, 194647, 194648, 194649, 194650, 194651, 194652, 194653, 194654, 194655, 194656, 194657, 194658, 194659, 194660, 194661, 194662, 194663, 194664, 194665, 194666, 194667, 194668, 194669, 194670, 194671, 194672, 194673, 194674, 194675, 194676, 194677, 194678, 194679, 194680, 194681, 194682, 194683, 194684, 194685, 194686, 194687, 194688, 194689, 194690, 194691, 194692, 194693, 194694, 194695, 194696, 194697, 194698, 194699, 194700, 194701, 194702, 194703, 194704, 194705, 194706, 194707, 194708, 194709, 194710, 194711, 194712, 194713, 194714, 194715, 194716, 194717, 194718, 194719, 194720, 194721, 194722, 194723, 194724, 194725, 194726, 194727, 194728, 194729, 194730, 194731, 194732, 194733, 194734, 194735, 194736, 194737, 194738, 194739, 194740, 194741, 194742, 194743, 194744, 194745, 194746, 194747, 194748, 194749, 194750, 194751, 194752, 194753, 194754, 194755, 194756, 194757, 194758, 194759, 194760, 194761, 194762, 194763, 194764, 194765, 194766, 194767, 194768, 194769, 194770, 194771, 194772, 194773, 194774, 194775, 194776, 194777, 194778, 194779, 194780, 194781, 194782, 194783, 194784, 194785, 194786, 194787, 194788, 194789, 194790, 194791, 194792, 194793, 194794, 194795, 194796, 194797, 194798, 194799, 194800, 194801, 194802, 194803, 194804, 194805, 194806, 194807, 194808, 194809, 194810, 194811, 194812, 194813, 194814, 194815, 194816, 194817, 194818, 194819, 194820, 194821, 194822, 194823, 194824, 194825, 194826, 194827, 194828, 194829, 194830, 194831, 194832, 194833, 194834, 194835, 194836, 194837, 194838, 194839, 194840, 194841, 194842, 194843, 194844, 194845, 194846, 194847, 194848, 194849, 194850, 194851, 194852, 194853, 194854, 194855, 194856, 194857, 194858, 194859, 194860, 194861, 194862, 194863, 194864, 194865, 194866, 194867, 194868, 194869, 194870, 194871, 194872, 194873, 194874, 194875, 194876, 194877, 194878, 194879, 194880, 194881, 194882, 194883, 194884, 194885, 194886, 194887, 194888, 194889, 194890, 194891, 194892, 194893, 194894, 194895, 194896, 194897, 194898, 194899, 194900, 194901, 194902, 194903, 194904, 194905, 194906, 194907, 194908, 194909, 194910, 194911, 194912, 194913, 194914, 194915, 194916, 194917, 194918, 194919, 194920, 194921, 194922, 194923, 194924, 194925, 194926, 194927, 194928, 194929, 194930, 194931, 194932, 194933, 194934, 194935, 194936, 194937, 194938, 194939, 194940, 194941, 194942, 194943, 194944, 194945, 194946, 194947, 194948, 194949, 194950, 194951, 194952, 194953, 194954, 194955, 194956, 194957, 194958, 194959, 194960, 194961, 194962, 194963, 194964, 194965, 194966, 194967, 194968, 194969, 194970, 194971, 194972, 194973, 194974, 194975, 194976, 194977, 194978, 194979, 194980, 194981, 194982, 194983, 194984, 194985, 194986, 194987, 194988, 194989, 194990, 194991, 194992, 194993, 194994, 194995, 194996, 194997, 194998, 194999, 195000, 195001, 195002, 195003, 195004, 195005, 195006, 195007, 195008, 195009, 195010, 195011, 195012, 195013, 195014, 195015, 195016, 195017, 195018, 195019, 195020, 195021, 195022, 195023, 195024, 195025, 195026, 195027, 195028, 195029, 195030, 195031, 195032, 195033, 195034, 195035, 195036, 195037, 195038, 195039, 195040, 195041, 195042, 195043, 195044, 195045, 195046, 195047, 195048, 195049, 195050, 195051, 195052, 195053, 195054, 195055, 195056, 195057, 195058, 195059, 195060, 195061, 195062, 195063, 195064, 195065, 195066, 195067, 195068, 195069, 195070, 195071, 195072, 195073, 195074, 195075, 195076, 195077, 195078, 195079, 195080, 195081, 195082, 195083, 195084, 195085, 195086, 195087, 195088, 195089, 195090, 195091, 195092, 195093, 195094, 195095, 195096, 195097, 195098, 195099, 195100, 195101];
  var L = {
    L: L_1
  };

  /*
   * List of Unicode code that are flagged as number.
   *
   * Contains Unicode code of:
   * - Nd = Number, decimal digit
   * - Nl = Number, letter
   * - No = Number, other
   *
   * This list has been computed from http://unicode.org/Public/UNIDATA/UnicodeData.txt
   * curl -s http://unicode.org/Public/UNIDATA/UnicodeData.txt | grep -E ';Nd;|;Nl;|;No;' | cut -d \; -f 1 | xargs -I{} printf '%d, ' 0x{}
   *
   */
  var N_1 = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 178, 179, 185, 188, 189, 190, 1632, 1633, 1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641, 1776, 1777, 1778, 1779, 1780, 1781, 1782, 1783, 1784, 1785, 1984, 1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 2406, 2407, 2408, 2409, 2410, 2411, 2412, 2413, 2414, 2415, 2534, 2535, 2536, 2537, 2538, 2539, 2540, 2541, 2542, 2543, 2548, 2549, 2550, 2551, 2552, 2553, 2662, 2663, 2664, 2665, 2666, 2667, 2668, 2669, 2670, 2671, 2790, 2791, 2792, 2793, 2794, 2795, 2796, 2797, 2798, 2799, 2918, 2919, 2920, 2921, 2922, 2923, 2924, 2925, 2926, 2927, 2930, 2931, 2932, 2933, 2934, 2935, 3046, 3047, 3048, 3049, 3050, 3051, 3052, 3053, 3054, 3055, 3056, 3057, 3058, 3174, 3175, 3176, 3177, 3178, 3179, 3180, 3181, 3182, 3183, 3192, 3193, 3194, 3195, 3196, 3197, 3198, 3302, 3303, 3304, 3305, 3306, 3307, 3308, 3309, 3310, 3311, 3430, 3431, 3432, 3433, 3434, 3435, 3436, 3437, 3438, 3439, 3440, 3441, 3442, 3443, 3444, 3445, 3558, 3559, 3560, 3561, 3562, 3563, 3564, 3565, 3566, 3567, 3664, 3665, 3666, 3667, 3668, 3669, 3670, 3671, 3672, 3673, 3792, 3793, 3794, 3795, 3796, 3797, 3798, 3799, 3800, 3801, 3872, 3873, 3874, 3875, 3876, 3877, 3878, 3879, 3880, 3881, 3882, 3883, 3884, 3885, 3886, 3887, 3888, 3889, 3890, 3891, 4160, 4161, 4162, 4163, 4164, 4165, 4166, 4167, 4168, 4169, 4240, 4241, 4242, 4243, 4244, 4245, 4246, 4247, 4248, 4249, 4969, 4970, 4971, 4972, 4973, 4974, 4975, 4976, 4977, 4978, 4979, 4980, 4981, 4982, 4983, 4984, 4985, 4986, 4987, 4988, 5870, 5871, 5872, 6112, 6113, 6114, 6115, 6116, 6117, 6118, 6119, 6120, 6121, 6128, 6129, 6130, 6131, 6132, 6133, 6134, 6135, 6136, 6137, 6160, 6161, 6162, 6163, 6164, 6165, 6166, 6167, 6168, 6169, 6470, 6471, 6472, 6473, 6474, 6475, 6476, 6477, 6478, 6479, 6608, 6609, 6610, 6611, 6612, 6613, 6614, 6615, 6616, 6617, 6618, 6784, 6785, 6786, 6787, 6788, 6789, 6790, 6791, 6792, 6793, 6800, 6801, 6802, 6803, 6804, 6805, 6806, 6807, 6808, 6809, 6992, 6993, 6994, 6995, 6996, 6997, 6998, 6999, 7000, 7001, 7088, 7089, 7090, 7091, 7092, 7093, 7094, 7095, 7096, 7097, 7232, 7233, 7234, 7235, 7236, 7237, 7238, 7239, 7240, 7241, 7248, 7249, 7250, 7251, 7252, 7253, 7254, 7255, 7256, 7257, 8304, 8308, 8309, 8310, 8311, 8312, 8313, 8320, 8321, 8322, 8323, 8324, 8325, 8326, 8327, 8328, 8329, 8528, 8529, 8530, 8531, 8532, 8533, 8534, 8535, 8536, 8537, 8538, 8539, 8540, 8541, 8542, 8543, 8544, 8545, 8546, 8547, 8548, 8549, 8550, 8551, 8552, 8553, 8554, 8555, 8556, 8557, 8558, 8559, 8560, 8561, 8562, 8563, 8564, 8565, 8566, 8567, 8568, 8569, 8570, 8571, 8572, 8573, 8574, 8575, 8576, 8577, 8578, 8581, 8582, 8583, 8584, 8585, 9312, 9313, 9314, 9315, 9316, 9317, 9318, 9319, 9320, 9321, 9322, 9323, 9324, 9325, 9326, 9327, 9328, 9329, 9330, 9331, 9332, 9333, 9334, 9335, 9336, 9337, 9338, 9339, 9340, 9341, 9342, 9343, 9344, 9345, 9346, 9347, 9348, 9349, 9350, 9351, 9352, 9353, 9354, 9355, 9356, 9357, 9358, 9359, 9360, 9361, 9362, 9363, 9364, 9365, 9366, 9367, 9368, 9369, 9370, 9371, 9450, 9451, 9452, 9453, 9454, 9455, 9456, 9457, 9458, 9459, 9460, 9461, 9462, 9463, 9464, 9465, 9466, 9467, 9468, 9469, 9470, 9471, 10102, 10103, 10104, 10105, 10106, 10107, 10108, 10109, 10110, 10111, 10112, 10113, 10114, 10115, 10116, 10117, 10118, 10119, 10120, 10121, 10122, 10123, 10124, 10125, 10126, 10127, 10128, 10129, 10130, 10131, 11517, 12295, 12321, 12322, 12323, 12324, 12325, 12326, 12327, 12328, 12329, 12344, 12345, 12346, 12690, 12691, 12692, 12693, 12832, 12833, 12834, 12835, 12836, 12837, 12838, 12839, 12840, 12841, 12872, 12873, 12874, 12875, 12876, 12877, 12878, 12879, 12881, 12882, 12883, 12884, 12885, 12886, 12887, 12888, 12889, 12890, 12891, 12892, 12893, 12894, 12895, 12928, 12929, 12930, 12931, 12932, 12933, 12934, 12935, 12936, 12937, 12977, 12978, 12979, 12980, 12981, 12982, 12983, 12984, 12985, 12986, 12987, 12988, 12989, 12990, 12991, 42528, 42529, 42530, 42531, 42532, 42533, 42534, 42535, 42536, 42537, 42726, 42727, 42728, 42729, 42730, 42731, 42732, 42733, 42734, 42735, 43056, 43057, 43058, 43059, 43060, 43061, 43216, 43217, 43218, 43219, 43220, 43221, 43222, 43223, 43224, 43225, 43264, 43265, 43266, 43267, 43268, 43269, 43270, 43271, 43272, 43273, 43472, 43473, 43474, 43475, 43476, 43477, 43478, 43479, 43480, 43481, 43504, 43505, 43506, 43507, 43508, 43509, 43510, 43511, 43512, 43513, 43600, 43601, 43602, 43603, 43604, 43605, 43606, 43607, 43608, 43609, 44016, 44017, 44018, 44019, 44020, 44021, 44022, 44023, 44024, 44025, 65296, 65297, 65298, 65299, 65300, 65301, 65302, 65303, 65304, 65305, 65799, 65800, 65801, 65802, 65803, 65804, 65805, 65806, 65807, 65808, 65809, 65810, 65811, 65812, 65813, 65814, 65815, 65816, 65817, 65818, 65819, 65820, 65821, 65822, 65823, 65824, 65825, 65826, 65827, 65828, 65829, 65830, 65831, 65832, 65833, 65834, 65835, 65836, 65837, 65838, 65839, 65840, 65841, 65842, 65843, 65856, 65857, 65858, 65859, 65860, 65861, 65862, 65863, 65864, 65865, 65866, 65867, 65868, 65869, 65870, 65871, 65872, 65873, 65874, 65875, 65876, 65877, 65878, 65879, 65880, 65881, 65882, 65883, 65884, 65885, 65886, 65887, 65888, 65889, 65890, 65891, 65892, 65893, 65894, 65895, 65896, 65897, 65898, 65899, 65900, 65901, 65902, 65903, 65904, 65905, 65906, 65907, 65908, 65909, 65910, 65911, 65912, 65930, 65931, 66273, 66274, 66275, 66276, 66277, 66278, 66279, 66280, 66281, 66282, 66283, 66284, 66285, 66286, 66287, 66288, 66289, 66290, 66291, 66292, 66293, 66294, 66295, 66296, 66297, 66298, 66299, 66336, 66337, 66338, 66339, 66369, 66378, 66513, 66514, 66515, 66516, 66517, 66720, 66721, 66722, 66723, 66724, 66725, 66726, 66727, 66728, 66729, 67672, 67673, 67674, 67675, 67676, 67677, 67678, 67679, 67705, 67706, 67707, 67708, 67709, 67710, 67711, 67751, 67752, 67753, 67754, 67755, 67756, 67757, 67758, 67759, 67835, 67836, 67837, 67838, 67839, 67862, 67863, 67864, 67865, 67866, 67867, 68028, 68029, 68032, 68033, 68034, 68035, 68036, 68037, 68038, 68039, 68040, 68041, 68042, 68043, 68044, 68045, 68046, 68047, 68050, 68051, 68052, 68053, 68054, 68055, 68056, 68057, 68058, 68059, 68060, 68061, 68062, 68063, 68064, 68065, 68066, 68067, 68068, 68069, 68070, 68071, 68072, 68073, 68074, 68075, 68076, 68077, 68078, 68079, 68080, 68081, 68082, 68083, 68084, 68085, 68086, 68087, 68088, 68089, 68090, 68091, 68092, 68093, 68094, 68095, 68160, 68161, 68162, 68163, 68164, 68165, 68166, 68167, 68221, 68222, 68253, 68254, 68255, 68331, 68332, 68333, 68334, 68335, 68440, 68441, 68442, 68443, 68444, 68445, 68446, 68447, 68472, 68473, 68474, 68475, 68476, 68477, 68478, 68479, 68521, 68522, 68523, 68524, 68525, 68526, 68527, 68858, 68859, 68860, 68861, 68862, 68863, 69216, 69217, 69218, 69219, 69220, 69221, 69222, 69223, 69224, 69225, 69226, 69227, 69228, 69229, 69230, 69231, 69232, 69233, 69234, 69235, 69236, 69237, 69238, 69239, 69240, 69241, 69242, 69243, 69244, 69245, 69246, 69714, 69715, 69716, 69717, 69718, 69719, 69720, 69721, 69722, 69723, 69724, 69725, 69726, 69727, 69728, 69729, 69730, 69731, 69732, 69733, 69734, 69735, 69736, 69737, 69738, 69739, 69740, 69741, 69742, 69743, 69872, 69873, 69874, 69875, 69876, 69877, 69878, 69879, 69880, 69881, 69942, 69943, 69944, 69945, 69946, 69947, 69948, 69949, 69950, 69951, 70096, 70097, 70098, 70099, 70100, 70101, 70102, 70103, 70104, 70105, 70113, 70114, 70115, 70116, 70117, 70118, 70119, 70120, 70121, 70122, 70123, 70124, 70125, 70126, 70127, 70128, 70129, 70130, 70131, 70132, 70384, 70385, 70386, 70387, 70388, 70389, 70390, 70391, 70392, 70393, 70864, 70865, 70866, 70867, 70868, 70869, 70870, 70871, 70872, 70873, 71248, 71249, 71250, 71251, 71252, 71253, 71254, 71255, 71256, 71257, 71360, 71361, 71362, 71363, 71364, 71365, 71366, 71367, 71368, 71369, 71472, 71473, 71474, 71475, 71476, 71477, 71478, 71479, 71480, 71481, 71482, 71483, 71904, 71905, 71906, 71907, 71908, 71909, 71910, 71911, 71912, 71913, 71914, 71915, 71916, 71917, 71918, 71919, 71920, 71921, 71922, 74752, 74753, 74754, 74755, 74756, 74757, 74758, 74759, 74760, 74761, 74762, 74763, 74764, 74765, 74766, 74767, 74768, 74769, 74770, 74771, 74772, 74773, 74774, 74775, 74776, 74777, 74778, 74779, 74780, 74781, 74782, 74783, 74784, 74785, 74786, 74787, 74788, 74789, 74790, 74791, 74792, 74793, 74794, 74795, 74796, 74797, 74798, 74799, 74800, 74801, 74802, 74803, 74804, 74805, 74806, 74807, 74808, 74809, 74810, 74811, 74812, 74813, 74814, 74815, 74816, 74817, 74818, 74819, 74820, 74821, 74822, 74823, 74824, 74825, 74826, 74827, 74828, 74829, 74830, 74831, 74832, 74833, 74834, 74835, 74836, 74837, 74838, 74839, 74840, 74841, 74842, 74843, 74844, 74845, 74846, 74847, 74848, 74849, 74850, 74851, 74852, 74853, 74854, 74855, 74856, 74857, 74858, 74859, 74860, 74861, 74862, 92768, 92769, 92770, 92771, 92772, 92773, 92774, 92775, 92776, 92777, 93008, 93009, 93010, 93011, 93012, 93013, 93014, 93015, 93016, 93017, 93019, 93020, 93021, 93022, 93023, 93024, 93025, 119648, 119649, 119650, 119651, 119652, 119653, 119654, 119655, 119656, 119657, 119658, 119659, 119660, 119661, 119662, 119663, 119664, 119665, 120782, 120783, 120784, 120785, 120786, 120787, 120788, 120789, 120790, 120791, 120792, 120793, 120794, 120795, 120796, 120797, 120798, 120799, 120800, 120801, 120802, 120803, 120804, 120805, 120806, 120807, 120808, 120809, 120810, 120811, 120812, 120813, 120814, 120815, 120816, 120817, 120818, 120819, 120820, 120821, 120822, 120823, 120824, 120825, 120826, 120827, 120828, 120829, 120830, 120831, 125127, 125128, 125129, 125130, 125131, 125132, 125133, 125134, 125135, 127232, 127233, 127234, 127235, 127236, 127237, 127238, 127239, 127240, 127241, 127242, 127243, 127244];
  var N = {
    N: N_1
  };

  /*
   * List of Unicode code that are flagged as separator.
   *
   * Contains Unicode code of:
   * - Zs = Separator, space
   * - Zl = Separator, line
   * - Zp = Separator, paragraph
   *
   * This list has been computed from http://unicode.org/Public/UNIDATA/UnicodeData.txt
   * curl -s http://unicode.org/Public/UNIDATA/UnicodeData.txt | grep -E ';Zs;|;Zl;|;Zp;' | cut -d \; -f 1 | xargs -I{} printf '%d, ' 0x{}
   *
   */
  var Z_1 = [32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288];
  var Z$1 = {
    Z: Z_1
  };

  /*
   * List of Unicode code that are flagged as mark.
   *
   * Contains Unicode code of:
   * - Mc = Mark, spacing combining
   * - Me = Mark, enclosing
   * - Mn = Mark, nonspacing
   *
   * This list has been computed from http://unicode.org/Public/UNIDATA/UnicodeData.txt
   * curl -s http://unicode.org/Public/UNIDATA/UnicodeData.txt | grep -E ';Mc;|;Me;|;Mn;' | cut -d \; -f 1 | xargs -I{} printf '%d, ' 0x{}
   *
   */
  var M_1 = [768, 769, 770, 771, 772, 773, 774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 788, 789, 790, 791, 792, 793, 794, 795, 796, 797, 798, 799, 800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820, 821, 822, 823, 824, 825, 826, 827, 828, 829, 830, 831, 832, 833, 834, 835, 836, 837, 838, 839, 840, 841, 842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 853, 854, 855, 856, 857, 858, 859, 860, 861, 862, 863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878, 879, 1155, 1156, 1157, 1158, 1159, 1160, 1161, 1425, 1426, 1427, 1428, 1429, 1430, 1431, 1432, 1433, 1434, 1435, 1436, 1437, 1438, 1439, 1440, 1441, 1442, 1443, 1444, 1445, 1446, 1447, 1448, 1449, 1450, 1451, 1452, 1453, 1454, 1455, 1456, 1457, 1458, 1459, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1467, 1468, 1469, 1471, 1473, 1474, 1476, 1477, 1479, 1552, 1553, 1554, 1555, 1556, 1557, 1558, 1559, 1560, 1561, 1562, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1621, 1622, 1623, 1624, 1625, 1626, 1627, 1628, 1629, 1630, 1631, 1648, 1750, 1751, 1752, 1753, 1754, 1755, 1756, 1759, 1760, 1761, 1762, 1763, 1764, 1767, 1768, 1770, 1771, 1772, 1773, 1809, 1840, 1841, 1842, 1843, 1844, 1845, 1846, 1847, 1848, 1849, 1850, 1851, 1852, 1853, 1854, 1855, 1856, 1857, 1858, 1859, 1860, 1861, 1862, 1863, 1864, 1865, 1866, 1958, 1959, 1960, 1961, 1962, 1963, 1964, 1965, 1966, 1967, 1968, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2070, 2071, 2072, 2073, 2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2085, 2086, 2087, 2089, 2090, 2091, 2092, 2093, 2137, 2138, 2139, 2275, 2276, 2277, 2278, 2279, 2280, 2281, 2282, 2283, 2284, 2285, 2286, 2287, 2288, 2289, 2290, 2291, 2292, 2293, 2294, 2295, 2296, 2297, 2298, 2299, 2300, 2301, 2302, 2303, 2304, 2305, 2306, 2307, 2362, 2363, 2364, 2366, 2367, 2368, 2369, 2370, 2371, 2372, 2373, 2374, 2375, 2376, 2377, 2378, 2379, 2380, 2381, 2382, 2383, 2385, 2386, 2387, 2388, 2389, 2390, 2391, 2402, 2403, 2433, 2434, 2435, 2492, 2494, 2495, 2496, 2497, 2498, 2499, 2500, 2503, 2504, 2507, 2508, 2509, 2519, 2530, 2531, 2561, 2562, 2563, 2620, 2622, 2623, 2624, 2625, 2626, 2631, 2632, 2635, 2636, 2637, 2641, 2672, 2673, 2677, 2689, 2690, 2691, 2748, 2750, 2751, 2752, 2753, 2754, 2755, 2756, 2757, 2759, 2760, 2761, 2763, 2764, 2765, 2786, 2787, 2817, 2818, 2819, 2876, 2878, 2879, 2880, 2881, 2882, 2883, 2884, 2887, 2888, 2891, 2892, 2893, 2902, 2903, 2914, 2915, 2946, 3006, 3007, 3008, 3009, 3010, 3014, 3015, 3016, 3018, 3019, 3020, 3021, 3031, 3072, 3073, 3074, 3075, 3134, 3135, 3136, 3137, 3138, 3139, 3140, 3142, 3143, 3144, 3146, 3147, 3148, 3149, 3157, 3158, 3170, 3171, 3201, 3202, 3203, 3260, 3262, 3263, 3264, 3265, 3266, 3267, 3268, 3270, 3271, 3272, 3274, 3275, 3276, 3277, 3285, 3286, 3298, 3299, 3329, 3330, 3331, 3390, 3391, 3392, 3393, 3394, 3395, 3396, 3398, 3399, 3400, 3402, 3403, 3404, 3405, 3415, 3426, 3427, 3458, 3459, 3530, 3535, 3536, 3537, 3538, 3539, 3540, 3542, 3544, 3545, 3546, 3547, 3548, 3549, 3550, 3551, 3570, 3571, 3633, 3636, 3637, 3638, 3639, 3640, 3641, 3642, 3655, 3656, 3657, 3658, 3659, 3660, 3661, 3662, 3761, 3764, 3765, 3766, 3767, 3768, 3769, 3771, 3772, 3784, 3785, 3786, 3787, 3788, 3789, 3864, 3865, 3893, 3895, 3897, 3902, 3903, 3953, 3954, 3955, 3956, 3957, 3958, 3959, 3960, 3961, 3962, 3963, 3964, 3965, 3966, 3967, 3968, 3969, 3970, 3971, 3972, 3974, 3975, 3981, 3982, 3983, 3984, 3985, 3986, 3987, 3988, 3989, 3990, 3991, 3993, 3994, 3995, 3996, 3997, 3998, 3999, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 4016, 4017, 4018, 4019, 4020, 4021, 4022, 4023, 4024, 4025, 4026, 4027, 4028, 4038, 4139, 4140, 4141, 4142, 4143, 4144, 4145, 4146, 4147, 4148, 4149, 4150, 4151, 4152, 4153, 4154, 4155, 4156, 4157, 4158, 4182, 4183, 4184, 4185, 4190, 4191, 4192, 4194, 4195, 4196, 4199, 4200, 4201, 4202, 4203, 4204, 4205, 4209, 4210, 4211, 4212, 4226, 4227, 4228, 4229, 4230, 4231, 4232, 4233, 4234, 4235, 4236, 4237, 4239, 4250, 4251, 4252, 4253, 4957, 4958, 4959, 5906, 5907, 5908, 5938, 5939, 5940, 5970, 5971, 6002, 6003, 6068, 6069, 6070, 6071, 6072, 6073, 6074, 6075, 6076, 6077, 6078, 6079, 6080, 6081, 6082, 6083, 6084, 6085, 6086, 6087, 6088, 6089, 6090, 6091, 6092, 6093, 6094, 6095, 6096, 6097, 6098, 6099, 6109, 6155, 6156, 6157, 6313, 6432, 6433, 6434, 6435, 6436, 6437, 6438, 6439, 6440, 6441, 6442, 6443, 6448, 6449, 6450, 6451, 6452, 6453, 6454, 6455, 6456, 6457, 6458, 6459, 6679, 6680, 6681, 6682, 6683, 6741, 6742, 6743, 6744, 6745, 6746, 6747, 6748, 6749, 6750, 6752, 6753, 6754, 6755, 6756, 6757, 6758, 6759, 6760, 6761, 6762, 6763, 6764, 6765, 6766, 6767, 6768, 6769, 6770, 6771, 6772, 6773, 6774, 6775, 6776, 6777, 6778, 6779, 6780, 6783, 6832, 6833, 6834, 6835, 6836, 6837, 6838, 6839, 6840, 6841, 6842, 6843, 6844, 6845, 6846, 6912, 6913, 6914, 6915, 6916, 6964, 6965, 6966, 6967, 6968, 6969, 6970, 6971, 6972, 6973, 6974, 6975, 6976, 6977, 6978, 6979, 6980, 7019, 7020, 7021, 7022, 7023, 7024, 7025, 7026, 7027, 7040, 7041, 7042, 7073, 7074, 7075, 7076, 7077, 7078, 7079, 7080, 7081, 7082, 7083, 7084, 7085, 7142, 7143, 7144, 7145, 7146, 7147, 7148, 7149, 7150, 7151, 7152, 7153, 7154, 7155, 7204, 7205, 7206, 7207, 7208, 7209, 7210, 7211, 7212, 7213, 7214, 7215, 7216, 7217, 7218, 7219, 7220, 7221, 7222, 7223, 7376, 7377, 7378, 7380, 7381, 7382, 7383, 7384, 7385, 7386, 7387, 7388, 7389, 7390, 7391, 7392, 7393, 7394, 7395, 7396, 7397, 7398, 7399, 7400, 7405, 7410, 7411, 7412, 7416, 7417, 7616, 7617, 7618, 7619, 7620, 7621, 7622, 7623, 7624, 7625, 7626, 7627, 7628, 7629, 7630, 7631, 7632, 7633, 7634, 7635, 7636, 7637, 7638, 7639, 7640, 7641, 7642, 7643, 7644, 7645, 7646, 7647, 7648, 7649, 7650, 7651, 7652, 7653, 7654, 7655, 7656, 7657, 7658, 7659, 7660, 7661, 7662, 7663, 7664, 7665, 7666, 7667, 7668, 7669, 7676, 7677, 7678, 7679, 8400, 8401, 8402, 8403, 8404, 8405, 8406, 8407, 8408, 8409, 8410, 8411, 8412, 8413, 8414, 8415, 8416, 8417, 8418, 8419, 8420, 8421, 8422, 8423, 8424, 8425, 8426, 8427, 8428, 8429, 8430, 8431, 8432, 11503, 11504, 11505, 11647, 11744, 11745, 11746, 11747, 11748, 11749, 11750, 11751, 11752, 11753, 11754, 11755, 11756, 11757, 11758, 11759, 11760, 11761, 11762, 11763, 11764, 11765, 11766, 11767, 11768, 11769, 11770, 11771, 11772, 11773, 11774, 11775, 12330, 12331, 12332, 12333, 12334, 12335, 12441, 12442, 42607, 42608, 42609, 42610, 42612, 42613, 42614, 42615, 42616, 42617, 42618, 42619, 42620, 42621, 42654, 42655, 42736, 42737, 43010, 43014, 43019, 43043, 43044, 43045, 43046, 43047, 43136, 43137, 43188, 43189, 43190, 43191, 43192, 43193, 43194, 43195, 43196, 43197, 43198, 43199, 43200, 43201, 43202, 43203, 43204, 43232, 43233, 43234, 43235, 43236, 43237, 43238, 43239, 43240, 43241, 43242, 43243, 43244, 43245, 43246, 43247, 43248, 43249, 43302, 43303, 43304, 43305, 43306, 43307, 43308, 43309, 43335, 43336, 43337, 43338, 43339, 43340, 43341, 43342, 43343, 43344, 43345, 43346, 43347, 43392, 43393, 43394, 43395, 43443, 43444, 43445, 43446, 43447, 43448, 43449, 43450, 43451, 43452, 43453, 43454, 43455, 43456, 43493, 43561, 43562, 43563, 43564, 43565, 43566, 43567, 43568, 43569, 43570, 43571, 43572, 43573, 43574, 43587, 43596, 43597, 43643, 43644, 43645, 43696, 43698, 43699, 43700, 43703, 43704, 43710, 43711, 43713, 43755, 43756, 43757, 43758, 43759, 43765, 43766, 44003, 44004, 44005, 44006, 44007, 44008, 44009, 44010, 44012, 44013, 64286, 65024, 65025, 65026, 65027, 65028, 65029, 65030, 65031, 65032, 65033, 65034, 65035, 65036, 65037, 65038, 65039, 65056, 65057, 65058, 65059, 65060, 65061, 65062, 65063, 65064, 65065, 65066, 65067, 65068, 65069, 65070, 65071, 66045, 66272, 66422, 66423, 66424, 66425, 66426, 68097, 68098, 68099, 68101, 68102, 68108, 68109, 68110, 68111, 68152, 68153, 68154, 68159, 68325, 68326, 69632, 69633, 69634, 69688, 69689, 69690, 69691, 69692, 69693, 69694, 69695, 69696, 69697, 69698, 69699, 69700, 69701, 69702, 69759, 69760, 69761, 69762, 69808, 69809, 69810, 69811, 69812, 69813, 69814, 69815, 69816, 69817, 69818, 69888, 69889, 69890, 69927, 69928, 69929, 69930, 69931, 69932, 69933, 69934, 69935, 69936, 69937, 69938, 69939, 69940, 70003, 70016, 70017, 70018, 70067, 70068, 70069, 70070, 70071, 70072, 70073, 70074, 70075, 70076, 70077, 70078, 70079, 70080, 70090, 70091, 70092, 70188, 70189, 70190, 70191, 70192, 70193, 70194, 70195, 70196, 70197, 70198, 70199, 70367, 70368, 70369, 70370, 70371, 70372, 70373, 70374, 70375, 70376, 70377, 70378, 70400, 70401, 70402, 70403, 70460, 70462, 70463, 70464, 70465, 70466, 70467, 70468, 70471, 70472, 70475, 70476, 70477, 70487, 70498, 70499, 70502, 70503, 70504, 70505, 70506, 70507, 70508, 70512, 70513, 70514, 70515, 70516, 70832, 70833, 70834, 70835, 70836, 70837, 70838, 70839, 70840, 70841, 70842, 70843, 70844, 70845, 70846, 70847, 70848, 70849, 70850, 70851, 71087, 71088, 71089, 71090, 71091, 71092, 71093, 71096, 71097, 71098, 71099, 71100, 71101, 71102, 71103, 71104, 71132, 71133, 71216, 71217, 71218, 71219, 71220, 71221, 71222, 71223, 71224, 71225, 71226, 71227, 71228, 71229, 71230, 71231, 71232, 71339, 71340, 71341, 71342, 71343, 71344, 71345, 71346, 71347, 71348, 71349, 71350, 71351, 71453, 71454, 71455, 71456, 71457, 71458, 71459, 71460, 71461, 71462, 71463, 71464, 71465, 71466, 71467, 92912, 92913, 92914, 92915, 92916, 92976, 92977, 92978, 92979, 92980, 92981, 92982, 94033, 94034, 94035, 94036, 94037, 94038, 94039, 94040, 94041, 94042, 94043, 94044, 94045, 94046, 94047, 94048, 94049, 94050, 94051, 94052, 94053, 94054, 94055, 94056, 94057, 94058, 94059, 94060, 94061, 94062, 94063, 94064, 94065, 94066, 94067, 94068, 94069, 94070, 94071, 94072, 94073, 94074, 94075, 94076, 94077, 94078, 94095, 94096, 94097, 94098, 113821, 113822, 119141, 119142, 119143, 119144, 119145, 119149, 119150, 119151, 119152, 119153, 119154, 119163, 119164, 119165, 119166, 119167, 119168, 119169, 119170, 119173, 119174, 119175, 119176, 119177, 119178, 119179, 119210, 119211, 119212, 119213, 119362, 119363, 119364, 121344, 121345, 121346, 121347, 121348, 121349, 121350, 121351, 121352, 121353, 121354, 121355, 121356, 121357, 121358, 121359, 121360, 121361, 121362, 121363, 121364, 121365, 121366, 121367, 121368, 121369, 121370, 121371, 121372, 121373, 121374, 121375, 121376, 121377, 121378, 121379, 121380, 121381, 121382, 121383, 121384, 121385, 121386, 121387, 121388, 121389, 121390, 121391, 121392, 121393, 121394, 121395, 121396, 121397, 121398, 121403, 121404, 121405, 121406, 121407, 121408, 121409, 121410, 121411, 121412, 121413, 121414, 121415, 121416, 121417, 121418, 121419, 121420, 121421, 121422, 121423, 121424, 121425, 121426, 121427, 121428, 121429, 121430, 121431, 121432, 121433, 121434, 121435, 121436, 121437, 121438, 121439, 121440, 121441, 121442, 121443, 121444, 121445, 121446, 121447, 121448, 121449, 121450, 121451, 121452, 121461, 121476, 121499, 121500, 121501, 121502, 121503, 121505, 121506, 121507, 121508, 121509, 121510, 121511, 121512, 121513, 121514, 121515, 121516, 121517, 121518, 121519, 125136, 125137, 125138, 125139, 125140, 125141, 125142, 917760, 917761, 917762, 917763, 917764, 917765, 917766, 917767, 917768, 917769, 917770, 917771, 917772, 917773, 917774, 917775, 917776, 917777, 917778, 917779, 917780, 917781, 917782, 917783, 917784, 917785, 917786, 917787, 917788, 917789, 917790, 917791, 917792, 917793, 917794, 917795, 917796, 917797, 917798, 917799, 917800, 917801, 917802, 917803, 917804, 917805, 917806, 917807, 917808, 917809, 917810, 917811, 917812, 917813, 917814, 917815, 917816, 917817, 917818, 917819, 917820, 917821, 917822, 917823, 917824, 917825, 917826, 917827, 917828, 917829, 917830, 917831, 917832, 917833, 917834, 917835, 917836, 917837, 917838, 917839, 917840, 917841, 917842, 917843, 917844, 917845, 917846, 917847, 917848, 917849, 917850, 917851, 917852, 917853, 917854, 917855, 917856, 917857, 917858, 917859, 917860, 917861, 917862, 917863, 917864, 917865, 917866, 917867, 917868, 917869, 917870, 917871, 917872, 917873, 917874, 917875, 917876, 917877, 917878, 917879, 917880, 917881, 917882, 917883, 917884, 917885, 917886, 917887, 917888, 917889, 917890, 917891, 917892, 917893, 917894, 917895, 917896, 917897, 917898, 917899, 917900, 917901, 917902, 917903, 917904, 917905, 917906, 917907, 917908, 917909, 917910, 917911, 917912, 917913, 917914, 917915, 917916, 917917, 917918, 917919, 917920, 917921, 917922, 917923, 917924, 917925, 917926, 917927, 917928, 917929, 917930, 917931, 917932, 917933, 917934, 917935, 917936, 917937, 917938, 917939, 917940, 917941, 917942, 917943, 917944, 917945, 917946, 917947, 917948, 917949, 917950, 917951, 917952, 917953, 917954, 917955, 917956, 917957, 917958, 917959, 917960, 917961, 917962, 917963, 917964, 917965, 917966, 917967, 917968, 917969, 917970, 917971, 917972, 917973, 917974, 917975, 917976, 917977, 917978, 917979, 917980, 917981, 917982, 917983, 917984, 917985, 917986, 917987, 917988, 917989, 917990, 917991, 917992, 917993, 917994, 917995, 917996, 917997, 917998, 917999];
  var M = {
    M: M_1
  };

  var unorm = createCommonjsModule$1(function (module) {
    (function (root) {
      /***** unorm.js *****/

      /*
       * UnicodeNormalizer 1.0.0
       * Copyright (c) 2008 Matsuza
       * Dual licensed under the MIT (MIT-LICENSE.txt) and GPL (GPL-LICENSE.txt) licenses.
       * $Date: 2008-06-05 16:44:17 +0200 (Thu, 05 Jun 2008) $
       * $Rev: 13309 $
       */

      var DEFAULT_FEATURE = [null, 0, {}];
      var CACHE_THRESHOLD = 10;
      var SBase = 0xAC00,
          LBase = 0x1100,
          VBase = 0x1161,
          TBase = 0x11A7,
          LCount = 19,
          VCount = 21,
          TCount = 28;
      var NCount = VCount * TCount; // 588

      var SCount = LCount * NCount; // 11172

      var UChar = function UChar(cp, feature) {
        this.codepoint = cp;
        this.feature = feature;
      }; // Strategies


      var cache = {};
      var cacheCounter = [];

      for (var i = 0; i <= 0xFF; ++i) {
        cacheCounter[i] = 0;
      }

      function fromCache(next, cp, needFeature) {
        var ret = cache[cp];

        if (!ret) {
          ret = next(cp, needFeature);

          if (!!ret.feature && ++cacheCounter[cp >> 8 & 0xFF] > CACHE_THRESHOLD) {
            cache[cp] = ret;
          }
        }

        return ret;
      }

      function fromData(next, cp, needFeature) {
        var hash = cp & 0xFF00;
        var dunit = UChar.udata[hash] || {};
        var f = dunit[cp];
        return f ? new UChar(cp, f) : new UChar(cp, DEFAULT_FEATURE);
      }

      function fromCpOnly(next, cp, needFeature) {
        return !!needFeature ? next(cp, needFeature) : new UChar(cp, null);
      }

      function fromRuleBasedJamo(next, cp, needFeature) {
        var j;

        if (cp < LBase || LBase + LCount <= cp && cp < SBase || SBase + SCount < cp) {
          return next(cp, needFeature);
        }

        if (LBase <= cp && cp < LBase + LCount) {
          var c = {};
          var base = (cp - LBase) * VCount;

          for (j = 0; j < VCount; ++j) {
            c[VBase + j] = SBase + TCount * (j + base);
          }

          return new UChar(cp, [,, c]);
        }

        var SIndex = cp - SBase;
        var TIndex = SIndex % TCount;
        var feature = [];

        if (TIndex !== 0) {
          feature[0] = [SBase + SIndex - TIndex, TBase + TIndex];
        } else {
          feature[0] = [LBase + Math.floor(SIndex / NCount), VBase + Math.floor(SIndex % NCount / TCount)];
          feature[2] = {};

          for (j = 1; j < TCount; ++j) {
            feature[2][TBase + j] = cp + j;
          }
        }

        return new UChar(cp, feature);
      }

      function fromCpFilter(next, cp, needFeature) {
        return cp < 60 || 13311 < cp && cp < 42607 ? new UChar(cp, DEFAULT_FEATURE) : next(cp, needFeature);
      }

      var strategies = [fromCpFilter, fromCache, fromCpOnly, fromRuleBasedJamo, fromData];
      UChar.fromCharCode = strategies.reduceRight(function (next, strategy) {
        return function (cp, needFeature) {
          return strategy(next, cp, needFeature);
        };
      }, null);

      UChar.isHighSurrogate = function (cp) {
        return cp >= 0xD800 && cp <= 0xDBFF;
      };

      UChar.isLowSurrogate = function (cp) {
        return cp >= 0xDC00 && cp <= 0xDFFF;
      };

      UChar.prototype.prepFeature = function () {
        if (!this.feature) {
          this.feature = UChar.fromCharCode(this.codepoint, true).feature;
        }
      };

      UChar.prototype.toString = function () {
        if (this.codepoint < 0x10000) {
          return String.fromCharCode(this.codepoint);
        } else {
          var x = this.codepoint - 0x10000;
          return String.fromCharCode(Math.floor(x / 0x400) + 0xD800, x % 0x400 + 0xDC00);
        }
      };

      UChar.prototype.getDecomp = function () {
        this.prepFeature();
        return this.feature[0] || null;
      };

      UChar.prototype.isCompatibility = function () {
        this.prepFeature();
        return !!this.feature[1] && this.feature[1] & 1 << 8;
      };

      UChar.prototype.isExclude = function () {
        this.prepFeature();
        return !!this.feature[1] && this.feature[1] & 1 << 9;
      };

      UChar.prototype.getCanonicalClass = function () {
        this.prepFeature();
        return !!this.feature[1] ? this.feature[1] & 0xff : 0;
      };

      UChar.prototype.getComposite = function (following) {
        this.prepFeature();

        if (!this.feature[2]) {
          return null;
        }

        var cp = this.feature[2][following.codepoint];
        return cp ? UChar.fromCharCode(cp) : null;
      };

      var UCharIterator = function UCharIterator(str) {
        this.str = str;
        this.cursor = 0;
      };

      UCharIterator.prototype.next = function () {
        if (!!this.str && this.cursor < this.str.length) {
          var cp = this.str.charCodeAt(this.cursor++);
          var d;

          if (UChar.isHighSurrogate(cp) && this.cursor < this.str.length && UChar.isLowSurrogate(d = this.str.charCodeAt(this.cursor))) {
            cp = (cp - 0xD800) * 0x400 + (d - 0xDC00) + 0x10000;
            ++this.cursor;
          }

          return UChar.fromCharCode(cp);
        } else {
          this.str = null;
          return null;
        }
      };

      var RecursDecompIterator = function RecursDecompIterator(it, cano) {
        this.it = it;
        this.canonical = cano;
        this.resBuf = [];
      };

      RecursDecompIterator.prototype.next = function () {
        function recursiveDecomp(cano, uchar) {
          var decomp = uchar.getDecomp();

          if (!!decomp && !(cano && uchar.isCompatibility())) {
            var ret = [];

            for (var i = 0; i < decomp.length; ++i) {
              var a = recursiveDecomp(cano, UChar.fromCharCode(decomp[i]));
              ret = ret.concat(a);
            }

            return ret;
          } else {
            return [uchar];
          }
        }

        if (this.resBuf.length === 0) {
          var uchar = this.it.next();

          if (!uchar) {
            return null;
          }

          this.resBuf = recursiveDecomp(this.canonical, uchar);
        }

        return this.resBuf.shift();
      };

      var DecompIterator = function DecompIterator(it) {
        this.it = it;
        this.resBuf = [];
      };

      DecompIterator.prototype.next = function () {
        var cc;

        if (this.resBuf.length === 0) {
          do {
            var uchar = this.it.next();

            if (!uchar) {
              break;
            }

            cc = uchar.getCanonicalClass();
            var inspt = this.resBuf.length;

            if (cc !== 0) {
              for (; inspt > 0; --inspt) {
                var uchar2 = this.resBuf[inspt - 1];
                var cc2 = uchar2.getCanonicalClass();

                if (cc2 <= cc) {
                  break;
                }
              }
            }

            this.resBuf.splice(inspt, 0, uchar);
          } while (cc !== 0);
        }

        return this.resBuf.shift();
      };

      var CompIterator = function CompIterator(it) {
        this.it = it;
        this.procBuf = [];
        this.resBuf = [];
        this.lastClass = null;
      };

      CompIterator.prototype.next = function () {
        while (this.resBuf.length === 0) {
          var uchar = this.it.next();

          if (!uchar) {
            this.resBuf = this.procBuf;
            this.procBuf = [];
            break;
          }

          if (this.procBuf.length === 0) {
            this.lastClass = uchar.getCanonicalClass();
            this.procBuf.push(uchar);
          } else {
            var starter = this.procBuf[0];
            var composite = starter.getComposite(uchar);
            var cc = uchar.getCanonicalClass();

            if (!!composite && (this.lastClass < cc || this.lastClass === 0)) {
              this.procBuf[0] = composite;
            } else {
              if (cc === 0) {
                this.resBuf = this.procBuf;
                this.procBuf = [];
              }

              this.lastClass = cc;
              this.procBuf.push(uchar);
            }
          }
        }

        return this.resBuf.shift();
      };

      var createIterator = function createIterator(mode, str) {
        switch (mode) {
          case "NFD":
            return new DecompIterator(new RecursDecompIterator(new UCharIterator(str), true));

          case "NFKD":
            return new DecompIterator(new RecursDecompIterator(new UCharIterator(str), false));

          case "NFC":
            return new CompIterator(new DecompIterator(new RecursDecompIterator(new UCharIterator(str), true)));

          case "NFKC":
            return new CompIterator(new DecompIterator(new RecursDecompIterator(new UCharIterator(str), false)));
        }

        throw mode + " is invalid";
      };

      var normalize = function normalize(mode, str) {
        var it = createIterator(mode, str);
        var ret = "";
        var uchar;

        while (!!(uchar = it.next())) {
          ret += uchar.toString();
        }

        return ret;
      };
      /* API functions */


      function nfd(str) {
        return normalize("NFD", str);
      }

      function nfkd(str) {
        return normalize("NFKD", str);
      }

      function nfc(str) {
        return normalize("NFC", str);
      }

      function nfkc(str) {
        return normalize("NFKC", str);
      }
      /* Unicode data */


      UChar.udata = {
        0: {
          60: [,, {
            824: 8814
          }],
          61: [,, {
            824: 8800
          }],
          62: [,, {
            824: 8815
          }],
          65: [,, {
            768: 192,
            769: 193,
            770: 194,
            771: 195,
            772: 256,
            774: 258,
            775: 550,
            776: 196,
            777: 7842,
            778: 197,
            780: 461,
            783: 512,
            785: 514,
            803: 7840,
            805: 7680,
            808: 260
          }],
          66: [,, {
            775: 7682,
            803: 7684,
            817: 7686
          }],
          67: [,, {
            769: 262,
            770: 264,
            775: 266,
            780: 268,
            807: 199
          }],
          68: [,, {
            775: 7690,
            780: 270,
            803: 7692,
            807: 7696,
            813: 7698,
            817: 7694
          }],
          69: [,, {
            768: 200,
            769: 201,
            770: 202,
            771: 7868,
            772: 274,
            774: 276,
            775: 278,
            776: 203,
            777: 7866,
            780: 282,
            783: 516,
            785: 518,
            803: 7864,
            807: 552,
            808: 280,
            813: 7704,
            816: 7706
          }],
          70: [,, {
            775: 7710
          }],
          71: [,, {
            769: 500,
            770: 284,
            772: 7712,
            774: 286,
            775: 288,
            780: 486,
            807: 290
          }],
          72: [,, {
            770: 292,
            775: 7714,
            776: 7718,
            780: 542,
            803: 7716,
            807: 7720,
            814: 7722
          }],
          73: [,, {
            768: 204,
            769: 205,
            770: 206,
            771: 296,
            772: 298,
            774: 300,
            775: 304,
            776: 207,
            777: 7880,
            780: 463,
            783: 520,
            785: 522,
            803: 7882,
            808: 302,
            816: 7724
          }],
          74: [,, {
            770: 308
          }],
          75: [,, {
            769: 7728,
            780: 488,
            803: 7730,
            807: 310,
            817: 7732
          }],
          76: [,, {
            769: 313,
            780: 317,
            803: 7734,
            807: 315,
            813: 7740,
            817: 7738
          }],
          77: [,, {
            769: 7742,
            775: 7744,
            803: 7746
          }],
          78: [,, {
            768: 504,
            769: 323,
            771: 209,
            775: 7748,
            780: 327,
            803: 7750,
            807: 325,
            813: 7754,
            817: 7752
          }],
          79: [,, {
            768: 210,
            769: 211,
            770: 212,
            771: 213,
            772: 332,
            774: 334,
            775: 558,
            776: 214,
            777: 7886,
            779: 336,
            780: 465,
            783: 524,
            785: 526,
            795: 416,
            803: 7884,
            808: 490
          }],
          80: [,, {
            769: 7764,
            775: 7766
          }],
          82: [,, {
            769: 340,
            775: 7768,
            780: 344,
            783: 528,
            785: 530,
            803: 7770,
            807: 342,
            817: 7774
          }],
          83: [,, {
            769: 346,
            770: 348,
            775: 7776,
            780: 352,
            803: 7778,
            806: 536,
            807: 350
          }],
          84: [,, {
            775: 7786,
            780: 356,
            803: 7788,
            806: 538,
            807: 354,
            813: 7792,
            817: 7790
          }],
          85: [,, {
            768: 217,
            769: 218,
            770: 219,
            771: 360,
            772: 362,
            774: 364,
            776: 220,
            777: 7910,
            778: 366,
            779: 368,
            780: 467,
            783: 532,
            785: 534,
            795: 431,
            803: 7908,
            804: 7794,
            808: 370,
            813: 7798,
            816: 7796
          }],
          86: [,, {
            771: 7804,
            803: 7806
          }],
          87: [,, {
            768: 7808,
            769: 7810,
            770: 372,
            775: 7814,
            776: 7812,
            803: 7816
          }],
          88: [,, {
            775: 7818,
            776: 7820
          }],
          89: [,, {
            768: 7922,
            769: 221,
            770: 374,
            771: 7928,
            772: 562,
            775: 7822,
            776: 376,
            777: 7926,
            803: 7924
          }],
          90: [,, {
            769: 377,
            770: 7824,
            775: 379,
            780: 381,
            803: 7826,
            817: 7828
          }],
          97: [,, {
            768: 224,
            769: 225,
            770: 226,
            771: 227,
            772: 257,
            774: 259,
            775: 551,
            776: 228,
            777: 7843,
            778: 229,
            780: 462,
            783: 513,
            785: 515,
            803: 7841,
            805: 7681,
            808: 261
          }],
          98: [,, {
            775: 7683,
            803: 7685,
            817: 7687
          }],
          99: [,, {
            769: 263,
            770: 265,
            775: 267,
            780: 269,
            807: 231
          }],
          100: [,, {
            775: 7691,
            780: 271,
            803: 7693,
            807: 7697,
            813: 7699,
            817: 7695
          }],
          101: [,, {
            768: 232,
            769: 233,
            770: 234,
            771: 7869,
            772: 275,
            774: 277,
            775: 279,
            776: 235,
            777: 7867,
            780: 283,
            783: 517,
            785: 519,
            803: 7865,
            807: 553,
            808: 281,
            813: 7705,
            816: 7707
          }],
          102: [,, {
            775: 7711
          }],
          103: [,, {
            769: 501,
            770: 285,
            772: 7713,
            774: 287,
            775: 289,
            780: 487,
            807: 291
          }],
          104: [,, {
            770: 293,
            775: 7715,
            776: 7719,
            780: 543,
            803: 7717,
            807: 7721,
            814: 7723,
            817: 7830
          }],
          105: [,, {
            768: 236,
            769: 237,
            770: 238,
            771: 297,
            772: 299,
            774: 301,
            776: 239,
            777: 7881,
            780: 464,
            783: 521,
            785: 523,
            803: 7883,
            808: 303,
            816: 7725
          }],
          106: [,, {
            770: 309,
            780: 496
          }],
          107: [,, {
            769: 7729,
            780: 489,
            803: 7731,
            807: 311,
            817: 7733
          }],
          108: [,, {
            769: 314,
            780: 318,
            803: 7735,
            807: 316,
            813: 7741,
            817: 7739
          }],
          109: [,, {
            769: 7743,
            775: 7745,
            803: 7747
          }],
          110: [,, {
            768: 505,
            769: 324,
            771: 241,
            775: 7749,
            780: 328,
            803: 7751,
            807: 326,
            813: 7755,
            817: 7753
          }],
          111: [,, {
            768: 242,
            769: 243,
            770: 244,
            771: 245,
            772: 333,
            774: 335,
            775: 559,
            776: 246,
            777: 7887,
            779: 337,
            780: 466,
            783: 525,
            785: 527,
            795: 417,
            803: 7885,
            808: 491
          }],
          112: [,, {
            769: 7765,
            775: 7767
          }],
          114: [,, {
            769: 341,
            775: 7769,
            780: 345,
            783: 529,
            785: 531,
            803: 7771,
            807: 343,
            817: 7775
          }],
          115: [,, {
            769: 347,
            770: 349,
            775: 7777,
            780: 353,
            803: 7779,
            806: 537,
            807: 351
          }],
          116: [,, {
            775: 7787,
            776: 7831,
            780: 357,
            803: 7789,
            806: 539,
            807: 355,
            813: 7793,
            817: 7791
          }],
          117: [,, {
            768: 249,
            769: 250,
            770: 251,
            771: 361,
            772: 363,
            774: 365,
            776: 252,
            777: 7911,
            778: 367,
            779: 369,
            780: 468,
            783: 533,
            785: 535,
            795: 432,
            803: 7909,
            804: 7795,
            808: 371,
            813: 7799,
            816: 7797
          }],
          118: [,, {
            771: 7805,
            803: 7807
          }],
          119: [,, {
            768: 7809,
            769: 7811,
            770: 373,
            775: 7815,
            776: 7813,
            778: 7832,
            803: 7817
          }],
          120: [,, {
            775: 7819,
            776: 7821
          }],
          121: [,, {
            768: 7923,
            769: 253,
            770: 375,
            771: 7929,
            772: 563,
            775: 7823,
            776: 255,
            777: 7927,
            778: 7833,
            803: 7925
          }],
          122: [,, {
            769: 378,
            770: 7825,
            775: 380,
            780: 382,
            803: 7827,
            817: 7829
          }],
          160: [[32], 256],
          168: [[32, 776], 256, {
            768: 8173,
            769: 901,
            834: 8129
          }],
          170: [[97], 256],
          175: [[32, 772], 256],
          178: [[50], 256],
          179: [[51], 256],
          180: [[32, 769], 256],
          181: [[956], 256],
          184: [[32, 807], 256],
          185: [[49], 256],
          186: [[111], 256],
          188: [[49, 8260, 52], 256],
          189: [[49, 8260, 50], 256],
          190: [[51, 8260, 52], 256],
          192: [[65, 768]],
          193: [[65, 769]],
          194: [[65, 770],, {
            768: 7846,
            769: 7844,
            771: 7850,
            777: 7848
          }],
          195: [[65, 771]],
          196: [[65, 776],, {
            772: 478
          }],
          197: [[65, 778],, {
            769: 506
          }],
          198: [,, {
            769: 508,
            772: 482
          }],
          199: [[67, 807],, {
            769: 7688
          }],
          200: [[69, 768]],
          201: [[69, 769]],
          202: [[69, 770],, {
            768: 7872,
            769: 7870,
            771: 7876,
            777: 7874
          }],
          203: [[69, 776]],
          204: [[73, 768]],
          205: [[73, 769]],
          206: [[73, 770]],
          207: [[73, 776],, {
            769: 7726
          }],
          209: [[78, 771]],
          210: [[79, 768]],
          211: [[79, 769]],
          212: [[79, 770],, {
            768: 7890,
            769: 7888,
            771: 7894,
            777: 7892
          }],
          213: [[79, 771],, {
            769: 7756,
            772: 556,
            776: 7758
          }],
          214: [[79, 776],, {
            772: 554
          }],
          216: [,, {
            769: 510
          }],
          217: [[85, 768]],
          218: [[85, 769]],
          219: [[85, 770]],
          220: [[85, 776],, {
            768: 475,
            769: 471,
            772: 469,
            780: 473
          }],
          221: [[89, 769]],
          224: [[97, 768]],
          225: [[97, 769]],
          226: [[97, 770],, {
            768: 7847,
            769: 7845,
            771: 7851,
            777: 7849
          }],
          227: [[97, 771]],
          228: [[97, 776],, {
            772: 479
          }],
          229: [[97, 778],, {
            769: 507
          }],
          230: [,, {
            769: 509,
            772: 483
          }],
          231: [[99, 807],, {
            769: 7689
          }],
          232: [[101, 768]],
          233: [[101, 769]],
          234: [[101, 770],, {
            768: 7873,
            769: 7871,
            771: 7877,
            777: 7875
          }],
          235: [[101, 776]],
          236: [[105, 768]],
          237: [[105, 769]],
          238: [[105, 770]],
          239: [[105, 776],, {
            769: 7727
          }],
          241: [[110, 771]],
          242: [[111, 768]],
          243: [[111, 769]],
          244: [[111, 770],, {
            768: 7891,
            769: 7889,
            771: 7895,
            777: 7893
          }],
          245: [[111, 771],, {
            769: 7757,
            772: 557,
            776: 7759
          }],
          246: [[111, 776],, {
            772: 555
          }],
          248: [,, {
            769: 511
          }],
          249: [[117, 768]],
          250: [[117, 769]],
          251: [[117, 770]],
          252: [[117, 776],, {
            768: 476,
            769: 472,
            772: 470,
            780: 474
          }],
          253: [[121, 769]],
          255: [[121, 776]]
        },
        256: {
          256: [[65, 772]],
          257: [[97, 772]],
          258: [[65, 774],, {
            768: 7856,
            769: 7854,
            771: 7860,
            777: 7858
          }],
          259: [[97, 774],, {
            768: 7857,
            769: 7855,
            771: 7861,
            777: 7859
          }],
          260: [[65, 808]],
          261: [[97, 808]],
          262: [[67, 769]],
          263: [[99, 769]],
          264: [[67, 770]],
          265: [[99, 770]],
          266: [[67, 775]],
          267: [[99, 775]],
          268: [[67, 780]],
          269: [[99, 780]],
          270: [[68, 780]],
          271: [[100, 780]],
          274: [[69, 772],, {
            768: 7700,
            769: 7702
          }],
          275: [[101, 772],, {
            768: 7701,
            769: 7703
          }],
          276: [[69, 774]],
          277: [[101, 774]],
          278: [[69, 775]],
          279: [[101, 775]],
          280: [[69, 808]],
          281: [[101, 808]],
          282: [[69, 780]],
          283: [[101, 780]],
          284: [[71, 770]],
          285: [[103, 770]],
          286: [[71, 774]],
          287: [[103, 774]],
          288: [[71, 775]],
          289: [[103, 775]],
          290: [[71, 807]],
          291: [[103, 807]],
          292: [[72, 770]],
          293: [[104, 770]],
          296: [[73, 771]],
          297: [[105, 771]],
          298: [[73, 772]],
          299: [[105, 772]],
          300: [[73, 774]],
          301: [[105, 774]],
          302: [[73, 808]],
          303: [[105, 808]],
          304: [[73, 775]],
          306: [[73, 74], 256],
          307: [[105, 106], 256],
          308: [[74, 770]],
          309: [[106, 770]],
          310: [[75, 807]],
          311: [[107, 807]],
          313: [[76, 769]],
          314: [[108, 769]],
          315: [[76, 807]],
          316: [[108, 807]],
          317: [[76, 780]],
          318: [[108, 780]],
          319: [[76, 183], 256],
          320: [[108, 183], 256],
          323: [[78, 769]],
          324: [[110, 769]],
          325: [[78, 807]],
          326: [[110, 807]],
          327: [[78, 780]],
          328: [[110, 780]],
          329: [[700, 110], 256],
          332: [[79, 772],, {
            768: 7760,
            769: 7762
          }],
          333: [[111, 772],, {
            768: 7761,
            769: 7763
          }],
          334: [[79, 774]],
          335: [[111, 774]],
          336: [[79, 779]],
          337: [[111, 779]],
          340: [[82, 769]],
          341: [[114, 769]],
          342: [[82, 807]],
          343: [[114, 807]],
          344: [[82, 780]],
          345: [[114, 780]],
          346: [[83, 769],, {
            775: 7780
          }],
          347: [[115, 769],, {
            775: 7781
          }],
          348: [[83, 770]],
          349: [[115, 770]],
          350: [[83, 807]],
          351: [[115, 807]],
          352: [[83, 780],, {
            775: 7782
          }],
          353: [[115, 780],, {
            775: 7783
          }],
          354: [[84, 807]],
          355: [[116, 807]],
          356: [[84, 780]],
          357: [[116, 780]],
          360: [[85, 771],, {
            769: 7800
          }],
          361: [[117, 771],, {
            769: 7801
          }],
          362: [[85, 772],, {
            776: 7802
          }],
          363: [[117, 772],, {
            776: 7803
          }],
          364: [[85, 774]],
          365: [[117, 774]],
          366: [[85, 778]],
          367: [[117, 778]],
          368: [[85, 779]],
          369: [[117, 779]],
          370: [[85, 808]],
          371: [[117, 808]],
          372: [[87, 770]],
          373: [[119, 770]],
          374: [[89, 770]],
          375: [[121, 770]],
          376: [[89, 776]],
          377: [[90, 769]],
          378: [[122, 769]],
          379: [[90, 775]],
          380: [[122, 775]],
          381: [[90, 780]],
          382: [[122, 780]],
          383: [[115], 256, {
            775: 7835
          }],
          416: [[79, 795],, {
            768: 7900,
            769: 7898,
            771: 7904,
            777: 7902,
            803: 7906
          }],
          417: [[111, 795],, {
            768: 7901,
            769: 7899,
            771: 7905,
            777: 7903,
            803: 7907
          }],
          431: [[85, 795],, {
            768: 7914,
            769: 7912,
            771: 7918,
            777: 7916,
            803: 7920
          }],
          432: [[117, 795],, {
            768: 7915,
            769: 7913,
            771: 7919,
            777: 7917,
            803: 7921
          }],
          439: [,, {
            780: 494
          }],
          452: [[68, 381], 256],
          453: [[68, 382], 256],
          454: [[100, 382], 256],
          455: [[76, 74], 256],
          456: [[76, 106], 256],
          457: [[108, 106], 256],
          458: [[78, 74], 256],
          459: [[78, 106], 256],
          460: [[110, 106], 256],
          461: [[65, 780]],
          462: [[97, 780]],
          463: [[73, 780]],
          464: [[105, 780]],
          465: [[79, 780]],
          466: [[111, 780]],
          467: [[85, 780]],
          468: [[117, 780]],
          469: [[220, 772]],
          470: [[252, 772]],
          471: [[220, 769]],
          472: [[252, 769]],
          473: [[220, 780]],
          474: [[252, 780]],
          475: [[220, 768]],
          476: [[252, 768]],
          478: [[196, 772]],
          479: [[228, 772]],
          480: [[550, 772]],
          481: [[551, 772]],
          482: [[198, 772]],
          483: [[230, 772]],
          486: [[71, 780]],
          487: [[103, 780]],
          488: [[75, 780]],
          489: [[107, 780]],
          490: [[79, 808],, {
            772: 492
          }],
          491: [[111, 808],, {
            772: 493
          }],
          492: [[490, 772]],
          493: [[491, 772]],
          494: [[439, 780]],
          495: [[658, 780]],
          496: [[106, 780]],
          497: [[68, 90], 256],
          498: [[68, 122], 256],
          499: [[100, 122], 256],
          500: [[71, 769]],
          501: [[103, 769]],
          504: [[78, 768]],
          505: [[110, 768]],
          506: [[197, 769]],
          507: [[229, 769]],
          508: [[198, 769]],
          509: [[230, 769]],
          510: [[216, 769]],
          511: [[248, 769]],
          66045: [, 220]
        },
        512: {
          512: [[65, 783]],
          513: [[97, 783]],
          514: [[65, 785]],
          515: [[97, 785]],
          516: [[69, 783]],
          517: [[101, 783]],
          518: [[69, 785]],
          519: [[101, 785]],
          520: [[73, 783]],
          521: [[105, 783]],
          522: [[73, 785]],
          523: [[105, 785]],
          524: [[79, 783]],
          525: [[111, 783]],
          526: [[79, 785]],
          527: [[111, 785]],
          528: [[82, 783]],
          529: [[114, 783]],
          530: [[82, 785]],
          531: [[114, 785]],
          532: [[85, 783]],
          533: [[117, 783]],
          534: [[85, 785]],
          535: [[117, 785]],
          536: [[83, 806]],
          537: [[115, 806]],
          538: [[84, 806]],
          539: [[116, 806]],
          542: [[72, 780]],
          543: [[104, 780]],
          550: [[65, 775],, {
            772: 480
          }],
          551: [[97, 775],, {
            772: 481
          }],
          552: [[69, 807],, {
            774: 7708
          }],
          553: [[101, 807],, {
            774: 7709
          }],
          554: [[214, 772]],
          555: [[246, 772]],
          556: [[213, 772]],
          557: [[245, 772]],
          558: [[79, 775],, {
            772: 560
          }],
          559: [[111, 775],, {
            772: 561
          }],
          560: [[558, 772]],
          561: [[559, 772]],
          562: [[89, 772]],
          563: [[121, 772]],
          658: [,, {
            780: 495
          }],
          688: [[104], 256],
          689: [[614], 256],
          690: [[106], 256],
          691: [[114], 256],
          692: [[633], 256],
          693: [[635], 256],
          694: [[641], 256],
          695: [[119], 256],
          696: [[121], 256],
          728: [[32, 774], 256],
          729: [[32, 775], 256],
          730: [[32, 778], 256],
          731: [[32, 808], 256],
          732: [[32, 771], 256],
          733: [[32, 779], 256],
          736: [[611], 256],
          737: [[108], 256],
          738: [[115], 256],
          739: [[120], 256],
          740: [[661], 256],
          66272: [, 220]
        },
        768: {
          768: [, 230],
          769: [, 230],
          770: [, 230],
          771: [, 230],
          772: [, 230],
          773: [, 230],
          774: [, 230],
          775: [, 230],
          776: [, 230, {
            769: 836
          }],
          777: [, 230],
          778: [, 230],
          779: [, 230],
          780: [, 230],
          781: [, 230],
          782: [, 230],
          783: [, 230],
          784: [, 230],
          785: [, 230],
          786: [, 230],
          787: [, 230],
          788: [, 230],
          789: [, 232],
          790: [, 220],
          791: [, 220],
          792: [, 220],
          793: [, 220],
          794: [, 232],
          795: [, 216],
          796: [, 220],
          797: [, 220],
          798: [, 220],
          799: [, 220],
          800: [, 220],
          801: [, 202],
          802: [, 202],
          803: [, 220],
          804: [, 220],
          805: [, 220],
          806: [, 220],
          807: [, 202],
          808: [, 202],
          809: [, 220],
          810: [, 220],
          811: [, 220],
          812: [, 220],
          813: [, 220],
          814: [, 220],
          815: [, 220],
          816: [, 220],
          817: [, 220],
          818: [, 220],
          819: [, 220],
          820: [, 1],
          821: [, 1],
          822: [, 1],
          823: [, 1],
          824: [, 1],
          825: [, 220],
          826: [, 220],
          827: [, 220],
          828: [, 220],
          829: [, 230],
          830: [, 230],
          831: [, 230],
          832: [[768], 230],
          833: [[769], 230],
          834: [, 230],
          835: [[787], 230],
          836: [[776, 769], 230],
          837: [, 240],
          838: [, 230],
          839: [, 220],
          840: [, 220],
          841: [, 220],
          842: [, 230],
          843: [, 230],
          844: [, 230],
          845: [, 220],
          846: [, 220],
          848: [, 230],
          849: [, 230],
          850: [, 230],
          851: [, 220],
          852: [, 220],
          853: [, 220],
          854: [, 220],
          855: [, 230],
          856: [, 232],
          857: [, 220],
          858: [, 220],
          859: [, 230],
          860: [, 233],
          861: [, 234],
          862: [, 234],
          863: [, 233],
          864: [, 234],
          865: [, 234],
          866: [, 233],
          867: [, 230],
          868: [, 230],
          869: [, 230],
          870: [, 230],
          871: [, 230],
          872: [, 230],
          873: [, 230],
          874: [, 230],
          875: [, 230],
          876: [, 230],
          877: [, 230],
          878: [, 230],
          879: [, 230],
          884: [[697]],
          890: [[32, 837], 256],
          894: [[59]],
          900: [[32, 769], 256],
          901: [[168, 769]],
          902: [[913, 769]],
          903: [[183]],
          904: [[917, 769]],
          905: [[919, 769]],
          906: [[921, 769]],
          908: [[927, 769]],
          910: [[933, 769]],
          911: [[937, 769]],
          912: [[970, 769]],
          913: [,, {
            768: 8122,
            769: 902,
            772: 8121,
            774: 8120,
            787: 7944,
            788: 7945,
            837: 8124
          }],
          917: [,, {
            768: 8136,
            769: 904,
            787: 7960,
            788: 7961
          }],
          919: [,, {
            768: 8138,
            769: 905,
            787: 7976,
            788: 7977,
            837: 8140
          }],
          921: [,, {
            768: 8154,
            769: 906,
            772: 8153,
            774: 8152,
            776: 938,
            787: 7992,
            788: 7993
          }],
          927: [,, {
            768: 8184,
            769: 908,
            787: 8008,
            788: 8009
          }],
          929: [,, {
            788: 8172
          }],
          933: [,, {
            768: 8170,
            769: 910,
            772: 8169,
            774: 8168,
            776: 939,
            788: 8025
          }],
          937: [,, {
            768: 8186,
            769: 911,
            787: 8040,
            788: 8041,
            837: 8188
          }],
          938: [[921, 776]],
          939: [[933, 776]],
          940: [[945, 769],, {
            837: 8116
          }],
          941: [[949, 769]],
          942: [[951, 769],, {
            837: 8132
          }],
          943: [[953, 769]],
          944: [[971, 769]],
          945: [,, {
            768: 8048,
            769: 940,
            772: 8113,
            774: 8112,
            787: 7936,
            788: 7937,
            834: 8118,
            837: 8115
          }],
          949: [,, {
            768: 8050,
            769: 941,
            787: 7952,
            788: 7953
          }],
          951: [,, {
            768: 8052,
            769: 942,
            787: 7968,
            788: 7969,
            834: 8134,
            837: 8131
          }],
          953: [,, {
            768: 8054,
            769: 943,
            772: 8145,
            774: 8144,
            776: 970,
            787: 7984,
            788: 7985,
            834: 8150
          }],
          959: [,, {
            768: 8056,
            769: 972,
            787: 8000,
            788: 8001
          }],
          961: [,, {
            787: 8164,
            788: 8165
          }],
          965: [,, {
            768: 8058,
            769: 973,
            772: 8161,
            774: 8160,
            776: 971,
            787: 8016,
            788: 8017,
            834: 8166
          }],
          969: [,, {
            768: 8060,
            769: 974,
            787: 8032,
            788: 8033,
            834: 8182,
            837: 8179
          }],
          970: [[953, 776],, {
            768: 8146,
            769: 912,
            834: 8151
          }],
          971: [[965, 776],, {
            768: 8162,
            769: 944,
            834: 8167
          }],
          972: [[959, 769]],
          973: [[965, 769]],
          974: [[969, 769],, {
            837: 8180
          }],
          976: [[946], 256],
          977: [[952], 256],
          978: [[933], 256, {
            769: 979,
            776: 980
          }],
          979: [[978, 769]],
          980: [[978, 776]],
          981: [[966], 256],
          982: [[960], 256],
          1008: [[954], 256],
          1009: [[961], 256],
          1010: [[962], 256],
          1012: [[920], 256],
          1013: [[949], 256],
          1017: [[931], 256],
          66422: [, 230],
          66423: [, 230],
          66424: [, 230],
          66425: [, 230],
          66426: [, 230]
        },
        1024: {
          1024: [[1045, 768]],
          1025: [[1045, 776]],
          1027: [[1043, 769]],
          1030: [,, {
            776: 1031
          }],
          1031: [[1030, 776]],
          1036: [[1050, 769]],
          1037: [[1048, 768]],
          1038: [[1059, 774]],
          1040: [,, {
            774: 1232,
            776: 1234
          }],
          1043: [,, {
            769: 1027
          }],
          1045: [,, {
            768: 1024,
            774: 1238,
            776: 1025
          }],
          1046: [,, {
            774: 1217,
            776: 1244
          }],
          1047: [,, {
            776: 1246
          }],
          1048: [,, {
            768: 1037,
            772: 1250,
            774: 1049,
            776: 1252
          }],
          1049: [[1048, 774]],
          1050: [,, {
            769: 1036
          }],
          1054: [,, {
            776: 1254
          }],
          1059: [,, {
            772: 1262,
            774: 1038,
            776: 1264,
            779: 1266
          }],
          1063: [,, {
            776: 1268
          }],
          1067: [,, {
            776: 1272
          }],
          1069: [,, {
            776: 1260
          }],
          1072: [,, {
            774: 1233,
            776: 1235
          }],
          1075: [,, {
            769: 1107
          }],
          1077: [,, {
            768: 1104,
            774: 1239,
            776: 1105
          }],
          1078: [,, {
            774: 1218,
            776: 1245
          }],
          1079: [,, {
            776: 1247
          }],
          1080: [,, {
            768: 1117,
            772: 1251,
            774: 1081,
            776: 1253
          }],
          1081: [[1080, 774]],
          1082: [,, {
            769: 1116
          }],
          1086: [,, {
            776: 1255
          }],
          1091: [,, {
            772: 1263,
            774: 1118,
            776: 1265,
            779: 1267
          }],
          1095: [,, {
            776: 1269
          }],
          1099: [,, {
            776: 1273
          }],
          1101: [,, {
            776: 1261
          }],
          1104: [[1077, 768]],
          1105: [[1077, 776]],
          1107: [[1075, 769]],
          1110: [,, {
            776: 1111
          }],
          1111: [[1110, 776]],
          1116: [[1082, 769]],
          1117: [[1080, 768]],
          1118: [[1091, 774]],
          1140: [,, {
            783: 1142
          }],
          1141: [,, {
            783: 1143
          }],
          1142: [[1140, 783]],
          1143: [[1141, 783]],
          1155: [, 230],
          1156: [, 230],
          1157: [, 230],
          1158: [, 230],
          1159: [, 230],
          1217: [[1046, 774]],
          1218: [[1078, 774]],
          1232: [[1040, 774]],
          1233: [[1072, 774]],
          1234: [[1040, 776]],
          1235: [[1072, 776]],
          1238: [[1045, 774]],
          1239: [[1077, 774]],
          1240: [,, {
            776: 1242
          }],
          1241: [,, {
            776: 1243
          }],
          1242: [[1240, 776]],
          1243: [[1241, 776]],
          1244: [[1046, 776]],
          1245: [[1078, 776]],
          1246: [[1047, 776]],
          1247: [[1079, 776]],
          1250: [[1048, 772]],
          1251: [[1080, 772]],
          1252: [[1048, 776]],
          1253: [[1080, 776]],
          1254: [[1054, 776]],
          1255: [[1086, 776]],
          1256: [,, {
            776: 1258
          }],
          1257: [,, {
            776: 1259
          }],
          1258: [[1256, 776]],
          1259: [[1257, 776]],
          1260: [[1069, 776]],
          1261: [[1101, 776]],
          1262: [[1059, 772]],
          1263: [[1091, 772]],
          1264: [[1059, 776]],
          1265: [[1091, 776]],
          1266: [[1059, 779]],
          1267: [[1091, 779]],
          1268: [[1063, 776]],
          1269: [[1095, 776]],
          1272: [[1067, 776]],
          1273: [[1099, 776]]
        },
        1280: {
          1415: [[1381, 1410], 256],
          1425: [, 220],
          1426: [, 230],
          1427: [, 230],
          1428: [, 230],
          1429: [, 230],
          1430: [, 220],
          1431: [, 230],
          1432: [, 230],
          1433: [, 230],
          1434: [, 222],
          1435: [, 220],
          1436: [, 230],
          1437: [, 230],
          1438: [, 230],
          1439: [, 230],
          1440: [, 230],
          1441: [, 230],
          1442: [, 220],
          1443: [, 220],
          1444: [, 220],
          1445: [, 220],
          1446: [, 220],
          1447: [, 220],
          1448: [, 230],
          1449: [, 230],
          1450: [, 220],
          1451: [, 230],
          1452: [, 230],
          1453: [, 222],
          1454: [, 228],
          1455: [, 230],
          1456: [, 10],
          1457: [, 11],
          1458: [, 12],
          1459: [, 13],
          1460: [, 14],
          1461: [, 15],
          1462: [, 16],
          1463: [, 17],
          1464: [, 18],
          1465: [, 19],
          1466: [, 19],
          1467: [, 20],
          1468: [, 21],
          1469: [, 22],
          1471: [, 23],
          1473: [, 24],
          1474: [, 25],
          1476: [, 230],
          1477: [, 220],
          1479: [, 18]
        },
        1536: {
          1552: [, 230],
          1553: [, 230],
          1554: [, 230],
          1555: [, 230],
          1556: [, 230],
          1557: [, 230],
          1558: [, 230],
          1559: [, 230],
          1560: [, 30],
          1561: [, 31],
          1562: [, 32],
          1570: [[1575, 1619]],
          1571: [[1575, 1620]],
          1572: [[1608, 1620]],
          1573: [[1575, 1621]],
          1574: [[1610, 1620]],
          1575: [,, {
            1619: 1570,
            1620: 1571,
            1621: 1573
          }],
          1608: [,, {
            1620: 1572
          }],
          1610: [,, {
            1620: 1574
          }],
          1611: [, 27],
          1612: [, 28],
          1613: [, 29],
          1614: [, 30],
          1615: [, 31],
          1616: [, 32],
          1617: [, 33],
          1618: [, 34],
          1619: [, 230],
          1620: [, 230],
          1621: [, 220],
          1622: [, 220],
          1623: [, 230],
          1624: [, 230],
          1625: [, 230],
          1626: [, 230],
          1627: [, 230],
          1628: [, 220],
          1629: [, 230],
          1630: [, 230],
          1631: [, 220],
          1648: [, 35],
          1653: [[1575, 1652], 256],
          1654: [[1608, 1652], 256],
          1655: [[1735, 1652], 256],
          1656: [[1610, 1652], 256],
          1728: [[1749, 1620]],
          1729: [,, {
            1620: 1730
          }],
          1730: [[1729, 1620]],
          1746: [,, {
            1620: 1747
          }],
          1747: [[1746, 1620]],
          1749: [,, {
            1620: 1728
          }],
          1750: [, 230],
          1751: [, 230],
          1752: [, 230],
          1753: [, 230],
          1754: [, 230],
          1755: [, 230],
          1756: [, 230],
          1759: [, 230],
          1760: [, 230],
          1761: [, 230],
          1762: [, 230],
          1763: [, 220],
          1764: [, 230],
          1767: [, 230],
          1768: [, 230],
          1770: [, 220],
          1771: [, 230],
          1772: [, 230],
          1773: [, 220]
        },
        1792: {
          1809: [, 36],
          1840: [, 230],
          1841: [, 220],
          1842: [, 230],
          1843: [, 230],
          1844: [, 220],
          1845: [, 230],
          1846: [, 230],
          1847: [, 220],
          1848: [, 220],
          1849: [, 220],
          1850: [, 230],
          1851: [, 220],
          1852: [, 220],
          1853: [, 230],
          1854: [, 220],
          1855: [, 230],
          1856: [, 230],
          1857: [, 230],
          1858: [, 220],
          1859: [, 230],
          1860: [, 220],
          1861: [, 230],
          1862: [, 220],
          1863: [, 230],
          1864: [, 220],
          1865: [, 230],
          1866: [, 230],
          2027: [, 230],
          2028: [, 230],
          2029: [, 230],
          2030: [, 230],
          2031: [, 230],
          2032: [, 230],
          2033: [, 230],
          2034: [, 220],
          2035: [, 230]
        },
        2048: {
          2070: [, 230],
          2071: [, 230],
          2072: [, 230],
          2073: [, 230],
          2075: [, 230],
          2076: [, 230],
          2077: [, 230],
          2078: [, 230],
          2079: [, 230],
          2080: [, 230],
          2081: [, 230],
          2082: [, 230],
          2083: [, 230],
          2085: [, 230],
          2086: [, 230],
          2087: [, 230],
          2089: [, 230],
          2090: [, 230],
          2091: [, 230],
          2092: [, 230],
          2093: [, 230],
          2137: [, 220],
          2138: [, 220],
          2139: [, 220],
          2276: [, 230],
          2277: [, 230],
          2278: [, 220],
          2279: [, 230],
          2280: [, 230],
          2281: [, 220],
          2282: [, 230],
          2283: [, 230],
          2284: [, 230],
          2285: [, 220],
          2286: [, 220],
          2287: [, 220],
          2288: [, 27],
          2289: [, 28],
          2290: [, 29],
          2291: [, 230],
          2292: [, 230],
          2293: [, 230],
          2294: [, 220],
          2295: [, 230],
          2296: [, 230],
          2297: [, 220],
          2298: [, 220],
          2299: [, 230],
          2300: [, 230],
          2301: [, 230],
          2302: [, 230],
          2303: [, 230]
        },
        2304: {
          2344: [,, {
            2364: 2345
          }],
          2345: [[2344, 2364]],
          2352: [,, {
            2364: 2353
          }],
          2353: [[2352, 2364]],
          2355: [,, {
            2364: 2356
          }],
          2356: [[2355, 2364]],
          2364: [, 7],
          2381: [, 9],
          2385: [, 230],
          2386: [, 220],
          2387: [, 230],
          2388: [, 230],
          2392: [[2325, 2364], 512],
          2393: [[2326, 2364], 512],
          2394: [[2327, 2364], 512],
          2395: [[2332, 2364], 512],
          2396: [[2337, 2364], 512],
          2397: [[2338, 2364], 512],
          2398: [[2347, 2364], 512],
          2399: [[2351, 2364], 512],
          2492: [, 7],
          2503: [,, {
            2494: 2507,
            2519: 2508
          }],
          2507: [[2503, 2494]],
          2508: [[2503, 2519]],
          2509: [, 9],
          2524: [[2465, 2492], 512],
          2525: [[2466, 2492], 512],
          2527: [[2479, 2492], 512]
        },
        2560: {
          2611: [[2610, 2620], 512],
          2614: [[2616, 2620], 512],
          2620: [, 7],
          2637: [, 9],
          2649: [[2582, 2620], 512],
          2650: [[2583, 2620], 512],
          2651: [[2588, 2620], 512],
          2654: [[2603, 2620], 512],
          2748: [, 7],
          2765: [, 9],
          68109: [, 220],
          68111: [, 230],
          68152: [, 230],
          68153: [, 1],
          68154: [, 220],
          68159: [, 9],
          68325: [, 230],
          68326: [, 220]
        },
        2816: {
          2876: [, 7],
          2887: [,, {
            2878: 2891,
            2902: 2888,
            2903: 2892
          }],
          2888: [[2887, 2902]],
          2891: [[2887, 2878]],
          2892: [[2887, 2903]],
          2893: [, 9],
          2908: [[2849, 2876], 512],
          2909: [[2850, 2876], 512],
          2962: [,, {
            3031: 2964
          }],
          2964: [[2962, 3031]],
          3014: [,, {
            3006: 3018,
            3031: 3020
          }],
          3015: [,, {
            3006: 3019
          }],
          3018: [[3014, 3006]],
          3019: [[3015, 3006]],
          3020: [[3014, 3031]],
          3021: [, 9]
        },
        3072: {
          3142: [,, {
            3158: 3144
          }],
          3144: [[3142, 3158]],
          3149: [, 9],
          3157: [, 84],
          3158: [, 91],
          3260: [, 7],
          3263: [,, {
            3285: 3264
          }],
          3264: [[3263, 3285]],
          3270: [,, {
            3266: 3274,
            3285: 3271,
            3286: 3272
          }],
          3271: [[3270, 3285]],
          3272: [[3270, 3286]],
          3274: [[3270, 3266],, {
            3285: 3275
          }],
          3275: [[3274, 3285]],
          3277: [, 9]
        },
        3328: {
          3398: [,, {
            3390: 3402,
            3415: 3404
          }],
          3399: [,, {
            3390: 3403
          }],
          3402: [[3398, 3390]],
          3403: [[3399, 3390]],
          3404: [[3398, 3415]],
          3405: [, 9],
          3530: [, 9],
          3545: [,, {
            3530: 3546,
            3535: 3548,
            3551: 3550
          }],
          3546: [[3545, 3530]],
          3548: [[3545, 3535],, {
            3530: 3549
          }],
          3549: [[3548, 3530]],
          3550: [[3545, 3551]]
        },
        3584: {
          3635: [[3661, 3634], 256],
          3640: [, 103],
          3641: [, 103],
          3642: [, 9],
          3656: [, 107],
          3657: [, 107],
          3658: [, 107],
          3659: [, 107],
          3763: [[3789, 3762], 256],
          3768: [, 118],
          3769: [, 118],
          3784: [, 122],
          3785: [, 122],
          3786: [, 122],
          3787: [, 122],
          3804: [[3755, 3737], 256],
          3805: [[3755, 3745], 256]
        },
        3840: {
          3852: [[3851], 256],
          3864: [, 220],
          3865: [, 220],
          3893: [, 220],
          3895: [, 220],
          3897: [, 216],
          3907: [[3906, 4023], 512],
          3917: [[3916, 4023], 512],
          3922: [[3921, 4023], 512],
          3927: [[3926, 4023], 512],
          3932: [[3931, 4023], 512],
          3945: [[3904, 4021], 512],
          3953: [, 129],
          3954: [, 130],
          3955: [[3953, 3954], 512],
          3956: [, 132],
          3957: [[3953, 3956], 512],
          3958: [[4018, 3968], 512],
          3959: [[4018, 3969], 256],
          3960: [[4019, 3968], 512],
          3961: [[4019, 3969], 256],
          3962: [, 130],
          3963: [, 130],
          3964: [, 130],
          3965: [, 130],
          3968: [, 130],
          3969: [[3953, 3968], 512],
          3970: [, 230],
          3971: [, 230],
          3972: [, 9],
          3974: [, 230],
          3975: [, 230],
          3987: [[3986, 4023], 512],
          3997: [[3996, 4023], 512],
          4002: [[4001, 4023], 512],
          4007: [[4006, 4023], 512],
          4012: [[4011, 4023], 512],
          4025: [[3984, 4021], 512],
          4038: [, 220]
        },
        4096: {
          4133: [,, {
            4142: 4134
          }],
          4134: [[4133, 4142]],
          4151: [, 7],
          4153: [, 9],
          4154: [, 9],
          4237: [, 220],
          4348: [[4316], 256],
          69702: [, 9],
          69759: [, 9],
          69785: [,, {
            69818: 69786
          }],
          69786: [[69785, 69818]],
          69787: [,, {
            69818: 69788
          }],
          69788: [[69787, 69818]],
          69797: [,, {
            69818: 69803
          }],
          69803: [[69797, 69818]],
          69817: [, 9],
          69818: [, 7]
        },
        4352: {
          69888: [, 230],
          69889: [, 230],
          69890: [, 230],
          69934: [[69937, 69927]],
          69935: [[69938, 69927]],
          69937: [,, {
            69927: 69934
          }],
          69938: [,, {
            69927: 69935
          }],
          69939: [, 9],
          69940: [, 9],
          70003: [, 7],
          70080: [, 9]
        },
        4608: {
          70197: [, 9],
          70198: [, 7],
          70377: [, 7],
          70378: [, 9]
        },
        4864: {
          4957: [, 230],
          4958: [, 230],
          4959: [, 230],
          70460: [, 7],
          70471: [,, {
            70462: 70475,
            70487: 70476
          }],
          70475: [[70471, 70462]],
          70476: [[70471, 70487]],
          70477: [, 9],
          70502: [, 230],
          70503: [, 230],
          70504: [, 230],
          70505: [, 230],
          70506: [, 230],
          70507: [, 230],
          70508: [, 230],
          70512: [, 230],
          70513: [, 230],
          70514: [, 230],
          70515: [, 230],
          70516: [, 230]
        },
        5120: {
          70841: [,, {
            70832: 70844,
            70842: 70843,
            70845: 70846
          }],
          70843: [[70841, 70842]],
          70844: [[70841, 70832]],
          70846: [[70841, 70845]],
          70850: [, 9],
          70851: [, 7]
        },
        5376: {
          71096: [,, {
            71087: 71098
          }],
          71097: [,, {
            71087: 71099
          }],
          71098: [[71096, 71087]],
          71099: [[71097, 71087]],
          71103: [, 9],
          71104: [, 7]
        },
        5632: {
          71231: [, 9],
          71350: [, 9],
          71351: [, 7]
        },
        5888: {
          5908: [, 9],
          5940: [, 9],
          6098: [, 9],
          6109: [, 230]
        },
        6144: {
          6313: [, 228]
        },
        6400: {
          6457: [, 222],
          6458: [, 230],
          6459: [, 220]
        },
        6656: {
          6679: [, 230],
          6680: [, 220],
          6752: [, 9],
          6773: [, 230],
          6774: [, 230],
          6775: [, 230],
          6776: [, 230],
          6777: [, 230],
          6778: [, 230],
          6779: [, 230],
          6780: [, 230],
          6783: [, 220],
          6832: [, 230],
          6833: [, 230],
          6834: [, 230],
          6835: [, 230],
          6836: [, 230],
          6837: [, 220],
          6838: [, 220],
          6839: [, 220],
          6840: [, 220],
          6841: [, 220],
          6842: [, 220],
          6843: [, 230],
          6844: [, 230],
          6845: [, 220]
        },
        6912: {
          6917: [,, {
            6965: 6918
          }],
          6918: [[6917, 6965]],
          6919: [,, {
            6965: 6920
          }],
          6920: [[6919, 6965]],
          6921: [,, {
            6965: 6922
          }],
          6922: [[6921, 6965]],
          6923: [,, {
            6965: 6924
          }],
          6924: [[6923, 6965]],
          6925: [,, {
            6965: 6926
          }],
          6926: [[6925, 6965]],
          6929: [,, {
            6965: 6930
          }],
          6930: [[6929, 6965]],
          6964: [, 7],
          6970: [,, {
            6965: 6971
          }],
          6971: [[6970, 6965]],
          6972: [,, {
            6965: 6973
          }],
          6973: [[6972, 6965]],
          6974: [,, {
            6965: 6976
          }],
          6975: [,, {
            6965: 6977
          }],
          6976: [[6974, 6965]],
          6977: [[6975, 6965]],
          6978: [,, {
            6965: 6979
          }],
          6979: [[6978, 6965]],
          6980: [, 9],
          7019: [, 230],
          7020: [, 220],
          7021: [, 230],
          7022: [, 230],
          7023: [, 230],
          7024: [, 230],
          7025: [, 230],
          7026: [, 230],
          7027: [, 230],
          7082: [, 9],
          7083: [, 9],
          7142: [, 7],
          7154: [, 9],
          7155: [, 9]
        },
        7168: {
          7223: [, 7],
          7376: [, 230],
          7377: [, 230],
          7378: [, 230],
          7380: [, 1],
          7381: [, 220],
          7382: [, 220],
          7383: [, 220],
          7384: [, 220],
          7385: [, 220],
          7386: [, 230],
          7387: [, 230],
          7388: [, 220],
          7389: [, 220],
          7390: [, 220],
          7391: [, 220],
          7392: [, 230],
          7394: [, 1],
          7395: [, 1],
          7396: [, 1],
          7397: [, 1],
          7398: [, 1],
          7399: [, 1],
          7400: [, 1],
          7405: [, 220],
          7412: [, 230],
          7416: [, 230],
          7417: [, 230]
        },
        7424: {
          7468: [[65], 256],
          7469: [[198], 256],
          7470: [[66], 256],
          7472: [[68], 256],
          7473: [[69], 256],
          7474: [[398], 256],
          7475: [[71], 256],
          7476: [[72], 256],
          7477: [[73], 256],
          7478: [[74], 256],
          7479: [[75], 256],
          7480: [[76], 256],
          7481: [[77], 256],
          7482: [[78], 256],
          7484: [[79], 256],
          7485: [[546], 256],
          7486: [[80], 256],
          7487: [[82], 256],
          7488: [[84], 256],
          7489: [[85], 256],
          7490: [[87], 256],
          7491: [[97], 256],
          7492: [[592], 256],
          7493: [[593], 256],
          7494: [[7426], 256],
          7495: [[98], 256],
          7496: [[100], 256],
          7497: [[101], 256],
          7498: [[601], 256],
          7499: [[603], 256],
          7500: [[604], 256],
          7501: [[103], 256],
          7503: [[107], 256],
          7504: [[109], 256],
          7505: [[331], 256],
          7506: [[111], 256],
          7507: [[596], 256],
          7508: [[7446], 256],
          7509: [[7447], 256],
          7510: [[112], 256],
          7511: [[116], 256],
          7512: [[117], 256],
          7513: [[7453], 256],
          7514: [[623], 256],
          7515: [[118], 256],
          7516: [[7461], 256],
          7517: [[946], 256],
          7518: [[947], 256],
          7519: [[948], 256],
          7520: [[966], 256],
          7521: [[967], 256],
          7522: [[105], 256],
          7523: [[114], 256],
          7524: [[117], 256],
          7525: [[118], 256],
          7526: [[946], 256],
          7527: [[947], 256],
          7528: [[961], 256],
          7529: [[966], 256],
          7530: [[967], 256],
          7544: [[1085], 256],
          7579: [[594], 256],
          7580: [[99], 256],
          7581: [[597], 256],
          7582: [[240], 256],
          7583: [[604], 256],
          7584: [[102], 256],
          7585: [[607], 256],
          7586: [[609], 256],
          7587: [[613], 256],
          7588: [[616], 256],
          7589: [[617], 256],
          7590: [[618], 256],
          7591: [[7547], 256],
          7592: [[669], 256],
          7593: [[621], 256],
          7594: [[7557], 256],
          7595: [[671], 256],
          7596: [[625], 256],
          7597: [[624], 256],
          7598: [[626], 256],
          7599: [[627], 256],
          7600: [[628], 256],
          7601: [[629], 256],
          7602: [[632], 256],
          7603: [[642], 256],
          7604: [[643], 256],
          7605: [[427], 256],
          7606: [[649], 256],
          7607: [[650], 256],
          7608: [[7452], 256],
          7609: [[651], 256],
          7610: [[652], 256],
          7611: [[122], 256],
          7612: [[656], 256],
          7613: [[657], 256],
          7614: [[658], 256],
          7615: [[952], 256],
          7616: [, 230],
          7617: [, 230],
          7618: [, 220],
          7619: [, 230],
          7620: [, 230],
          7621: [, 230],
          7622: [, 230],
          7623: [, 230],
          7624: [, 230],
          7625: [, 230],
          7626: [, 220],
          7627: [, 230],
          7628: [, 230],
          7629: [, 234],
          7630: [, 214],
          7631: [, 220],
          7632: [, 202],
          7633: [, 230],
          7634: [, 230],
          7635: [, 230],
          7636: [, 230],
          7637: [, 230],
          7638: [, 230],
          7639: [, 230],
          7640: [, 230],
          7641: [, 230],
          7642: [, 230],
          7643: [, 230],
          7644: [, 230],
          7645: [, 230],
          7646: [, 230],
          7647: [, 230],
          7648: [, 230],
          7649: [, 230],
          7650: [, 230],
          7651: [, 230],
          7652: [, 230],
          7653: [, 230],
          7654: [, 230],
          7655: [, 230],
          7656: [, 230],
          7657: [, 230],
          7658: [, 230],
          7659: [, 230],
          7660: [, 230],
          7661: [, 230],
          7662: [, 230],
          7663: [, 230],
          7664: [, 230],
          7665: [, 230],
          7666: [, 230],
          7667: [, 230],
          7668: [, 230],
          7669: [, 230],
          7676: [, 233],
          7677: [, 220],
          7678: [, 230],
          7679: [, 220]
        },
        7680: {
          7680: [[65, 805]],
          7681: [[97, 805]],
          7682: [[66, 775]],
          7683: [[98, 775]],
          7684: [[66, 803]],
          7685: [[98, 803]],
          7686: [[66, 817]],
          7687: [[98, 817]],
          7688: [[199, 769]],
          7689: [[231, 769]],
          7690: [[68, 775]],
          7691: [[100, 775]],
          7692: [[68, 803]],
          7693: [[100, 803]],
          7694: [[68, 817]],
          7695: [[100, 817]],
          7696: [[68, 807]],
          7697: [[100, 807]],
          7698: [[68, 813]],
          7699: [[100, 813]],
          7700: [[274, 768]],
          7701: [[275, 768]],
          7702: [[274, 769]],
          7703: [[275, 769]],
          7704: [[69, 813]],
          7705: [[101, 813]],
          7706: [[69, 816]],
          7707: [[101, 816]],
          7708: [[552, 774]],
          7709: [[553, 774]],
          7710: [[70, 775]],
          7711: [[102, 775]],
          7712: [[71, 772]],
          7713: [[103, 772]],
          7714: [[72, 775]],
          7715: [[104, 775]],
          7716: [[72, 803]],
          7717: [[104, 803]],
          7718: [[72, 776]],
          7719: [[104, 776]],
          7720: [[72, 807]],
          7721: [[104, 807]],
          7722: [[72, 814]],
          7723: [[104, 814]],
          7724: [[73, 816]],
          7725: [[105, 816]],
          7726: [[207, 769]],
          7727: [[239, 769]],
          7728: [[75, 769]],
          7729: [[107, 769]],
          7730: [[75, 803]],
          7731: [[107, 803]],
          7732: [[75, 817]],
          7733: [[107, 817]],
          7734: [[76, 803],, {
            772: 7736
          }],
          7735: [[108, 803],, {
            772: 7737
          }],
          7736: [[7734, 772]],
          7737: [[7735, 772]],
          7738: [[76, 817]],
          7739: [[108, 817]],
          7740: [[76, 813]],
          7741: [[108, 813]],
          7742: [[77, 769]],
          7743: [[109, 769]],
          7744: [[77, 775]],
          7745: [[109, 775]],
          7746: [[77, 803]],
          7747: [[109, 803]],
          7748: [[78, 775]],
          7749: [[110, 775]],
          7750: [[78, 803]],
          7751: [[110, 803]],
          7752: [[78, 817]],
          7753: [[110, 817]],
          7754: [[78, 813]],
          7755: [[110, 813]],
          7756: [[213, 769]],
          7757: [[245, 769]],
          7758: [[213, 776]],
          7759: [[245, 776]],
          7760: [[332, 768]],
          7761: [[333, 768]],
          7762: [[332, 769]],
          7763: [[333, 769]],
          7764: [[80, 769]],
          7765: [[112, 769]],
          7766: [[80, 775]],
          7767: [[112, 775]],
          7768: [[82, 775]],
          7769: [[114, 775]],
          7770: [[82, 803],, {
            772: 7772
          }],
          7771: [[114, 803],, {
            772: 7773
          }],
          7772: [[7770, 772]],
          7773: [[7771, 772]],
          7774: [[82, 817]],
          7775: [[114, 817]],
          7776: [[83, 775]],
          7777: [[115, 775]],
          7778: [[83, 803],, {
            775: 7784
          }],
          7779: [[115, 803],, {
            775: 7785
          }],
          7780: [[346, 775]],
          7781: [[347, 775]],
          7782: [[352, 775]],
          7783: [[353, 775]],
          7784: [[7778, 775]],
          7785: [[7779, 775]],
          7786: [[84, 775]],
          7787: [[116, 775]],
          7788: [[84, 803]],
          7789: [[116, 803]],
          7790: [[84, 817]],
          7791: [[116, 817]],
          7792: [[84, 813]],
          7793: [[116, 813]],
          7794: [[85, 804]],
          7795: [[117, 804]],
          7796: [[85, 816]],
          7797: [[117, 816]],
          7798: [[85, 813]],
          7799: [[117, 813]],
          7800: [[360, 769]],
          7801: [[361, 769]],
          7802: [[362, 776]],
          7803: [[363, 776]],
          7804: [[86, 771]],
          7805: [[118, 771]],
          7806: [[86, 803]],
          7807: [[118, 803]],
          7808: [[87, 768]],
          7809: [[119, 768]],
          7810: [[87, 769]],
          7811: [[119, 769]],
          7812: [[87, 776]],
          7813: [[119, 776]],
          7814: [[87, 775]],
          7815: [[119, 775]],
          7816: [[87, 803]],
          7817: [[119, 803]],
          7818: [[88, 775]],
          7819: [[120, 775]],
          7820: [[88, 776]],
          7821: [[120, 776]],
          7822: [[89, 775]],
          7823: [[121, 775]],
          7824: [[90, 770]],
          7825: [[122, 770]],
          7826: [[90, 803]],
          7827: [[122, 803]],
          7828: [[90, 817]],
          7829: [[122, 817]],
          7830: [[104, 817]],
          7831: [[116, 776]],
          7832: [[119, 778]],
          7833: [[121, 778]],
          7834: [[97, 702], 256],
          7835: [[383, 775]],
          7840: [[65, 803],, {
            770: 7852,
            774: 7862
          }],
          7841: [[97, 803],, {
            770: 7853,
            774: 7863
          }],
          7842: [[65, 777]],
          7843: [[97, 777]],
          7844: [[194, 769]],
          7845: [[226, 769]],
          7846: [[194, 768]],
          7847: [[226, 768]],
          7848: [[194, 777]],
          7849: [[226, 777]],
          7850: [[194, 771]],
          7851: [[226, 771]],
          7852: [[7840, 770]],
          7853: [[7841, 770]],
          7854: [[258, 769]],
          7855: [[259, 769]],
          7856: [[258, 768]],
          7857: [[259, 768]],
          7858: [[258, 777]],
          7859: [[259, 777]],
          7860: [[258, 771]],
          7861: [[259, 771]],
          7862: [[7840, 774]],
          7863: [[7841, 774]],
          7864: [[69, 803],, {
            770: 7878
          }],
          7865: [[101, 803],, {
            770: 7879
          }],
          7866: [[69, 777]],
          7867: [[101, 777]],
          7868: [[69, 771]],
          7869: [[101, 771]],
          7870: [[202, 769]],
          7871: [[234, 769]],
          7872: [[202, 768]],
          7873: [[234, 768]],
          7874: [[202, 777]],
          7875: [[234, 777]],
          7876: [[202, 771]],
          7877: [[234, 771]],
          7878: [[7864, 770]],
          7879: [[7865, 770]],
          7880: [[73, 777]],
          7881: [[105, 777]],
          7882: [[73, 803]],
          7883: [[105, 803]],
          7884: [[79, 803],, {
            770: 7896
          }],
          7885: [[111, 803],, {
            770: 7897
          }],
          7886: [[79, 777]],
          7887: [[111, 777]],
          7888: [[212, 769]],
          7889: [[244, 769]],
          7890: [[212, 768]],
          7891: [[244, 768]],
          7892: [[212, 777]],
          7893: [[244, 777]],
          7894: [[212, 771]],
          7895: [[244, 771]],
          7896: [[7884, 770]],
          7897: [[7885, 770]],
          7898: [[416, 769]],
          7899: [[417, 769]],
          7900: [[416, 768]],
          7901: [[417, 768]],
          7902: [[416, 777]],
          7903: [[417, 777]],
          7904: [[416, 771]],
          7905: [[417, 771]],
          7906: [[416, 803]],
          7907: [[417, 803]],
          7908: [[85, 803]],
          7909: [[117, 803]],
          7910: [[85, 777]],
          7911: [[117, 777]],
          7912: [[431, 769]],
          7913: [[432, 769]],
          7914: [[431, 768]],
          7915: [[432, 768]],
          7916: [[431, 777]],
          7917: [[432, 777]],
          7918: [[431, 771]],
          7919: [[432, 771]],
          7920: [[431, 803]],
          7921: [[432, 803]],
          7922: [[89, 768]],
          7923: [[121, 768]],
          7924: [[89, 803]],
          7925: [[121, 803]],
          7926: [[89, 777]],
          7927: [[121, 777]],
          7928: [[89, 771]],
          7929: [[121, 771]]
        },
        7936: {
          7936: [[945, 787],, {
            768: 7938,
            769: 7940,
            834: 7942,
            837: 8064
          }],
          7937: [[945, 788],, {
            768: 7939,
            769: 7941,
            834: 7943,
            837: 8065
          }],
          7938: [[7936, 768],, {
            837: 8066
          }],
          7939: [[7937, 768],, {
            837: 8067
          }],
          7940: [[7936, 769],, {
            837: 8068
          }],
          7941: [[7937, 769],, {
            837: 8069
          }],
          7942: [[7936, 834],, {
            837: 8070
          }],
          7943: [[7937, 834],, {
            837: 8071
          }],
          7944: [[913, 787],, {
            768: 7946,
            769: 7948,
            834: 7950,
            837: 8072
          }],
          7945: [[913, 788],, {
            768: 7947,
            769: 7949,
            834: 7951,
            837: 8073
          }],
          7946: [[7944, 768],, {
            837: 8074
          }],
          7947: [[7945, 768],, {
            837: 8075
          }],
          7948: [[7944, 769],, {
            837: 8076
          }],
          7949: [[7945, 769],, {
            837: 8077
          }],
          7950: [[7944, 834],, {
            837: 8078
          }],
          7951: [[7945, 834],, {
            837: 8079
          }],
          7952: [[949, 787],, {
            768: 7954,
            769: 7956
          }],
          7953: [[949, 788],, {
            768: 7955,
            769: 7957
          }],
          7954: [[7952, 768]],
          7955: [[7953, 768]],
          7956: [[7952, 769]],
          7957: [[7953, 769]],
          7960: [[917, 787],, {
            768: 7962,
            769: 7964
          }],
          7961: [[917, 788],, {
            768: 7963,
            769: 7965
          }],
          7962: [[7960, 768]],
          7963: [[7961, 768]],
          7964: [[7960, 769]],
          7965: [[7961, 769]],
          7968: [[951, 787],, {
            768: 7970,
            769: 7972,
            834: 7974,
            837: 8080
          }],
          7969: [[951, 788],, {
            768: 7971,
            769: 7973,
            834: 7975,
            837: 8081
          }],
          7970: [[7968, 768],, {
            837: 8082
          }],
          7971: [[7969, 768],, {
            837: 8083
          }],
          7972: [[7968, 769],, {
            837: 8084
          }],
          7973: [[7969, 769],, {
            837: 8085
          }],
          7974: [[7968, 834],, {
            837: 8086
          }],
          7975: [[7969, 834],, {
            837: 8087
          }],
          7976: [[919, 787],, {
            768: 7978,
            769: 7980,
            834: 7982,
            837: 8088
          }],
          7977: [[919, 788],, {
            768: 7979,
            769: 7981,
            834: 7983,
            837: 8089
          }],
          7978: [[7976, 768],, {
            837: 8090
          }],
          7979: [[7977, 768],, {
            837: 8091
          }],
          7980: [[7976, 769],, {
            837: 8092
          }],
          7981: [[7977, 769],, {
            837: 8093
          }],
          7982: [[7976, 834],, {
            837: 8094
          }],
          7983: [[7977, 834],, {
            837: 8095
          }],
          7984: [[953, 787],, {
            768: 7986,
            769: 7988,
            834: 7990
          }],
          7985: [[953, 788],, {
            768: 7987,
            769: 7989,
            834: 7991
          }],
          7986: [[7984, 768]],
          7987: [[7985, 768]],
          7988: [[7984, 769]],
          7989: [[7985, 769]],
          7990: [[7984, 834]],
          7991: [[7985, 834]],
          7992: [[921, 787],, {
            768: 7994,
            769: 7996,
            834: 7998
          }],
          7993: [[921, 788],, {
            768: 7995,
            769: 7997,
            834: 7999
          }],
          7994: [[7992, 768]],
          7995: [[7993, 768]],
          7996: [[7992, 769]],
          7997: [[7993, 769]],
          7998: [[7992, 834]],
          7999: [[7993, 834]],
          8000: [[959, 787],, {
            768: 8002,
            769: 8004
          }],
          8001: [[959, 788],, {
            768: 8003,
            769: 8005
          }],
          8002: [[8000, 768]],
          8003: [[8001, 768]],
          8004: [[8000, 769]],
          8005: [[8001, 769]],
          8008: [[927, 787],, {
            768: 8010,
            769: 8012
          }],
          8009: [[927, 788],, {
            768: 8011,
            769: 8013
          }],
          8010: [[8008, 768]],
          8011: [[8009, 768]],
          8012: [[8008, 769]],
          8013: [[8009, 769]],
          8016: [[965, 787],, {
            768: 8018,
            769: 8020,
            834: 8022
          }],
          8017: [[965, 788],, {
            768: 8019,
            769: 8021,
            834: 8023
          }],
          8018: [[8016, 768]],
          8019: [[8017, 768]],
          8020: [[8016, 769]],
          8021: [[8017, 769]],
          8022: [[8016, 834]],
          8023: [[8017, 834]],
          8025: [[933, 788],, {
            768: 8027,
            769: 8029,
            834: 8031
          }],
          8027: [[8025, 768]],
          8029: [[8025, 769]],
          8031: [[8025, 834]],
          8032: [[969, 787],, {
            768: 8034,
            769: 8036,
            834: 8038,
            837: 8096
          }],
          8033: [[969, 788],, {
            768: 8035,
            769: 8037,
            834: 8039,
            837: 8097
          }],
          8034: [[8032, 768],, {
            837: 8098
          }],
          8035: [[8033, 768],, {
            837: 8099
          }],
          8036: [[8032, 769],, {
            837: 8100
          }],
          8037: [[8033, 769],, {
            837: 8101
          }],
          8038: [[8032, 834],, {
            837: 8102
          }],
          8039: [[8033, 834],, {
            837: 8103
          }],
          8040: [[937, 787],, {
            768: 8042,
            769: 8044,
            834: 8046,
            837: 8104
          }],
          8041: [[937, 788],, {
            768: 8043,
            769: 8045,
            834: 8047,
            837: 8105
          }],
          8042: [[8040, 768],, {
            837: 8106
          }],
          8043: [[8041, 768],, {
            837: 8107
          }],
          8044: [[8040, 769],, {
            837: 8108
          }],
          8045: [[8041, 769],, {
            837: 8109
          }],
          8046: [[8040, 834],, {
            837: 8110
          }],
          8047: [[8041, 834],, {
            837: 8111
          }],
          8048: [[945, 768],, {
            837: 8114
          }],
          8049: [[940]],
          8050: [[949, 768]],
          8051: [[941]],
          8052: [[951, 768],, {
            837: 8130
          }],
          8053: [[942]],
          8054: [[953, 768]],
          8055: [[943]],
          8056: [[959, 768]],
          8057: [[972]],
          8058: [[965, 768]],
          8059: [[973]],
          8060: [[969, 768],, {
            837: 8178
          }],
          8061: [[974]],
          8064: [[7936, 837]],
          8065: [[7937, 837]],
          8066: [[7938, 837]],
          8067: [[7939, 837]],
          8068: [[7940, 837]],
          8069: [[7941, 837]],
          8070: [[7942, 837]],
          8071: [[7943, 837]],
          8072: [[7944, 837]],
          8073: [[7945, 837]],
          8074: [[7946, 837]],
          8075: [[7947, 837]],
          8076: [[7948, 837]],
          8077: [[7949, 837]],
          8078: [[7950, 837]],
          8079: [[7951, 837]],
          8080: [[7968, 837]],
          8081: [[7969, 837]],
          8082: [[7970, 837]],
          8083: [[7971, 837]],
          8084: [[7972, 837]],
          8085: [[7973, 837]],
          8086: [[7974, 837]],
          8087: [[7975, 837]],
          8088: [[7976, 837]],
          8089: [[7977, 837]],
          8090: [[7978, 837]],
          8091: [[7979, 837]],
          8092: [[7980, 837]],
          8093: [[7981, 837]],
          8094: [[7982, 837]],
          8095: [[7983, 837]],
          8096: [[8032, 837]],
          8097: [[8033, 837]],
          8098: [[8034, 837]],
          8099: [[8035, 837]],
          8100: [[8036, 837]],
          8101: [[8037, 837]],
          8102: [[8038, 837]],
          8103: [[8039, 837]],
          8104: [[8040, 837]],
          8105: [[8041, 837]],
          8106: [[8042, 837]],
          8107: [[8043, 837]],
          8108: [[8044, 837]],
          8109: [[8045, 837]],
          8110: [[8046, 837]],
          8111: [[8047, 837]],
          8112: [[945, 774]],
          8113: [[945, 772]],
          8114: [[8048, 837]],
          8115: [[945, 837]],
          8116: [[940, 837]],
          8118: [[945, 834],, {
            837: 8119
          }],
          8119: [[8118, 837]],
          8120: [[913, 774]],
          8121: [[913, 772]],
          8122: [[913, 768]],
          8123: [[902]],
          8124: [[913, 837]],
          8125: [[32, 787], 256],
          8126: [[953]],
          8127: [[32, 787], 256, {
            768: 8141,
            769: 8142,
            834: 8143
          }],
          8128: [[32, 834], 256],
          8129: [[168, 834]],
          8130: [[8052, 837]],
          8131: [[951, 837]],
          8132: [[942, 837]],
          8134: [[951, 834],, {
            837: 8135
          }],
          8135: [[8134, 837]],
          8136: [[917, 768]],
          8137: [[904]],
          8138: [[919, 768]],
          8139: [[905]],
          8140: [[919, 837]],
          8141: [[8127, 768]],
          8142: [[8127, 769]],
          8143: [[8127, 834]],
          8144: [[953, 774]],
          8145: [[953, 772]],
          8146: [[970, 768]],
          8147: [[912]],
          8150: [[953, 834]],
          8151: [[970, 834]],
          8152: [[921, 774]],
          8153: [[921, 772]],
          8154: [[921, 768]],
          8155: [[906]],
          8157: [[8190, 768]],
          8158: [[8190, 769]],
          8159: [[8190, 834]],
          8160: [[965, 774]],
          8161: [[965, 772]],
          8162: [[971, 768]],
          8163: [[944]],
          8164: [[961, 787]],
          8165: [[961, 788]],
          8166: [[965, 834]],
          8167: [[971, 834]],
          8168: [[933, 774]],
          8169: [[933, 772]],
          8170: [[933, 768]],
          8171: [[910]],
          8172: [[929, 788]],
          8173: [[168, 768]],
          8174: [[901]],
          8175: [[96]],
          8178: [[8060, 837]],
          8179: [[969, 837]],
          8180: [[974, 837]],
          8182: [[969, 834],, {
            837: 8183
          }],
          8183: [[8182, 837]],
          8184: [[927, 768]],
          8185: [[908]],
          8186: [[937, 768]],
          8187: [[911]],
          8188: [[937, 837]],
          8189: [[180]],
          8190: [[32, 788], 256, {
            768: 8157,
            769: 8158,
            834: 8159
          }]
        },
        8192: {
          8192: [[8194]],
          8193: [[8195]],
          8194: [[32], 256],
          8195: [[32], 256],
          8196: [[32], 256],
          8197: [[32], 256],
          8198: [[32], 256],
          8199: [[32], 256],
          8200: [[32], 256],
          8201: [[32], 256],
          8202: [[32], 256],
          8209: [[8208], 256],
          8215: [[32, 819], 256],
          8228: [[46], 256],
          8229: [[46, 46], 256],
          8230: [[46, 46, 46], 256],
          8239: [[32], 256],
          8243: [[8242, 8242], 256],
          8244: [[8242, 8242, 8242], 256],
          8246: [[8245, 8245], 256],
          8247: [[8245, 8245, 8245], 256],
          8252: [[33, 33], 256],
          8254: [[32, 773], 256],
          8263: [[63, 63], 256],
          8264: [[63, 33], 256],
          8265: [[33, 63], 256],
          8279: [[8242, 8242, 8242, 8242], 256],
          8287: [[32], 256],
          8304: [[48], 256],
          8305: [[105], 256],
          8308: [[52], 256],
          8309: [[53], 256],
          8310: [[54], 256],
          8311: [[55], 256],
          8312: [[56], 256],
          8313: [[57], 256],
          8314: [[43], 256],
          8315: [[8722], 256],
          8316: [[61], 256],
          8317: [[40], 256],
          8318: [[41], 256],
          8319: [[110], 256],
          8320: [[48], 256],
          8321: [[49], 256],
          8322: [[50], 256],
          8323: [[51], 256],
          8324: [[52], 256],
          8325: [[53], 256],
          8326: [[54], 256],
          8327: [[55], 256],
          8328: [[56], 256],
          8329: [[57], 256],
          8330: [[43], 256],
          8331: [[8722], 256],
          8332: [[61], 256],
          8333: [[40], 256],
          8334: [[41], 256],
          8336: [[97], 256],
          8337: [[101], 256],
          8338: [[111], 256],
          8339: [[120], 256],
          8340: [[601], 256],
          8341: [[104], 256],
          8342: [[107], 256],
          8343: [[108], 256],
          8344: [[109], 256],
          8345: [[110], 256],
          8346: [[112], 256],
          8347: [[115], 256],
          8348: [[116], 256],
          8360: [[82, 115], 256],
          8400: [, 230],
          8401: [, 230],
          8402: [, 1],
          8403: [, 1],
          8404: [, 230],
          8405: [, 230],
          8406: [, 230],
          8407: [, 230],
          8408: [, 1],
          8409: [, 1],
          8410: [, 1],
          8411: [, 230],
          8412: [, 230],
          8417: [, 230],
          8421: [, 1],
          8422: [, 1],
          8423: [, 230],
          8424: [, 220],
          8425: [, 230],
          8426: [, 1],
          8427: [, 1],
          8428: [, 220],
          8429: [, 220],
          8430: [, 220],
          8431: [, 220],
          8432: [, 230]
        },
        8448: {
          8448: [[97, 47, 99], 256],
          8449: [[97, 47, 115], 256],
          8450: [[67], 256],
          8451: [[176, 67], 256],
          8453: [[99, 47, 111], 256],
          8454: [[99, 47, 117], 256],
          8455: [[400], 256],
          8457: [[176, 70], 256],
          8458: [[103], 256],
          8459: [[72], 256],
          8460: [[72], 256],
          8461: [[72], 256],
          8462: [[104], 256],
          8463: [[295], 256],
          8464: [[73], 256],
          8465: [[73], 256],
          8466: [[76], 256],
          8467: [[108], 256],
          8469: [[78], 256],
          8470: [[78, 111], 256],
          8473: [[80], 256],
          8474: [[81], 256],
          8475: [[82], 256],
          8476: [[82], 256],
          8477: [[82], 256],
          8480: [[83, 77], 256],
          8481: [[84, 69, 76], 256],
          8482: [[84, 77], 256],
          8484: [[90], 256],
          8486: [[937]],
          8488: [[90], 256],
          8490: [[75]],
          8491: [[197]],
          8492: [[66], 256],
          8493: [[67], 256],
          8495: [[101], 256],
          8496: [[69], 256],
          8497: [[70], 256],
          8499: [[77], 256],
          8500: [[111], 256],
          8501: [[1488], 256],
          8502: [[1489], 256],
          8503: [[1490], 256],
          8504: [[1491], 256],
          8505: [[105], 256],
          8507: [[70, 65, 88], 256],
          8508: [[960], 256],
          8509: [[947], 256],
          8510: [[915], 256],
          8511: [[928], 256],
          8512: [[8721], 256],
          8517: [[68], 256],
          8518: [[100], 256],
          8519: [[101], 256],
          8520: [[105], 256],
          8521: [[106], 256],
          8528: [[49, 8260, 55], 256],
          8529: [[49, 8260, 57], 256],
          8530: [[49, 8260, 49, 48], 256],
          8531: [[49, 8260, 51], 256],
          8532: [[50, 8260, 51], 256],
          8533: [[49, 8260, 53], 256],
          8534: [[50, 8260, 53], 256],
          8535: [[51, 8260, 53], 256],
          8536: [[52, 8260, 53], 256],
          8537: [[49, 8260, 54], 256],
          8538: [[53, 8260, 54], 256],
          8539: [[49, 8260, 56], 256],
          8540: [[51, 8260, 56], 256],
          8541: [[53, 8260, 56], 256],
          8542: [[55, 8260, 56], 256],
          8543: [[49, 8260], 256],
          8544: [[73], 256],
          8545: [[73, 73], 256],
          8546: [[73, 73, 73], 256],
          8547: [[73, 86], 256],
          8548: [[86], 256],
          8549: [[86, 73], 256],
          8550: [[86, 73, 73], 256],
          8551: [[86, 73, 73, 73], 256],
          8552: [[73, 88], 256],
          8553: [[88], 256],
          8554: [[88, 73], 256],
          8555: [[88, 73, 73], 256],
          8556: [[76], 256],
          8557: [[67], 256],
          8558: [[68], 256],
          8559: [[77], 256],
          8560: [[105], 256],
          8561: [[105, 105], 256],
          8562: [[105, 105, 105], 256],
          8563: [[105, 118], 256],
          8564: [[118], 256],
          8565: [[118, 105], 256],
          8566: [[118, 105, 105], 256],
          8567: [[118, 105, 105, 105], 256],
          8568: [[105, 120], 256],
          8569: [[120], 256],
          8570: [[120, 105], 256],
          8571: [[120, 105, 105], 256],
          8572: [[108], 256],
          8573: [[99], 256],
          8574: [[100], 256],
          8575: [[109], 256],
          8585: [[48, 8260, 51], 256],
          8592: [,, {
            824: 8602
          }],
          8594: [,, {
            824: 8603
          }],
          8596: [,, {
            824: 8622
          }],
          8602: [[8592, 824]],
          8603: [[8594, 824]],
          8622: [[8596, 824]],
          8653: [[8656, 824]],
          8654: [[8660, 824]],
          8655: [[8658, 824]],
          8656: [,, {
            824: 8653
          }],
          8658: [,, {
            824: 8655
          }],
          8660: [,, {
            824: 8654
          }]
        },
        8704: {
          8707: [,, {
            824: 8708
          }],
          8708: [[8707, 824]],
          8712: [,, {
            824: 8713
          }],
          8713: [[8712, 824]],
          8715: [,, {
            824: 8716
          }],
          8716: [[8715, 824]],
          8739: [,, {
            824: 8740
          }],
          8740: [[8739, 824]],
          8741: [,, {
            824: 8742
          }],
          8742: [[8741, 824]],
          8748: [[8747, 8747], 256],
          8749: [[8747, 8747, 8747], 256],
          8751: [[8750, 8750], 256],
          8752: [[8750, 8750, 8750], 256],
          8764: [,, {
            824: 8769
          }],
          8769: [[8764, 824]],
          8771: [,, {
            824: 8772
          }],
          8772: [[8771, 824]],
          8773: [,, {
            824: 8775
          }],
          8775: [[8773, 824]],
          8776: [,, {
            824: 8777
          }],
          8777: [[8776, 824]],
          8781: [,, {
            824: 8813
          }],
          8800: [[61, 824]],
          8801: [,, {
            824: 8802
          }],
          8802: [[8801, 824]],
          8804: [,, {
            824: 8816
          }],
          8805: [,, {
            824: 8817
          }],
          8813: [[8781, 824]],
          8814: [[60, 824]],
          8815: [[62, 824]],
          8816: [[8804, 824]],
          8817: [[8805, 824]],
          8818: [,, {
            824: 8820
          }],
          8819: [,, {
            824: 8821
          }],
          8820: [[8818, 824]],
          8821: [[8819, 824]],
          8822: [,, {
            824: 8824
          }],
          8823: [,, {
            824: 8825
          }],
          8824: [[8822, 824]],
          8825: [[8823, 824]],
          8826: [,, {
            824: 8832
          }],
          8827: [,, {
            824: 8833
          }],
          8828: [,, {
            824: 8928
          }],
          8829: [,, {
            824: 8929
          }],
          8832: [[8826, 824]],
          8833: [[8827, 824]],
          8834: [,, {
            824: 8836
          }],
          8835: [,, {
            824: 8837
          }],
          8836: [[8834, 824]],
          8837: [[8835, 824]],
          8838: [,, {
            824: 8840
          }],
          8839: [,, {
            824: 8841
          }],
          8840: [[8838, 824]],
          8841: [[8839, 824]],
          8849: [,, {
            824: 8930
          }],
          8850: [,, {
            824: 8931
          }],
          8866: [,, {
            824: 8876
          }],
          8872: [,, {
            824: 8877
          }],
          8873: [,, {
            824: 8878
          }],
          8875: [,, {
            824: 8879
          }],
          8876: [[8866, 824]],
          8877: [[8872, 824]],
          8878: [[8873, 824]],
          8879: [[8875, 824]],
          8882: [,, {
            824: 8938
          }],
          8883: [,, {
            824: 8939
          }],
          8884: [,, {
            824: 8940
          }],
          8885: [,, {
            824: 8941
          }],
          8928: [[8828, 824]],
          8929: [[8829, 824]],
          8930: [[8849, 824]],
          8931: [[8850, 824]],
          8938: [[8882, 824]],
          8939: [[8883, 824]],
          8940: [[8884, 824]],
          8941: [[8885, 824]]
        },
        8960: {
          9001: [[12296]],
          9002: [[12297]]
        },
        9216: {
          9312: [[49], 256],
          9313: [[50], 256],
          9314: [[51], 256],
          9315: [[52], 256],
          9316: [[53], 256],
          9317: [[54], 256],
          9318: [[55], 256],
          9319: [[56], 256],
          9320: [[57], 256],
          9321: [[49, 48], 256],
          9322: [[49, 49], 256],
          9323: [[49, 50], 256],
          9324: [[49, 51], 256],
          9325: [[49, 52], 256],
          9326: [[49, 53], 256],
          9327: [[49, 54], 256],
          9328: [[49, 55], 256],
          9329: [[49, 56], 256],
          9330: [[49, 57], 256],
          9331: [[50, 48], 256],
          9332: [[40, 49, 41], 256],
          9333: [[40, 50, 41], 256],
          9334: [[40, 51, 41], 256],
          9335: [[40, 52, 41], 256],
          9336: [[40, 53, 41], 256],
          9337: [[40, 54, 41], 256],
          9338: [[40, 55, 41], 256],
          9339: [[40, 56, 41], 256],
          9340: [[40, 57, 41], 256],
          9341: [[40, 49, 48, 41], 256],
          9342: [[40, 49, 49, 41], 256],
          9343: [[40, 49, 50, 41], 256],
          9344: [[40, 49, 51, 41], 256],
          9345: [[40, 49, 52, 41], 256],
          9346: [[40, 49, 53, 41], 256],
          9347: [[40, 49, 54, 41], 256],
          9348: [[40, 49, 55, 41], 256],
          9349: [[40, 49, 56, 41], 256],
          9350: [[40, 49, 57, 41], 256],
          9351: [[40, 50, 48, 41], 256],
          9352: [[49, 46], 256],
          9353: [[50, 46], 256],
          9354: [[51, 46], 256],
          9355: [[52, 46], 256],
          9356: [[53, 46], 256],
          9357: [[54, 46], 256],
          9358: [[55, 46], 256],
          9359: [[56, 46], 256],
          9360: [[57, 46], 256],
          9361: [[49, 48, 46], 256],
          9362: [[49, 49, 46], 256],
          9363: [[49, 50, 46], 256],
          9364: [[49, 51, 46], 256],
          9365: [[49, 52, 46], 256],
          9366: [[49, 53, 46], 256],
          9367: [[49, 54, 46], 256],
          9368: [[49, 55, 46], 256],
          9369: [[49, 56, 46], 256],
          9370: [[49, 57, 46], 256],
          9371: [[50, 48, 46], 256],
          9372: [[40, 97, 41], 256],
          9373: [[40, 98, 41], 256],
          9374: [[40, 99, 41], 256],
          9375: [[40, 100, 41], 256],
          9376: [[40, 101, 41], 256],
          9377: [[40, 102, 41], 256],
          9378: [[40, 103, 41], 256],
          9379: [[40, 104, 41], 256],
          9380: [[40, 105, 41], 256],
          9381: [[40, 106, 41], 256],
          9382: [[40, 107, 41], 256],
          9383: [[40, 108, 41], 256],
          9384: [[40, 109, 41], 256],
          9385: [[40, 110, 41], 256],
          9386: [[40, 111, 41], 256],
          9387: [[40, 112, 41], 256],
          9388: [[40, 113, 41], 256],
          9389: [[40, 114, 41], 256],
          9390: [[40, 115, 41], 256],
          9391: [[40, 116, 41], 256],
          9392: [[40, 117, 41], 256],
          9393: [[40, 118, 41], 256],
          9394: [[40, 119, 41], 256],
          9395: [[40, 120, 41], 256],
          9396: [[40, 121, 41], 256],
          9397: [[40, 122, 41], 256],
          9398: [[65], 256],
          9399: [[66], 256],
          9400: [[67], 256],
          9401: [[68], 256],
          9402: [[69], 256],
          9403: [[70], 256],
          9404: [[71], 256],
          9405: [[72], 256],
          9406: [[73], 256],
          9407: [[74], 256],
          9408: [[75], 256],
          9409: [[76], 256],
          9410: [[77], 256],
          9411: [[78], 256],
          9412: [[79], 256],
          9413: [[80], 256],
          9414: [[81], 256],
          9415: [[82], 256],
          9416: [[83], 256],
          9417: [[84], 256],
          9418: [[85], 256],
          9419: [[86], 256],
          9420: [[87], 256],
          9421: [[88], 256],
          9422: [[89], 256],
          9423: [[90], 256],
          9424: [[97], 256],
          9425: [[98], 256],
          9426: [[99], 256],
          9427: [[100], 256],
          9428: [[101], 256],
          9429: [[102], 256],
          9430: [[103], 256],
          9431: [[104], 256],
          9432: [[105], 256],
          9433: [[106], 256],
          9434: [[107], 256],
          9435: [[108], 256],
          9436: [[109], 256],
          9437: [[110], 256],
          9438: [[111], 256],
          9439: [[112], 256],
          9440: [[113], 256],
          9441: [[114], 256],
          9442: [[115], 256],
          9443: [[116], 256],
          9444: [[117], 256],
          9445: [[118], 256],
          9446: [[119], 256],
          9447: [[120], 256],
          9448: [[121], 256],
          9449: [[122], 256],
          9450: [[48], 256]
        },
        10752: {
          10764: [[8747, 8747, 8747, 8747], 256],
          10868: [[58, 58, 61], 256],
          10869: [[61, 61], 256],
          10870: [[61, 61, 61], 256],
          10972: [[10973, 824], 512]
        },
        11264: {
          11388: [[106], 256],
          11389: [[86], 256],
          11503: [, 230],
          11504: [, 230],
          11505: [, 230]
        },
        11520: {
          11631: [[11617], 256],
          11647: [, 9],
          11744: [, 230],
          11745: [, 230],
          11746: [, 230],
          11747: [, 230],
          11748: [, 230],
          11749: [, 230],
          11750: [, 230],
          11751: [, 230],
          11752: [, 230],
          11753: [, 230],
          11754: [, 230],
          11755: [, 230],
          11756: [, 230],
          11757: [, 230],
          11758: [, 230],
          11759: [, 230],
          11760: [, 230],
          11761: [, 230],
          11762: [, 230],
          11763: [, 230],
          11764: [, 230],
          11765: [, 230],
          11766: [, 230],
          11767: [, 230],
          11768: [, 230],
          11769: [, 230],
          11770: [, 230],
          11771: [, 230],
          11772: [, 230],
          11773: [, 230],
          11774: [, 230],
          11775: [, 230]
        },
        11776: {
          11935: [[27597], 256],
          12019: [[40863], 256]
        },
        12032: {
          12032: [[19968], 256],
          12033: [[20008], 256],
          12034: [[20022], 256],
          12035: [[20031], 256],
          12036: [[20057], 256],
          12037: [[20101], 256],
          12038: [[20108], 256],
          12039: [[20128], 256],
          12040: [[20154], 256],
          12041: [[20799], 256],
          12042: [[20837], 256],
          12043: [[20843], 256],
          12044: [[20866], 256],
          12045: [[20886], 256],
          12046: [[20907], 256],
          12047: [[20960], 256],
          12048: [[20981], 256],
          12049: [[20992], 256],
          12050: [[21147], 256],
          12051: [[21241], 256],
          12052: [[21269], 256],
          12053: [[21274], 256],
          12054: [[21304], 256],
          12055: [[21313], 256],
          12056: [[21340], 256],
          12057: [[21353], 256],
          12058: [[21378], 256],
          12059: [[21430], 256],
          12060: [[21448], 256],
          12061: [[21475], 256],
          12062: [[22231], 256],
          12063: [[22303], 256],
          12064: [[22763], 256],
          12065: [[22786], 256],
          12066: [[22794], 256],
          12067: [[22805], 256],
          12068: [[22823], 256],
          12069: [[22899], 256],
          12070: [[23376], 256],
          12071: [[23424], 256],
          12072: [[23544], 256],
          12073: [[23567], 256],
          12074: [[23586], 256],
          12075: [[23608], 256],
          12076: [[23662], 256],
          12077: [[23665], 256],
          12078: [[24027], 256],
          12079: [[24037], 256],
          12080: [[24049], 256],
          12081: [[24062], 256],
          12082: [[24178], 256],
          12083: [[24186], 256],
          12084: [[24191], 256],
          12085: [[24308], 256],
          12086: [[24318], 256],
          12087: [[24331], 256],
          12088: [[24339], 256],
          12089: [[24400], 256],
          12090: [[24417], 256],
          12091: [[24435], 256],
          12092: [[24515], 256],
          12093: [[25096], 256],
          12094: [[25142], 256],
          12095: [[25163], 256],
          12096: [[25903], 256],
          12097: [[25908], 256],
          12098: [[25991], 256],
          12099: [[26007], 256],
          12100: [[26020], 256],
          12101: [[26041], 256],
          12102: [[26080], 256],
          12103: [[26085], 256],
          12104: [[26352], 256],
          12105: [[26376], 256],
          12106: [[26408], 256],
          12107: [[27424], 256],
          12108: [[27490], 256],
          12109: [[27513], 256],
          12110: [[27571], 256],
          12111: [[27595], 256],
          12112: [[27604], 256],
          12113: [[27611], 256],
          12114: [[27663], 256],
          12115: [[27668], 256],
          12116: [[27700], 256],
          12117: [[28779], 256],
          12118: [[29226], 256],
          12119: [[29238], 256],
          12120: [[29243], 256],
          12121: [[29247], 256],
          12122: [[29255], 256],
          12123: [[29273], 256],
          12124: [[29275], 256],
          12125: [[29356], 256],
          12126: [[29572], 256],
          12127: [[29577], 256],
          12128: [[29916], 256],
          12129: [[29926], 256],
          12130: [[29976], 256],
          12131: [[29983], 256],
          12132: [[29992], 256],
          12133: [[30000], 256],
          12134: [[30091], 256],
          12135: [[30098], 256],
          12136: [[30326], 256],
          12137: [[30333], 256],
          12138: [[30382], 256],
          12139: [[30399], 256],
          12140: [[30446], 256],
          12141: [[30683], 256],
          12142: [[30690], 256],
          12143: [[30707], 256],
          12144: [[31034], 256],
          12145: [[31160], 256],
          12146: [[31166], 256],
          12147: [[31348], 256],
          12148: [[31435], 256],
          12149: [[31481], 256],
          12150: [[31859], 256],
          12151: [[31992], 256],
          12152: [[32566], 256],
          12153: [[32593], 256],
          12154: [[32650], 256],
          12155: [[32701], 256],
          12156: [[32769], 256],
          12157: [[32780], 256],
          12158: [[32786], 256],
          12159: [[32819], 256],
          12160: [[32895], 256],
          12161: [[32905], 256],
          12162: [[33251], 256],
          12163: [[33258], 256],
          12164: [[33267], 256],
          12165: [[33276], 256],
          12166: [[33292], 256],
          12167: [[33307], 256],
          12168: [[33311], 256],
          12169: [[33390], 256],
          12170: [[33394], 256],
          12171: [[33400], 256],
          12172: [[34381], 256],
          12173: [[34411], 256],
          12174: [[34880], 256],
          12175: [[34892], 256],
          12176: [[34915], 256],
          12177: [[35198], 256],
          12178: [[35211], 256],
          12179: [[35282], 256],
          12180: [[35328], 256],
          12181: [[35895], 256],
          12182: [[35910], 256],
          12183: [[35925], 256],
          12184: [[35960], 256],
          12185: [[35997], 256],
          12186: [[36196], 256],
          12187: [[36208], 256],
          12188: [[36275], 256],
          12189: [[36523], 256],
          12190: [[36554], 256],
          12191: [[36763], 256],
          12192: [[36784], 256],
          12193: [[36789], 256],
          12194: [[37009], 256],
          12195: [[37193], 256],
          12196: [[37318], 256],
          12197: [[37324], 256],
          12198: [[37329], 256],
          12199: [[38263], 256],
          12200: [[38272], 256],
          12201: [[38428], 256],
          12202: [[38582], 256],
          12203: [[38585], 256],
          12204: [[38632], 256],
          12205: [[38737], 256],
          12206: [[38750], 256],
          12207: [[38754], 256],
          12208: [[38761], 256],
          12209: [[38859], 256],
          12210: [[38893], 256],
          12211: [[38899], 256],
          12212: [[38913], 256],
          12213: [[39080], 256],
          12214: [[39131], 256],
          12215: [[39135], 256],
          12216: [[39318], 256],
          12217: [[39321], 256],
          12218: [[39340], 256],
          12219: [[39592], 256],
          12220: [[39640], 256],
          12221: [[39647], 256],
          12222: [[39717], 256],
          12223: [[39727], 256],
          12224: [[39730], 256],
          12225: [[39740], 256],
          12226: [[39770], 256],
          12227: [[40165], 256],
          12228: [[40565], 256],
          12229: [[40575], 256],
          12230: [[40613], 256],
          12231: [[40635], 256],
          12232: [[40643], 256],
          12233: [[40653], 256],
          12234: [[40657], 256],
          12235: [[40697], 256],
          12236: [[40701], 256],
          12237: [[40718], 256],
          12238: [[40723], 256],
          12239: [[40736], 256],
          12240: [[40763], 256],
          12241: [[40778], 256],
          12242: [[40786], 256],
          12243: [[40845], 256],
          12244: [[40860], 256],
          12245: [[40864], 256]
        },
        12288: {
          12288: [[32], 256],
          12330: [, 218],
          12331: [, 228],
          12332: [, 232],
          12333: [, 222],
          12334: [, 224],
          12335: [, 224],
          12342: [[12306], 256],
          12344: [[21313], 256],
          12345: [[21316], 256],
          12346: [[21317], 256],
          12358: [,, {
            12441: 12436
          }],
          12363: [,, {
            12441: 12364
          }],
          12364: [[12363, 12441]],
          12365: [,, {
            12441: 12366
          }],
          12366: [[12365, 12441]],
          12367: [,, {
            12441: 12368
          }],
          12368: [[12367, 12441]],
          12369: [,, {
            12441: 12370
          }],
          12370: [[12369, 12441]],
          12371: [,, {
            12441: 12372
          }],
          12372: [[12371, 12441]],
          12373: [,, {
            12441: 12374
          }],
          12374: [[12373, 12441]],
          12375: [,, {
            12441: 12376
          }],
          12376: [[12375, 12441]],
          12377: [,, {
            12441: 12378
          }],
          12378: [[12377, 12441]],
          12379: [,, {
            12441: 12380
          }],
          12380: [[12379, 12441]],
          12381: [,, {
            12441: 12382
          }],
          12382: [[12381, 12441]],
          12383: [,, {
            12441: 12384
          }],
          12384: [[12383, 12441]],
          12385: [,, {
            12441: 12386
          }],
          12386: [[12385, 12441]],
          12388: [,, {
            12441: 12389
          }],
          12389: [[12388, 12441]],
          12390: [,, {
            12441: 12391
          }],
          12391: [[12390, 12441]],
          12392: [,, {
            12441: 12393
          }],
          12393: [[12392, 12441]],
          12399: [,, {
            12441: 12400,
            12442: 12401
          }],
          12400: [[12399, 12441]],
          12401: [[12399, 12442]],
          12402: [,, {
            12441: 12403,
            12442: 12404
          }],
          12403: [[12402, 12441]],
          12404: [[12402, 12442]],
          12405: [,, {
            12441: 12406,
            12442: 12407
          }],
          12406: [[12405, 12441]],
          12407: [[12405, 12442]],
          12408: [,, {
            12441: 12409,
            12442: 12410
          }],
          12409: [[12408, 12441]],
          12410: [[12408, 12442]],
          12411: [,, {
            12441: 12412,
            12442: 12413
          }],
          12412: [[12411, 12441]],
          12413: [[12411, 12442]],
          12436: [[12358, 12441]],
          12441: [, 8],
          12442: [, 8],
          12443: [[32, 12441], 256],
          12444: [[32, 12442], 256],
          12445: [,, {
            12441: 12446
          }],
          12446: [[12445, 12441]],
          12447: [[12424, 12426], 256],
          12454: [,, {
            12441: 12532
          }],
          12459: [,, {
            12441: 12460
          }],
          12460: [[12459, 12441]],
          12461: [,, {
            12441: 12462
          }],
          12462: [[12461, 12441]],
          12463: [,, {
            12441: 12464
          }],
          12464: [[12463, 12441]],
          12465: [,, {
            12441: 12466
          }],
          12466: [[12465, 12441]],
          12467: [,, {
            12441: 12468
          }],
          12468: [[12467, 12441]],
          12469: [,, {
            12441: 12470
          }],
          12470: [[12469, 12441]],
          12471: [,, {
            12441: 12472
          }],
          12472: [[12471, 12441]],
          12473: [,, {
            12441: 12474
          }],
          12474: [[12473, 12441]],
          12475: [,, {
            12441: 12476
          }],
          12476: [[12475, 12441]],
          12477: [,, {
            12441: 12478
          }],
          12478: [[12477, 12441]],
          12479: [,, {
            12441: 12480
          }],
          12480: [[12479, 12441]],
          12481: [,, {
            12441: 12482
          }],
          12482: [[12481, 12441]],
          12484: [,, {
            12441: 12485
          }],
          12485: [[12484, 12441]],
          12486: [,, {
            12441: 12487
          }],
          12487: [[12486, 12441]],
          12488: [,, {
            12441: 12489
          }],
          12489: [[12488, 12441]],
          12495: [,, {
            12441: 12496,
            12442: 12497
          }],
          12496: [[12495, 12441]],
          12497: [[12495, 12442]],
          12498: [,, {
            12441: 12499,
            12442: 12500
          }],
          12499: [[12498, 12441]],
          12500: [[12498, 12442]],
          12501: [,, {
            12441: 12502,
            12442: 12503
          }],
          12502: [[12501, 12441]],
          12503: [[12501, 12442]],
          12504: [,, {
            12441: 12505,
            12442: 12506
          }],
          12505: [[12504, 12441]],
          12506: [[12504, 12442]],
          12507: [,, {
            12441: 12508,
            12442: 12509
          }],
          12508: [[12507, 12441]],
          12509: [[12507, 12442]],
          12527: [,, {
            12441: 12535
          }],
          12528: [,, {
            12441: 12536
          }],
          12529: [,, {
            12441: 12537
          }],
          12530: [,, {
            12441: 12538
          }],
          12532: [[12454, 12441]],
          12535: [[12527, 12441]],
          12536: [[12528, 12441]],
          12537: [[12529, 12441]],
          12538: [[12530, 12441]],
          12541: [,, {
            12441: 12542
          }],
          12542: [[12541, 12441]],
          12543: [[12467, 12488], 256]
        },
        12544: {
          12593: [[4352], 256],
          12594: [[4353], 256],
          12595: [[4522], 256],
          12596: [[4354], 256],
          12597: [[4524], 256],
          12598: [[4525], 256],
          12599: [[4355], 256],
          12600: [[4356], 256],
          12601: [[4357], 256],
          12602: [[4528], 256],
          12603: [[4529], 256],
          12604: [[4530], 256],
          12605: [[4531], 256],
          12606: [[4532], 256],
          12607: [[4533], 256],
          12608: [[4378], 256],
          12609: [[4358], 256],
          12610: [[4359], 256],
          12611: [[4360], 256],
          12612: [[4385], 256],
          12613: [[4361], 256],
          12614: [[4362], 256],
          12615: [[4363], 256],
          12616: [[4364], 256],
          12617: [[4365], 256],
          12618: [[4366], 256],
          12619: [[4367], 256],
          12620: [[4368], 256],
          12621: [[4369], 256],
          12622: [[4370], 256],
          12623: [[4449], 256],
          12624: [[4450], 256],
          12625: [[4451], 256],
          12626: [[4452], 256],
          12627: [[4453], 256],
          12628: [[4454], 256],
          12629: [[4455], 256],
          12630: [[4456], 256],
          12631: [[4457], 256],
          12632: [[4458], 256],
          12633: [[4459], 256],
          12634: [[4460], 256],
          12635: [[4461], 256],
          12636: [[4462], 256],
          12637: [[4463], 256],
          12638: [[4464], 256],
          12639: [[4465], 256],
          12640: [[4466], 256],
          12641: [[4467], 256],
          12642: [[4468], 256],
          12643: [[4469], 256],
          12644: [[4448], 256],
          12645: [[4372], 256],
          12646: [[4373], 256],
          12647: [[4551], 256],
          12648: [[4552], 256],
          12649: [[4556], 256],
          12650: [[4558], 256],
          12651: [[4563], 256],
          12652: [[4567], 256],
          12653: [[4569], 256],
          12654: [[4380], 256],
          12655: [[4573], 256],
          12656: [[4575], 256],
          12657: [[4381], 256],
          12658: [[4382], 256],
          12659: [[4384], 256],
          12660: [[4386], 256],
          12661: [[4387], 256],
          12662: [[4391], 256],
          12663: [[4393], 256],
          12664: [[4395], 256],
          12665: [[4396], 256],
          12666: [[4397], 256],
          12667: [[4398], 256],
          12668: [[4399], 256],
          12669: [[4402], 256],
          12670: [[4406], 256],
          12671: [[4416], 256],
          12672: [[4423], 256],
          12673: [[4428], 256],
          12674: [[4593], 256],
          12675: [[4594], 256],
          12676: [[4439], 256],
          12677: [[4440], 256],
          12678: [[4441], 256],
          12679: [[4484], 256],
          12680: [[4485], 256],
          12681: [[4488], 256],
          12682: [[4497], 256],
          12683: [[4498], 256],
          12684: [[4500], 256],
          12685: [[4510], 256],
          12686: [[4513], 256],
          12690: [[19968], 256],
          12691: [[20108], 256],
          12692: [[19977], 256],
          12693: [[22235], 256],
          12694: [[19978], 256],
          12695: [[20013], 256],
          12696: [[19979], 256],
          12697: [[30002], 256],
          12698: [[20057], 256],
          12699: [[19993], 256],
          12700: [[19969], 256],
          12701: [[22825], 256],
          12702: [[22320], 256],
          12703: [[20154], 256]
        },
        12800: {
          12800: [[40, 4352, 41], 256],
          12801: [[40, 4354, 41], 256],
          12802: [[40, 4355, 41], 256],
          12803: [[40, 4357, 41], 256],
          12804: [[40, 4358, 41], 256],
          12805: [[40, 4359, 41], 256],
          12806: [[40, 4361, 41], 256],
          12807: [[40, 4363, 41], 256],
          12808: [[40, 4364, 41], 256],
          12809: [[40, 4366, 41], 256],
          12810: [[40, 4367, 41], 256],
          12811: [[40, 4368, 41], 256],
          12812: [[40, 4369, 41], 256],
          12813: [[40, 4370, 41], 256],
          12814: [[40, 4352, 4449, 41], 256],
          12815: [[40, 4354, 4449, 41], 256],
          12816: [[40, 4355, 4449, 41], 256],
          12817: [[40, 4357, 4449, 41], 256],
          12818: [[40, 4358, 4449, 41], 256],
          12819: [[40, 4359, 4449, 41], 256],
          12820: [[40, 4361, 4449, 41], 256],
          12821: [[40, 4363, 4449, 41], 256],
          12822: [[40, 4364, 4449, 41], 256],
          12823: [[40, 4366, 4449, 41], 256],
          12824: [[40, 4367, 4449, 41], 256],
          12825: [[40, 4368, 4449, 41], 256],
          12826: [[40, 4369, 4449, 41], 256],
          12827: [[40, 4370, 4449, 41], 256],
          12828: [[40, 4364, 4462, 41], 256],
          12829: [[40, 4363, 4457, 4364, 4453, 4523, 41], 256],
          12830: [[40, 4363, 4457, 4370, 4462, 41], 256],
          12832: [[40, 19968, 41], 256],
          12833: [[40, 20108, 41], 256],
          12834: [[40, 19977, 41], 256],
          12835: [[40, 22235, 41], 256],
          12836: [[40, 20116, 41], 256],
          12837: [[40, 20845, 41], 256],
          12838: [[40, 19971, 41], 256],
          12839: [[40, 20843, 41], 256],
          12840: [[40, 20061, 41], 256],
          12841: [[40, 21313, 41], 256],
          12842: [[40, 26376, 41], 256],
          12843: [[40, 28779, 41], 256],
          12844: [[40, 27700, 41], 256],
          12845: [[40, 26408, 41], 256],
          12846: [[40, 37329, 41], 256],
          12847: [[40, 22303, 41], 256],
          12848: [[40, 26085, 41], 256],
          12849: [[40, 26666, 41], 256],
          12850: [[40, 26377, 41], 256],
          12851: [[40, 31038, 41], 256],
          12852: [[40, 21517, 41], 256],
          12853: [[40, 29305, 41], 256],
          12854: [[40, 36001, 41], 256],
          12855: [[40, 31069, 41], 256],
          12856: [[40, 21172, 41], 256],
          12857: [[40, 20195, 41], 256],
          12858: [[40, 21628, 41], 256],
          12859: [[40, 23398, 41], 256],
          12860: [[40, 30435, 41], 256],
          12861: [[40, 20225, 41], 256],
          12862: [[40, 36039, 41], 256],
          12863: [[40, 21332, 41], 256],
          12864: [[40, 31085, 41], 256],
          12865: [[40, 20241, 41], 256],
          12866: [[40, 33258, 41], 256],
          12867: [[40, 33267, 41], 256],
          12868: [[21839], 256],
          12869: [[24188], 256],
          12870: [[25991], 256],
          12871: [[31631], 256],
          12880: [[80, 84, 69], 256],
          12881: [[50, 49], 256],
          12882: [[50, 50], 256],
          12883: [[50, 51], 256],
          12884: [[50, 52], 256],
          12885: [[50, 53], 256],
          12886: [[50, 54], 256],
          12887: [[50, 55], 256],
          12888: [[50, 56], 256],
          12889: [[50, 57], 256],
          12890: [[51, 48], 256],
          12891: [[51, 49], 256],
          12892: [[51, 50], 256],
          12893: [[51, 51], 256],
          12894: [[51, 52], 256],
          12895: [[51, 53], 256],
          12896: [[4352], 256],
          12897: [[4354], 256],
          12898: [[4355], 256],
          12899: [[4357], 256],
          12900: [[4358], 256],
          12901: [[4359], 256],
          12902: [[4361], 256],
          12903: [[4363], 256],
          12904: [[4364], 256],
          12905: [[4366], 256],
          12906: [[4367], 256],
          12907: [[4368], 256],
          12908: [[4369], 256],
          12909: [[4370], 256],
          12910: [[4352, 4449], 256],
          12911: [[4354, 4449], 256],
          12912: [[4355, 4449], 256],
          12913: [[4357, 4449], 256],
          12914: [[4358, 4449], 256],
          12915: [[4359, 4449], 256],
          12916: [[4361, 4449], 256],
          12917: [[4363, 4449], 256],
          12918: [[4364, 4449], 256],
          12919: [[4366, 4449], 256],
          12920: [[4367, 4449], 256],
          12921: [[4368, 4449], 256],
          12922: [[4369, 4449], 256],
          12923: [[4370, 4449], 256],
          12924: [[4366, 4449, 4535, 4352, 4457], 256],
          12925: [[4364, 4462, 4363, 4468], 256],
          12926: [[4363, 4462], 256],
          12928: [[19968], 256],
          12929: [[20108], 256],
          12930: [[19977], 256],
          12931: [[22235], 256],
          12932: [[20116], 256],
          12933: [[20845], 256],
          12934: [[19971], 256],
          12935: [[20843], 256],
          12936: [[20061], 256],
          12937: [[21313], 256],
          12938: [[26376], 256],
          12939: [[28779], 256],
          12940: [[27700], 256],
          12941: [[26408], 256],
          12942: [[37329], 256],
          12943: [[22303], 256],
          12944: [[26085], 256],
          12945: [[26666], 256],
          12946: [[26377], 256],
          12947: [[31038], 256],
          12948: [[21517], 256],
          12949: [[29305], 256],
          12950: [[36001], 256],
          12951: [[31069], 256],
          12952: [[21172], 256],
          12953: [[31192], 256],
          12954: [[30007], 256],
          12955: [[22899], 256],
          12956: [[36969], 256],
          12957: [[20778], 256],
          12958: [[21360], 256],
          12959: [[27880], 256],
          12960: [[38917], 256],
          12961: [[20241], 256],
          12962: [[20889], 256],
          12963: [[27491], 256],
          12964: [[19978], 256],
          12965: [[20013], 256],
          12966: [[19979], 256],
          12967: [[24038], 256],
          12968: [[21491], 256],
          12969: [[21307], 256],
          12970: [[23447], 256],
          12971: [[23398], 256],
          12972: [[30435], 256],
          12973: [[20225], 256],
          12974: [[36039], 256],
          12975: [[21332], 256],
          12976: [[22812], 256],
          12977: [[51, 54], 256],
          12978: [[51, 55], 256],
          12979: [[51, 56], 256],
          12980: [[51, 57], 256],
          12981: [[52, 48], 256],
          12982: [[52, 49], 256],
          12983: [[52, 50], 256],
          12984: [[52, 51], 256],
          12985: [[52, 52], 256],
          12986: [[52, 53], 256],
          12987: [[52, 54], 256],
          12988: [[52, 55], 256],
          12989: [[52, 56], 256],
          12990: [[52, 57], 256],
          12991: [[53, 48], 256],
          12992: [[49, 26376], 256],
          12993: [[50, 26376], 256],
          12994: [[51, 26376], 256],
          12995: [[52, 26376], 256],
          12996: [[53, 26376], 256],
          12997: [[54, 26376], 256],
          12998: [[55, 26376], 256],
          12999: [[56, 26376], 256],
          13000: [[57, 26376], 256],
          13001: [[49, 48, 26376], 256],
          13002: [[49, 49, 26376], 256],
          13003: [[49, 50, 26376], 256],
          13004: [[72, 103], 256],
          13005: [[101, 114, 103], 256],
          13006: [[101, 86], 256],
          13007: [[76, 84, 68], 256],
          13008: [[12450], 256],
          13009: [[12452], 256],
          13010: [[12454], 256],
          13011: [[12456], 256],
          13012: [[12458], 256],
          13013: [[12459], 256],
          13014: [[12461], 256],
          13015: [[12463], 256],
          13016: [[12465], 256],
          13017: [[12467], 256],
          13018: [[12469], 256],
          13019: [[12471], 256],
          13020: [[12473], 256],
          13021: [[12475], 256],
          13022: [[12477], 256],
          13023: [[12479], 256],
          13024: [[12481], 256],
          13025: [[12484], 256],
          13026: [[12486], 256],
          13027: [[12488], 256],
          13028: [[12490], 256],
          13029: [[12491], 256],
          13030: [[12492], 256],
          13031: [[12493], 256],
          13032: [[12494], 256],
          13033: [[12495], 256],
          13034: [[12498], 256],
          13035: [[12501], 256],
          13036: [[12504], 256],
          13037: [[12507], 256],
          13038: [[12510], 256],
          13039: [[12511], 256],
          13040: [[12512], 256],
          13041: [[12513], 256],
          13042: [[12514], 256],
          13043: [[12516], 256],
          13044: [[12518], 256],
          13045: [[12520], 256],
          13046: [[12521], 256],
          13047: [[12522], 256],
          13048: [[12523], 256],
          13049: [[12524], 256],
          13050: [[12525], 256],
          13051: [[12527], 256],
          13052: [[12528], 256],
          13053: [[12529], 256],
          13054: [[12530], 256]
        },
        13056: {
          13056: [[12450, 12497, 12540, 12488], 256],
          13057: [[12450, 12523, 12501, 12449], 256],
          13058: [[12450, 12531, 12506, 12450], 256],
          13059: [[12450, 12540, 12523], 256],
          13060: [[12452, 12491, 12531, 12464], 256],
          13061: [[12452, 12531, 12481], 256],
          13062: [[12454, 12457, 12531], 256],
          13063: [[12456, 12473, 12463, 12540, 12489], 256],
          13064: [[12456, 12540, 12459, 12540], 256],
          13065: [[12458, 12531, 12473], 256],
          13066: [[12458, 12540, 12512], 256],
          13067: [[12459, 12452, 12522], 256],
          13068: [[12459, 12521, 12483, 12488], 256],
          13069: [[12459, 12525, 12522, 12540], 256],
          13070: [[12460, 12525, 12531], 256],
          13071: [[12460, 12531, 12510], 256],
          13072: [[12462, 12460], 256],
          13073: [[12462, 12491, 12540], 256],
          13074: [[12461, 12517, 12522, 12540], 256],
          13075: [[12462, 12523, 12480, 12540], 256],
          13076: [[12461, 12525], 256],
          13077: [[12461, 12525, 12464, 12521, 12512], 256],
          13078: [[12461, 12525, 12513, 12540, 12488, 12523], 256],
          13079: [[12461, 12525, 12527, 12483, 12488], 256],
          13080: [[12464, 12521, 12512], 256],
          13081: [[12464, 12521, 12512, 12488, 12531], 256],
          13082: [[12463, 12523, 12476, 12452, 12525], 256],
          13083: [[12463, 12525, 12540, 12493], 256],
          13084: [[12465, 12540, 12473], 256],
          13085: [[12467, 12523, 12490], 256],
          13086: [[12467, 12540, 12509], 256],
          13087: [[12469, 12452, 12463, 12523], 256],
          13088: [[12469, 12531, 12481, 12540, 12512], 256],
          13089: [[12471, 12522, 12531, 12464], 256],
          13090: [[12475, 12531, 12481], 256],
          13091: [[12475, 12531, 12488], 256],
          13092: [[12480, 12540, 12473], 256],
          13093: [[12487, 12471], 256],
          13094: [[12489, 12523], 256],
          13095: [[12488, 12531], 256],
          13096: [[12490, 12494], 256],
          13097: [[12494, 12483, 12488], 256],
          13098: [[12495, 12452, 12484], 256],
          13099: [[12497, 12540, 12475, 12531, 12488], 256],
          13100: [[12497, 12540, 12484], 256],
          13101: [[12496, 12540, 12524, 12523], 256],
          13102: [[12500, 12450, 12473, 12488, 12523], 256],
          13103: [[12500, 12463, 12523], 256],
          13104: [[12500, 12467], 256],
          13105: [[12499, 12523], 256],
          13106: [[12501, 12449, 12521, 12483, 12489], 256],
          13107: [[12501, 12451, 12540, 12488], 256],
          13108: [[12502, 12483, 12471, 12455, 12523], 256],
          13109: [[12501, 12521, 12531], 256],
          13110: [[12504, 12463, 12479, 12540, 12523], 256],
          13111: [[12506, 12477], 256],
          13112: [[12506, 12491, 12498], 256],
          13113: [[12504, 12523, 12484], 256],
          13114: [[12506, 12531, 12473], 256],
          13115: [[12506, 12540, 12472], 256],
          13116: [[12505, 12540, 12479], 256],
          13117: [[12509, 12452, 12531, 12488], 256],
          13118: [[12508, 12523, 12488], 256],
          13119: [[12507, 12531], 256],
          13120: [[12509, 12531, 12489], 256],
          13121: [[12507, 12540, 12523], 256],
          13122: [[12507, 12540, 12531], 256],
          13123: [[12510, 12452, 12463, 12525], 256],
          13124: [[12510, 12452, 12523], 256],
          13125: [[12510, 12483, 12495], 256],
          13126: [[12510, 12523, 12463], 256],
          13127: [[12510, 12531, 12471, 12519, 12531], 256],
          13128: [[12511, 12463, 12525, 12531], 256],
          13129: [[12511, 12522], 256],
          13130: [[12511, 12522, 12496, 12540, 12523], 256],
          13131: [[12513, 12460], 256],
          13132: [[12513, 12460, 12488, 12531], 256],
          13133: [[12513, 12540, 12488, 12523], 256],
          13134: [[12516, 12540, 12489], 256],
          13135: [[12516, 12540, 12523], 256],
          13136: [[12518, 12450, 12531], 256],
          13137: [[12522, 12483, 12488, 12523], 256],
          13138: [[12522, 12521], 256],
          13139: [[12523, 12500, 12540], 256],
          13140: [[12523, 12540, 12502, 12523], 256],
          13141: [[12524, 12512], 256],
          13142: [[12524, 12531, 12488, 12466, 12531], 256],
          13143: [[12527, 12483, 12488], 256],
          13144: [[48, 28857], 256],
          13145: [[49, 28857], 256],
          13146: [[50, 28857], 256],
          13147: [[51, 28857], 256],
          13148: [[52, 28857], 256],
          13149: [[53, 28857], 256],
          13150: [[54, 28857], 256],
          13151: [[55, 28857], 256],
          13152: [[56, 28857], 256],
          13153: [[57, 28857], 256],
          13154: [[49, 48, 28857], 256],
          13155: [[49, 49, 28857], 256],
          13156: [[49, 50, 28857], 256],
          13157: [[49, 51, 28857], 256],
          13158: [[49, 52, 28857], 256],
          13159: [[49, 53, 28857], 256],
          13160: [[49, 54, 28857], 256],
          13161: [[49, 55, 28857], 256],
          13162: [[49, 56, 28857], 256],
          13163: [[49, 57, 28857], 256],
          13164: [[50, 48, 28857], 256],
          13165: [[50, 49, 28857], 256],
          13166: [[50, 50, 28857], 256],
          13167: [[50, 51, 28857], 256],
          13168: [[50, 52, 28857], 256],
          13169: [[104, 80, 97], 256],
          13170: [[100, 97], 256],
          13171: [[65, 85], 256],
          13172: [[98, 97, 114], 256],
          13173: [[111, 86], 256],
          13174: [[112, 99], 256],
          13175: [[100, 109], 256],
          13176: [[100, 109, 178], 256],
          13177: [[100, 109, 179], 256],
          13178: [[73, 85], 256],
          13179: [[24179, 25104], 256],
          13180: [[26157, 21644], 256],
          13181: [[22823, 27491], 256],
          13182: [[26126, 27835], 256],
          13183: [[26666, 24335, 20250, 31038], 256],
          13184: [[112, 65], 256],
          13185: [[110, 65], 256],
          13186: [[956, 65], 256],
          13187: [[109, 65], 256],
          13188: [[107, 65], 256],
          13189: [[75, 66], 256],
          13190: [[77, 66], 256],
          13191: [[71, 66], 256],
          13192: [[99, 97, 108], 256],
          13193: [[107, 99, 97, 108], 256],
          13194: [[112, 70], 256],
          13195: [[110, 70], 256],
          13196: [[956, 70], 256],
          13197: [[956, 103], 256],
          13198: [[109, 103], 256],
          13199: [[107, 103], 256],
          13200: [[72, 122], 256],
          13201: [[107, 72, 122], 256],
          13202: [[77, 72, 122], 256],
          13203: [[71, 72, 122], 256],
          13204: [[84, 72, 122], 256],
          13205: [[956, 8467], 256],
          13206: [[109, 8467], 256],
          13207: [[100, 8467], 256],
          13208: [[107, 8467], 256],
          13209: [[102, 109], 256],
          13210: [[110, 109], 256],
          13211: [[956, 109], 256],
          13212: [[109, 109], 256],
          13213: [[99, 109], 256],
          13214: [[107, 109], 256],
          13215: [[109, 109, 178], 256],
          13216: [[99, 109, 178], 256],
          13217: [[109, 178], 256],
          13218: [[107, 109, 178], 256],
          13219: [[109, 109, 179], 256],
          13220: [[99, 109, 179], 256],
          13221: [[109, 179], 256],
          13222: [[107, 109, 179], 256],
          13223: [[109, 8725, 115], 256],
          13224: [[109, 8725, 115, 178], 256],
          13225: [[80, 97], 256],
          13226: [[107, 80, 97], 256],
          13227: [[77, 80, 97], 256],
          13228: [[71, 80, 97], 256],
          13229: [[114, 97, 100], 256],
          13230: [[114, 97, 100, 8725, 115], 256],
          13231: [[114, 97, 100, 8725, 115, 178], 256],
          13232: [[112, 115], 256],
          13233: [[110, 115], 256],
          13234: [[956, 115], 256],
          13235: [[109, 115], 256],
          13236: [[112, 86], 256],
          13237: [[110, 86], 256],
          13238: [[956, 86], 256],
          13239: [[109, 86], 256],
          13240: [[107, 86], 256],
          13241: [[77, 86], 256],
          13242: [[112, 87], 256],
          13243: [[110, 87], 256],
          13244: [[956, 87], 256],
          13245: [[109, 87], 256],
          13246: [[107, 87], 256],
          13247: [[77, 87], 256],
          13248: [[107, 937], 256],
          13249: [[77, 937], 256],
          13250: [[97, 46, 109, 46], 256],
          13251: [[66, 113], 256],
          13252: [[99, 99], 256],
          13253: [[99, 100], 256],
          13254: [[67, 8725, 107, 103], 256],
          13255: [[67, 111, 46], 256],
          13256: [[100, 66], 256],
          13257: [[71, 121], 256],
          13258: [[104, 97], 256],
          13259: [[72, 80], 256],
          13260: [[105, 110], 256],
          13261: [[75, 75], 256],
          13262: [[75, 77], 256],
          13263: [[107, 116], 256],
          13264: [[108, 109], 256],
          13265: [[108, 110], 256],
          13266: [[108, 111, 103], 256],
          13267: [[108, 120], 256],
          13268: [[109, 98], 256],
          13269: [[109, 105, 108], 256],
          13270: [[109, 111, 108], 256],
          13271: [[80, 72], 256],
          13272: [[112, 46, 109, 46], 256],
          13273: [[80, 80, 77], 256],
          13274: [[80, 82], 256],
          13275: [[115, 114], 256],
          13276: [[83, 118], 256],
          13277: [[87, 98], 256],
          13278: [[86, 8725, 109], 256],
          13279: [[65, 8725, 109], 256],
          13280: [[49, 26085], 256],
          13281: [[50, 26085], 256],
          13282: [[51, 26085], 256],
          13283: [[52, 26085], 256],
          13284: [[53, 26085], 256],
          13285: [[54, 26085], 256],
          13286: [[55, 26085], 256],
          13287: [[56, 26085], 256],
          13288: [[57, 26085], 256],
          13289: [[49, 48, 26085], 256],
          13290: [[49, 49, 26085], 256],
          13291: [[49, 50, 26085], 256],
          13292: [[49, 51, 26085], 256],
          13293: [[49, 52, 26085], 256],
          13294: [[49, 53, 26085], 256],
          13295: [[49, 54, 26085], 256],
          13296: [[49, 55, 26085], 256],
          13297: [[49, 56, 26085], 256],
          13298: [[49, 57, 26085], 256],
          13299: [[50, 48, 26085], 256],
          13300: [[50, 49, 26085], 256],
          13301: [[50, 50, 26085], 256],
          13302: [[50, 51, 26085], 256],
          13303: [[50, 52, 26085], 256],
          13304: [[50, 53, 26085], 256],
          13305: [[50, 54, 26085], 256],
          13306: [[50, 55, 26085], 256],
          13307: [[50, 56, 26085], 256],
          13308: [[50, 57, 26085], 256],
          13309: [[51, 48, 26085], 256],
          13310: [[51, 49, 26085], 256],
          13311: [[103, 97, 108], 256]
        },
        27136: {
          92912: [, 1],
          92913: [, 1],
          92914: [, 1],
          92915: [, 1],
          92916: [, 1]
        },
        27392: {
          92976: [, 230],
          92977: [, 230],
          92978: [, 230],
          92979: [, 230],
          92980: [, 230],
          92981: [, 230],
          92982: [, 230]
        },
        42496: {
          42607: [, 230],
          42612: [, 230],
          42613: [, 230],
          42614: [, 230],
          42615: [, 230],
          42616: [, 230],
          42617: [, 230],
          42618: [, 230],
          42619: [, 230],
          42620: [, 230],
          42621: [, 230],
          42652: [[1098], 256],
          42653: [[1100], 256],
          42655: [, 230],
          42736: [, 230],
          42737: [, 230]
        },
        42752: {
          42864: [[42863], 256],
          43000: [[294], 256],
          43001: [[339], 256]
        },
        43008: {
          43014: [, 9],
          43204: [, 9],
          43232: [, 230],
          43233: [, 230],
          43234: [, 230],
          43235: [, 230],
          43236: [, 230],
          43237: [, 230],
          43238: [, 230],
          43239: [, 230],
          43240: [, 230],
          43241: [, 230],
          43242: [, 230],
          43243: [, 230],
          43244: [, 230],
          43245: [, 230],
          43246: [, 230],
          43247: [, 230],
          43248: [, 230],
          43249: [, 230]
        },
        43264: {
          43307: [, 220],
          43308: [, 220],
          43309: [, 220],
          43347: [, 9],
          43443: [, 7],
          43456: [, 9]
        },
        43520: {
          43696: [, 230],
          43698: [, 230],
          43699: [, 230],
          43700: [, 220],
          43703: [, 230],
          43704: [, 230],
          43710: [, 230],
          43711: [, 230],
          43713: [, 230],
          43766: [, 9]
        },
        43776: {
          43868: [[42791], 256],
          43869: [[43831], 256],
          43870: [[619], 256],
          43871: [[43858], 256],
          44013: [, 9]
        },
        48128: {
          113822: [, 1]
        },
        53504: {
          119134: [[119127, 119141], 512],
          119135: [[119128, 119141], 512],
          119136: [[119135, 119150], 512],
          119137: [[119135, 119151], 512],
          119138: [[119135, 119152], 512],
          119139: [[119135, 119153], 512],
          119140: [[119135, 119154], 512],
          119141: [, 216],
          119142: [, 216],
          119143: [, 1],
          119144: [, 1],
          119145: [, 1],
          119149: [, 226],
          119150: [, 216],
          119151: [, 216],
          119152: [, 216],
          119153: [, 216],
          119154: [, 216],
          119163: [, 220],
          119164: [, 220],
          119165: [, 220],
          119166: [, 220],
          119167: [, 220],
          119168: [, 220],
          119169: [, 220],
          119170: [, 220],
          119173: [, 230],
          119174: [, 230],
          119175: [, 230],
          119176: [, 230],
          119177: [, 230],
          119178: [, 220],
          119179: [, 220],
          119210: [, 230],
          119211: [, 230],
          119212: [, 230],
          119213: [, 230],
          119227: [[119225, 119141], 512],
          119228: [[119226, 119141], 512],
          119229: [[119227, 119150], 512],
          119230: [[119228, 119150], 512],
          119231: [[119227, 119151], 512],
          119232: [[119228, 119151], 512]
        },
        53760: {
          119362: [, 230],
          119363: [, 230],
          119364: [, 230]
        },
        54272: {
          119808: [[65], 256],
          119809: [[66], 256],
          119810: [[67], 256],
          119811: [[68], 256],
          119812: [[69], 256],
          119813: [[70], 256],
          119814: [[71], 256],
          119815: [[72], 256],
          119816: [[73], 256],
          119817: [[74], 256],
          119818: [[75], 256],
          119819: [[76], 256],
          119820: [[77], 256],
          119821: [[78], 256],
          119822: [[79], 256],
          119823: [[80], 256],
          119824: [[81], 256],
          119825: [[82], 256],
          119826: [[83], 256],
          119827: [[84], 256],
          119828: [[85], 256],
          119829: [[86], 256],
          119830: [[87], 256],
          119831: [[88], 256],
          119832: [[89], 256],
          119833: [[90], 256],
          119834: [[97], 256],
          119835: [[98], 256],
          119836: [[99], 256],
          119837: [[100], 256],
          119838: [[101], 256],
          119839: [[102], 256],
          119840: [[103], 256],
          119841: [[104], 256],
          119842: [[105], 256],
          119843: [[106], 256],
          119844: [[107], 256],
          119845: [[108], 256],
          119846: [[109], 256],
          119847: [[110], 256],
          119848: [[111], 256],
          119849: [[112], 256],
          119850: [[113], 256],
          119851: [[114], 256],
          119852: [[115], 256],
          119853: [[116], 256],
          119854: [[117], 256],
          119855: [[118], 256],
          119856: [[119], 256],
          119857: [[120], 256],
          119858: [[121], 256],
          119859: [[122], 256],
          119860: [[65], 256],
          119861: [[66], 256],
          119862: [[67], 256],
          119863: [[68], 256],
          119864: [[69], 256],
          119865: [[70], 256],
          119866: [[71], 256],
          119867: [[72], 256],
          119868: [[73], 256],
          119869: [[74], 256],
          119870: [[75], 256],
          119871: [[76], 256],
          119872: [[77], 256],
          119873: [[78], 256],
          119874: [[79], 256],
          119875: [[80], 256],
          119876: [[81], 256],
          119877: [[82], 256],
          119878: [[83], 256],
          119879: [[84], 256],
          119880: [[85], 256],
          119881: [[86], 256],
          119882: [[87], 256],
          119883: [[88], 256],
          119884: [[89], 256],
          119885: [[90], 256],
          119886: [[97], 256],
          119887: [[98], 256],
          119888: [[99], 256],
          119889: [[100], 256],
          119890: [[101], 256],
          119891: [[102], 256],
          119892: [[103], 256],
          119894: [[105], 256],
          119895: [[106], 256],
          119896: [[107], 256],
          119897: [[108], 256],
          119898: [[109], 256],
          119899: [[110], 256],
          119900: [[111], 256],
          119901: [[112], 256],
          119902: [[113], 256],
          119903: [[114], 256],
          119904: [[115], 256],
          119905: [[116], 256],
          119906: [[117], 256],
          119907: [[118], 256],
          119908: [[119], 256],
          119909: [[120], 256],
          119910: [[121], 256],
          119911: [[122], 256],
          119912: [[65], 256],
          119913: [[66], 256],
          119914: [[67], 256],
          119915: [[68], 256],
          119916: [[69], 256],
          119917: [[70], 256],
          119918: [[71], 256],
          119919: [[72], 256],
          119920: [[73], 256],
          119921: [[74], 256],
          119922: [[75], 256],
          119923: [[76], 256],
          119924: [[77], 256],
          119925: [[78], 256],
          119926: [[79], 256],
          119927: [[80], 256],
          119928: [[81], 256],
          119929: [[82], 256],
          119930: [[83], 256],
          119931: [[84], 256],
          119932: [[85], 256],
          119933: [[86], 256],
          119934: [[87], 256],
          119935: [[88], 256],
          119936: [[89], 256],
          119937: [[90], 256],
          119938: [[97], 256],
          119939: [[98], 256],
          119940: [[99], 256],
          119941: [[100], 256],
          119942: [[101], 256],
          119943: [[102], 256],
          119944: [[103], 256],
          119945: [[104], 256],
          119946: [[105], 256],
          119947: [[106], 256],
          119948: [[107], 256],
          119949: [[108], 256],
          119950: [[109], 256],
          119951: [[110], 256],
          119952: [[111], 256],
          119953: [[112], 256],
          119954: [[113], 256],
          119955: [[114], 256],
          119956: [[115], 256],
          119957: [[116], 256],
          119958: [[117], 256],
          119959: [[118], 256],
          119960: [[119], 256],
          119961: [[120], 256],
          119962: [[121], 256],
          119963: [[122], 256],
          119964: [[65], 256],
          119966: [[67], 256],
          119967: [[68], 256],
          119970: [[71], 256],
          119973: [[74], 256],
          119974: [[75], 256],
          119977: [[78], 256],
          119978: [[79], 256],
          119979: [[80], 256],
          119980: [[81], 256],
          119982: [[83], 256],
          119983: [[84], 256],
          119984: [[85], 256],
          119985: [[86], 256],
          119986: [[87], 256],
          119987: [[88], 256],
          119988: [[89], 256],
          119989: [[90], 256],
          119990: [[97], 256],
          119991: [[98], 256],
          119992: [[99], 256],
          119993: [[100], 256],
          119995: [[102], 256],
          119997: [[104], 256],
          119998: [[105], 256],
          119999: [[106], 256],
          120000: [[107], 256],
          120001: [[108], 256],
          120002: [[109], 256],
          120003: [[110], 256],
          120005: [[112], 256],
          120006: [[113], 256],
          120007: [[114], 256],
          120008: [[115], 256],
          120009: [[116], 256],
          120010: [[117], 256],
          120011: [[118], 256],
          120012: [[119], 256],
          120013: [[120], 256],
          120014: [[121], 256],
          120015: [[122], 256],
          120016: [[65], 256],
          120017: [[66], 256],
          120018: [[67], 256],
          120019: [[68], 256],
          120020: [[69], 256],
          120021: [[70], 256],
          120022: [[71], 256],
          120023: [[72], 256],
          120024: [[73], 256],
          120025: [[74], 256],
          120026: [[75], 256],
          120027: [[76], 256],
          120028: [[77], 256],
          120029: [[78], 256],
          120030: [[79], 256],
          120031: [[80], 256],
          120032: [[81], 256],
          120033: [[82], 256],
          120034: [[83], 256],
          120035: [[84], 256],
          120036: [[85], 256],
          120037: [[86], 256],
          120038: [[87], 256],
          120039: [[88], 256],
          120040: [[89], 256],
          120041: [[90], 256],
          120042: [[97], 256],
          120043: [[98], 256],
          120044: [[99], 256],
          120045: [[100], 256],
          120046: [[101], 256],
          120047: [[102], 256],
          120048: [[103], 256],
          120049: [[104], 256],
          120050: [[105], 256],
          120051: [[106], 256],
          120052: [[107], 256],
          120053: [[108], 256],
          120054: [[109], 256],
          120055: [[110], 256],
          120056: [[111], 256],
          120057: [[112], 256],
          120058: [[113], 256],
          120059: [[114], 256],
          120060: [[115], 256],
          120061: [[116], 256],
          120062: [[117], 256],
          120063: [[118], 256]
        },
        54528: {
          120064: [[119], 256],
          120065: [[120], 256],
          120066: [[121], 256],
          120067: [[122], 256],
          120068: [[65], 256],
          120069: [[66], 256],
          120071: [[68], 256],
          120072: [[69], 256],
          120073: [[70], 256],
          120074: [[71], 256],
          120077: [[74], 256],
          120078: [[75], 256],
          120079: [[76], 256],
          120080: [[77], 256],
          120081: [[78], 256],
          120082: [[79], 256],
          120083: [[80], 256],
          120084: [[81], 256],
          120086: [[83], 256],
          120087: [[84], 256],
          120088: [[85], 256],
          120089: [[86], 256],
          120090: [[87], 256],
          120091: [[88], 256],
          120092: [[89], 256],
          120094: [[97], 256],
          120095: [[98], 256],
          120096: [[99], 256],
          120097: [[100], 256],
          120098: [[101], 256],
          120099: [[102], 256],
          120100: [[103], 256],
          120101: [[104], 256],
          120102: [[105], 256],
          120103: [[106], 256],
          120104: [[107], 256],
          120105: [[108], 256],
          120106: [[109], 256],
          120107: [[110], 256],
          120108: [[111], 256],
          120109: [[112], 256],
          120110: [[113], 256],
          120111: [[114], 256],
          120112: [[115], 256],
          120113: [[116], 256],
          120114: [[117], 256],
          120115: [[118], 256],
          120116: [[119], 256],
          120117: [[120], 256],
          120118: [[121], 256],
          120119: [[122], 256],
          120120: [[65], 256],
          120121: [[66], 256],
          120123: [[68], 256],
          120124: [[69], 256],
          120125: [[70], 256],
          120126: [[71], 256],
          120128: [[73], 256],
          120129: [[74], 256],
          120130: [[75], 256],
          120131: [[76], 256],
          120132: [[77], 256],
          120134: [[79], 256],
          120138: [[83], 256],
          120139: [[84], 256],
          120140: [[85], 256],
          120141: [[86], 256],
          120142: [[87], 256],
          120143: [[88], 256],
          120144: [[89], 256],
          120146: [[97], 256],
          120147: [[98], 256],
          120148: [[99], 256],
          120149: [[100], 256],
          120150: [[101], 256],
          120151: [[102], 256],
          120152: [[103], 256],
          120153: [[104], 256],
          120154: [[105], 256],
          120155: [[106], 256],
          120156: [[107], 256],
          120157: [[108], 256],
          120158: [[109], 256],
          120159: [[110], 256],
          120160: [[111], 256],
          120161: [[112], 256],
          120162: [[113], 256],
          120163: [[114], 256],
          120164: [[115], 256],
          120165: [[116], 256],
          120166: [[117], 256],
          120167: [[118], 256],
          120168: [[119], 256],
          120169: [[120], 256],
          120170: [[121], 256],
          120171: [[122], 256],
          120172: [[65], 256],
          120173: [[66], 256],
          120174: [[67], 256],
          120175: [[68], 256],
          120176: [[69], 256],
          120177: [[70], 256],
          120178: [[71], 256],
          120179: [[72], 256],
          120180: [[73], 256],
          120181: [[74], 256],
          120182: [[75], 256],
          120183: [[76], 256],
          120184: [[77], 256],
          120185: [[78], 256],
          120186: [[79], 256],
          120187: [[80], 256],
          120188: [[81], 256],
          120189: [[82], 256],
          120190: [[83], 256],
          120191: [[84], 256],
          120192: [[85], 256],
          120193: [[86], 256],
          120194: [[87], 256],
          120195: [[88], 256],
          120196: [[89], 256],
          120197: [[90], 256],
          120198: [[97], 256],
          120199: [[98], 256],
          120200: [[99], 256],
          120201: [[100], 256],
          120202: [[101], 256],
          120203: [[102], 256],
          120204: [[103], 256],
          120205: [[104], 256],
          120206: [[105], 256],
          120207: [[106], 256],
          120208: [[107], 256],
          120209: [[108], 256],
          120210: [[109], 256],
          120211: [[110], 256],
          120212: [[111], 256],
          120213: [[112], 256],
          120214: [[113], 256],
          120215: [[114], 256],
          120216: [[115], 256],
          120217: [[116], 256],
          120218: [[117], 256],
          120219: [[118], 256],
          120220: [[119], 256],
          120221: [[120], 256],
          120222: [[121], 256],
          120223: [[122], 256],
          120224: [[65], 256],
          120225: [[66], 256],
          120226: [[67], 256],
          120227: [[68], 256],
          120228: [[69], 256],
          120229: [[70], 256],
          120230: [[71], 256],
          120231: [[72], 256],
          120232: [[73], 256],
          120233: [[74], 256],
          120234: [[75], 256],
          120235: [[76], 256],
          120236: [[77], 256],
          120237: [[78], 256],
          120238: [[79], 256],
          120239: [[80], 256],
          120240: [[81], 256],
          120241: [[82], 256],
          120242: [[83], 256],
          120243: [[84], 256],
          120244: [[85], 256],
          120245: [[86], 256],
          120246: [[87], 256],
          120247: [[88], 256],
          120248: [[89], 256],
          120249: [[90], 256],
          120250: [[97], 256],
          120251: [[98], 256],
          120252: [[99], 256],
          120253: [[100], 256],
          120254: [[101], 256],
          120255: [[102], 256],
          120256: [[103], 256],
          120257: [[104], 256],
          120258: [[105], 256],
          120259: [[106], 256],
          120260: [[107], 256],
          120261: [[108], 256],
          120262: [[109], 256],
          120263: [[110], 256],
          120264: [[111], 256],
          120265: [[112], 256],
          120266: [[113], 256],
          120267: [[114], 256],
          120268: [[115], 256],
          120269: [[116], 256],
          120270: [[117], 256],
          120271: [[118], 256],
          120272: [[119], 256],
          120273: [[120], 256],
          120274: [[121], 256],
          120275: [[122], 256],
          120276: [[65], 256],
          120277: [[66], 256],
          120278: [[67], 256],
          120279: [[68], 256],
          120280: [[69], 256],
          120281: [[70], 256],
          120282: [[71], 256],
          120283: [[72], 256],
          120284: [[73], 256],
          120285: [[74], 256],
          120286: [[75], 256],
          120287: [[76], 256],
          120288: [[77], 256],
          120289: [[78], 256],
          120290: [[79], 256],
          120291: [[80], 256],
          120292: [[81], 256],
          120293: [[82], 256],
          120294: [[83], 256],
          120295: [[84], 256],
          120296: [[85], 256],
          120297: [[86], 256],
          120298: [[87], 256],
          120299: [[88], 256],
          120300: [[89], 256],
          120301: [[90], 256],
          120302: [[97], 256],
          120303: [[98], 256],
          120304: [[99], 256],
          120305: [[100], 256],
          120306: [[101], 256],
          120307: [[102], 256],
          120308: [[103], 256],
          120309: [[104], 256],
          120310: [[105], 256],
          120311: [[106], 256],
          120312: [[107], 256],
          120313: [[108], 256],
          120314: [[109], 256],
          120315: [[110], 256],
          120316: [[111], 256],
          120317: [[112], 256],
          120318: [[113], 256],
          120319: [[114], 256]
        },
        54784: {
          120320: [[115], 256],
          120321: [[116], 256],
          120322: [[117], 256],
          120323: [[118], 256],
          120324: [[119], 256],
          120325: [[120], 256],
          120326: [[121], 256],
          120327: [[122], 256],
          120328: [[65], 256],
          120329: [[66], 256],
          120330: [[67], 256],
          120331: [[68], 256],
          120332: [[69], 256],
          120333: [[70], 256],
          120334: [[71], 256],
          120335: [[72], 256],
          120336: [[73], 256],
          120337: [[74], 256],
          120338: [[75], 256],
          120339: [[76], 256],
          120340: [[77], 256],
          120341: [[78], 256],
          120342: [[79], 256],
          120343: [[80], 256],
          120344: [[81], 256],
          120345: [[82], 256],
          120346: [[83], 256],
          120347: [[84], 256],
          120348: [[85], 256],
          120349: [[86], 256],
          120350: [[87], 256],
          120351: [[88], 256],
          120352: [[89], 256],
          120353: [[90], 256],
          120354: [[97], 256],
          120355: [[98], 256],
          120356: [[99], 256],
          120357: [[100], 256],
          120358: [[101], 256],
          120359: [[102], 256],
          120360: [[103], 256],
          120361: [[104], 256],
          120362: [[105], 256],
          120363: [[106], 256],
          120364: [[107], 256],
          120365: [[108], 256],
          120366: [[109], 256],
          120367: [[110], 256],
          120368: [[111], 256],
          120369: [[112], 256],
          120370: [[113], 256],
          120371: [[114], 256],
          120372: [[115], 256],
          120373: [[116], 256],
          120374: [[117], 256],
          120375: [[118], 256],
          120376: [[119], 256],
          120377: [[120], 256],
          120378: [[121], 256],
          120379: [[122], 256],
          120380: [[65], 256],
          120381: [[66], 256],
          120382: [[67], 256],
          120383: [[68], 256],
          120384: [[69], 256],
          120385: [[70], 256],
          120386: [[71], 256],
          120387: [[72], 256],
          120388: [[73], 256],
          120389: [[74], 256],
          120390: [[75], 256],
          120391: [[76], 256],
          120392: [[77], 256],
          120393: [[78], 256],
          120394: [[79], 256],
          120395: [[80], 256],
          120396: [[81], 256],
          120397: [[82], 256],
          120398: [[83], 256],
          120399: [[84], 256],
          120400: [[85], 256],
          120401: [[86], 256],
          120402: [[87], 256],
          120403: [[88], 256],
          120404: [[89], 256],
          120405: [[90], 256],
          120406: [[97], 256],
          120407: [[98], 256],
          120408: [[99], 256],
          120409: [[100], 256],
          120410: [[101], 256],
          120411: [[102], 256],
          120412: [[103], 256],
          120413: [[104], 256],
          120414: [[105], 256],
          120415: [[106], 256],
          120416: [[107], 256],
          120417: [[108], 256],
          120418: [[109], 256],
          120419: [[110], 256],
          120420: [[111], 256],
          120421: [[112], 256],
          120422: [[113], 256],
          120423: [[114], 256],
          120424: [[115], 256],
          120425: [[116], 256],
          120426: [[117], 256],
          120427: [[118], 256],
          120428: [[119], 256],
          120429: [[120], 256],
          120430: [[121], 256],
          120431: [[122], 256],
          120432: [[65], 256],
          120433: [[66], 256],
          120434: [[67], 256],
          120435: [[68], 256],
          120436: [[69], 256],
          120437: [[70], 256],
          120438: [[71], 256],
          120439: [[72], 256],
          120440: [[73], 256],
          120441: [[74], 256],
          120442: [[75], 256],
          120443: [[76], 256],
          120444: [[77], 256],
          120445: [[78], 256],
          120446: [[79], 256],
          120447: [[80], 256],
          120448: [[81], 256],
          120449: [[82], 256],
          120450: [[83], 256],
          120451: [[84], 256],
          120452: [[85], 256],
          120453: [[86], 256],
          120454: [[87], 256],
          120455: [[88], 256],
          120456: [[89], 256],
          120457: [[90], 256],
          120458: [[97], 256],
          120459: [[98], 256],
          120460: [[99], 256],
          120461: [[100], 256],
          120462: [[101], 256],
          120463: [[102], 256],
          120464: [[103], 256],
          120465: [[104], 256],
          120466: [[105], 256],
          120467: [[106], 256],
          120468: [[107], 256],
          120469: [[108], 256],
          120470: [[109], 256],
          120471: [[110], 256],
          120472: [[111], 256],
          120473: [[112], 256],
          120474: [[113], 256],
          120475: [[114], 256],
          120476: [[115], 256],
          120477: [[116], 256],
          120478: [[117], 256],
          120479: [[118], 256],
          120480: [[119], 256],
          120481: [[120], 256],
          120482: [[121], 256],
          120483: [[122], 256],
          120484: [[305], 256],
          120485: [[567], 256],
          120488: [[913], 256],
          120489: [[914], 256],
          120490: [[915], 256],
          120491: [[916], 256],
          120492: [[917], 256],
          120493: [[918], 256],
          120494: [[919], 256],
          120495: [[920], 256],
          120496: [[921], 256],
          120497: [[922], 256],
          120498: [[923], 256],
          120499: [[924], 256],
          120500: [[925], 256],
          120501: [[926], 256],
          120502: [[927], 256],
          120503: [[928], 256],
          120504: [[929], 256],
          120505: [[1012], 256],
          120506: [[931], 256],
          120507: [[932], 256],
          120508: [[933], 256],
          120509: [[934], 256],
          120510: [[935], 256],
          120511: [[936], 256],
          120512: [[937], 256],
          120513: [[8711], 256],
          120514: [[945], 256],
          120515: [[946], 256],
          120516: [[947], 256],
          120517: [[948], 256],
          120518: [[949], 256],
          120519: [[950], 256],
          120520: [[951], 256],
          120521: [[952], 256],
          120522: [[953], 256],
          120523: [[954], 256],
          120524: [[955], 256],
          120525: [[956], 256],
          120526: [[957], 256],
          120527: [[958], 256],
          120528: [[959], 256],
          120529: [[960], 256],
          120530: [[961], 256],
          120531: [[962], 256],
          120532: [[963], 256],
          120533: [[964], 256],
          120534: [[965], 256],
          120535: [[966], 256],
          120536: [[967], 256],
          120537: [[968], 256],
          120538: [[969], 256],
          120539: [[8706], 256],
          120540: [[1013], 256],
          120541: [[977], 256],
          120542: [[1008], 256],
          120543: [[981], 256],
          120544: [[1009], 256],
          120545: [[982], 256],
          120546: [[913], 256],
          120547: [[914], 256],
          120548: [[915], 256],
          120549: [[916], 256],
          120550: [[917], 256],
          120551: [[918], 256],
          120552: [[919], 256],
          120553: [[920], 256],
          120554: [[921], 256],
          120555: [[922], 256],
          120556: [[923], 256],
          120557: [[924], 256],
          120558: [[925], 256],
          120559: [[926], 256],
          120560: [[927], 256],
          120561: [[928], 256],
          120562: [[929], 256],
          120563: [[1012], 256],
          120564: [[931], 256],
          120565: [[932], 256],
          120566: [[933], 256],
          120567: [[934], 256],
          120568: [[935], 256],
          120569: [[936], 256],
          120570: [[937], 256],
          120571: [[8711], 256],
          120572: [[945], 256],
          120573: [[946], 256],
          120574: [[947], 256],
          120575: [[948], 256]
        },
        55040: {
          120576: [[949], 256],
          120577: [[950], 256],
          120578: [[951], 256],
          120579: [[952], 256],
          120580: [[953], 256],
          120581: [[954], 256],
          120582: [[955], 256],
          120583: [[956], 256],
          120584: [[957], 256],
          120585: [[958], 256],
          120586: [[959], 256],
          120587: [[960], 256],
          120588: [[961], 256],
          120589: [[962], 256],
          120590: [[963], 256],
          120591: [[964], 256],
          120592: [[965], 256],
          120593: [[966], 256],
          120594: [[967], 256],
          120595: [[968], 256],
          120596: [[969], 256],
          120597: [[8706], 256],
          120598: [[1013], 256],
          120599: [[977], 256],
          120600: [[1008], 256],
          120601: [[981], 256],
          120602: [[1009], 256],
          120603: [[982], 256],
          120604: [[913], 256],
          120605: [[914], 256],
          120606: [[915], 256],
          120607: [[916], 256],
          120608: [[917], 256],
          120609: [[918], 256],
          120610: [[919], 256],
          120611: [[920], 256],
          120612: [[921], 256],
          120613: [[922], 256],
          120614: [[923], 256],
          120615: [[924], 256],
          120616: [[925], 256],
          120617: [[926], 256],
          120618: [[927], 256],
          120619: [[928], 256],
          120620: [[929], 256],
          120621: [[1012], 256],
          120622: [[931], 256],
          120623: [[932], 256],
          120624: [[933], 256],
          120625: [[934], 256],
          120626: [[935], 256],
          120627: [[936], 256],
          120628: [[937], 256],
          120629: [[8711], 256],
          120630: [[945], 256],
          120631: [[946], 256],
          120632: [[947], 256],
          120633: [[948], 256],
          120634: [[949], 256],
          120635: [[950], 256],
          120636: [[951], 256],
          120637: [[952], 256],
          120638: [[953], 256],
          120639: [[954], 256],
          120640: [[955], 256],
          120641: [[956], 256],
          120642: [[957], 256],
          120643: [[958], 256],
          120644: [[959], 256],
          120645: [[960], 256],
          120646: [[961], 256],
          120647: [[962], 256],
          120648: [[963], 256],
          120649: [[964], 256],
          120650: [[965], 256],
          120651: [[966], 256],
          120652: [[967], 256],
          120653: [[968], 256],
          120654: [[969], 256],
          120655: [[8706], 256],
          120656: [[1013], 256],
          120657: [[977], 256],
          120658: [[1008], 256],
          120659: [[981], 256],
          120660: [[1009], 256],
          120661: [[982], 256],
          120662: [[913], 256],
          120663: [[914], 256],
          120664: [[915], 256],
          120665: [[916], 256],
          120666: [[917], 256],
          120667: [[918], 256],
          120668: [[919], 256],
          120669: [[920], 256],
          120670: [[921], 256],
          120671: [[922], 256],
          120672: [[923], 256],
          120673: [[924], 256],
          120674: [[925], 256],
          120675: [[926], 256],
          120676: [[927], 256],
          120677: [[928], 256],
          120678: [[929], 256],
          120679: [[1012], 256],
          120680: [[931], 256],
          120681: [[932], 256],
          120682: [[933], 256],
          120683: [[934], 256],
          120684: [[935], 256],
          120685: [[936], 256],
          120686: [[937], 256],
          120687: [[8711], 256],
          120688: [[945], 256],
          120689: [[946], 256],
          120690: [[947], 256],
          120691: [[948], 256],
          120692: [[949], 256],
          120693: [[950], 256],
          120694: [[951], 256],
          120695: [[952], 256],
          120696: [[953], 256],
          120697: [[954], 256],
          120698: [[955], 256],
          120699: [[956], 256],
          120700: [[957], 256],
          120701: [[958], 256],
          120702: [[959], 256],
          120703: [[960], 256],
          120704: [[961], 256],
          120705: [[962], 256],
          120706: [[963], 256],
          120707: [[964], 256],
          120708: [[965], 256],
          120709: [[966], 256],
          120710: [[967], 256],
          120711: [[968], 256],
          120712: [[969], 256],
          120713: [[8706], 256],
          120714: [[1013], 256],
          120715: [[977], 256],
          120716: [[1008], 256],
          120717: [[981], 256],
          120718: [[1009], 256],
          120719: [[982], 256],
          120720: [[913], 256],
          120721: [[914], 256],
          120722: [[915], 256],
          120723: [[916], 256],
          120724: [[917], 256],
          120725: [[918], 256],
          120726: [[919], 256],
          120727: [[920], 256],
          120728: [[921], 256],
          120729: [[922], 256],
          120730: [[923], 256],
          120731: [[924], 256],
          120732: [[925], 256],
          120733: [[926], 256],
          120734: [[927], 256],
          120735: [[928], 256],
          120736: [[929], 256],
          120737: [[1012], 256],
          120738: [[931], 256],
          120739: [[932], 256],
          120740: [[933], 256],
          120741: [[934], 256],
          120742: [[935], 256],
          120743: [[936], 256],
          120744: [[937], 256],
          120745: [[8711], 256],
          120746: [[945], 256],
          120747: [[946], 256],
          120748: [[947], 256],
          120749: [[948], 256],
          120750: [[949], 256],
          120751: [[950], 256],
          120752: [[951], 256],
          120753: [[952], 256],
          120754: [[953], 256],
          120755: [[954], 256],
          120756: [[955], 256],
          120757: [[956], 256],
          120758: [[957], 256],
          120759: [[958], 256],
          120760: [[959], 256],
          120761: [[960], 256],
          120762: [[961], 256],
          120763: [[962], 256],
          120764: [[963], 256],
          120765: [[964], 256],
          120766: [[965], 256],
          120767: [[966], 256],
          120768: [[967], 256],
          120769: [[968], 256],
          120770: [[969], 256],
          120771: [[8706], 256],
          120772: [[1013], 256],
          120773: [[977], 256],
          120774: [[1008], 256],
          120775: [[981], 256],
          120776: [[1009], 256],
          120777: [[982], 256],
          120778: [[988], 256],
          120779: [[989], 256],
          120782: [[48], 256],
          120783: [[49], 256],
          120784: [[50], 256],
          120785: [[51], 256],
          120786: [[52], 256],
          120787: [[53], 256],
          120788: [[54], 256],
          120789: [[55], 256],
          120790: [[56], 256],
          120791: [[57], 256],
          120792: [[48], 256],
          120793: [[49], 256],
          120794: [[50], 256],
          120795: [[51], 256],
          120796: [[52], 256],
          120797: [[53], 256],
          120798: [[54], 256],
          120799: [[55], 256],
          120800: [[56], 256],
          120801: [[57], 256],
          120802: [[48], 256],
          120803: [[49], 256],
          120804: [[50], 256],
          120805: [[51], 256],
          120806: [[52], 256],
          120807: [[53], 256],
          120808: [[54], 256],
          120809: [[55], 256],
          120810: [[56], 256],
          120811: [[57], 256],
          120812: [[48], 256],
          120813: [[49], 256],
          120814: [[50], 256],
          120815: [[51], 256],
          120816: [[52], 256],
          120817: [[53], 256],
          120818: [[54], 256],
          120819: [[55], 256],
          120820: [[56], 256],
          120821: [[57], 256],
          120822: [[48], 256],
          120823: [[49], 256],
          120824: [[50], 256],
          120825: [[51], 256],
          120826: [[52], 256],
          120827: [[53], 256],
          120828: [[54], 256],
          120829: [[55], 256],
          120830: [[56], 256],
          120831: [[57], 256]
        },
        59392: {
          125136: [, 220],
          125137: [, 220],
          125138: [, 220],
          125139: [, 220],
          125140: [, 220],
          125141: [, 220],
          125142: [, 220]
        },
        60928: {
          126464: [[1575], 256],
          126465: [[1576], 256],
          126466: [[1580], 256],
          126467: [[1583], 256],
          126469: [[1608], 256],
          126470: [[1586], 256],
          126471: [[1581], 256],
          126472: [[1591], 256],
          126473: [[1610], 256],
          126474: [[1603], 256],
          126475: [[1604], 256],
          126476: [[1605], 256],
          126477: [[1606], 256],
          126478: [[1587], 256],
          126479: [[1593], 256],
          126480: [[1601], 256],
          126481: [[1589], 256],
          126482: [[1602], 256],
          126483: [[1585], 256],
          126484: [[1588], 256],
          126485: [[1578], 256],
          126486: [[1579], 256],
          126487: [[1582], 256],
          126488: [[1584], 256],
          126489: [[1590], 256],
          126490: [[1592], 256],
          126491: [[1594], 256],
          126492: [[1646], 256],
          126493: [[1722], 256],
          126494: [[1697], 256],
          126495: [[1647], 256],
          126497: [[1576], 256],
          126498: [[1580], 256],
          126500: [[1607], 256],
          126503: [[1581], 256],
          126505: [[1610], 256],
          126506: [[1603], 256],
          126507: [[1604], 256],
          126508: [[1605], 256],
          126509: [[1606], 256],
          126510: [[1587], 256],
          126511: [[1593], 256],
          126512: [[1601], 256],
          126513: [[1589], 256],
          126514: [[1602], 256],
          126516: [[1588], 256],
          126517: [[1578], 256],
          126518: [[1579], 256],
          126519: [[1582], 256],
          126521: [[1590], 256],
          126523: [[1594], 256],
          126530: [[1580], 256],
          126535: [[1581], 256],
          126537: [[1610], 256],
          126539: [[1604], 256],
          126541: [[1606], 256],
          126542: [[1587], 256],
          126543: [[1593], 256],
          126545: [[1589], 256],
          126546: [[1602], 256],
          126548: [[1588], 256],
          126551: [[1582], 256],
          126553: [[1590], 256],
          126555: [[1594], 256],
          126557: [[1722], 256],
          126559: [[1647], 256],
          126561: [[1576], 256],
          126562: [[1580], 256],
          126564: [[1607], 256],
          126567: [[1581], 256],
          126568: [[1591], 256],
          126569: [[1610], 256],
          126570: [[1603], 256],
          126572: [[1605], 256],
          126573: [[1606], 256],
          126574: [[1587], 256],
          126575: [[1593], 256],
          126576: [[1601], 256],
          126577: [[1589], 256],
          126578: [[1602], 256],
          126580: [[1588], 256],
          126581: [[1578], 256],
          126582: [[1579], 256],
          126583: [[1582], 256],
          126585: [[1590], 256],
          126586: [[1592], 256],
          126587: [[1594], 256],
          126588: [[1646], 256],
          126590: [[1697], 256],
          126592: [[1575], 256],
          126593: [[1576], 256],
          126594: [[1580], 256],
          126595: [[1583], 256],
          126596: [[1607], 256],
          126597: [[1608], 256],
          126598: [[1586], 256],
          126599: [[1581], 256],
          126600: [[1591], 256],
          126601: [[1610], 256],
          126603: [[1604], 256],
          126604: [[1605], 256],
          126605: [[1606], 256],
          126606: [[1587], 256],
          126607: [[1593], 256],
          126608: [[1601], 256],
          126609: [[1589], 256],
          126610: [[1602], 256],
          126611: [[1585], 256],
          126612: [[1588], 256],
          126613: [[1578], 256],
          126614: [[1579], 256],
          126615: [[1582], 256],
          126616: [[1584], 256],
          126617: [[1590], 256],
          126618: [[1592], 256],
          126619: [[1594], 256],
          126625: [[1576], 256],
          126626: [[1580], 256],
          126627: [[1583], 256],
          126629: [[1608], 256],
          126630: [[1586], 256],
          126631: [[1581], 256],
          126632: [[1591], 256],
          126633: [[1610], 256],
          126635: [[1604], 256],
          126636: [[1605], 256],
          126637: [[1606], 256],
          126638: [[1587], 256],
          126639: [[1593], 256],
          126640: [[1601], 256],
          126641: [[1589], 256],
          126642: [[1602], 256],
          126643: [[1585], 256],
          126644: [[1588], 256],
          126645: [[1578], 256],
          126646: [[1579], 256],
          126647: [[1582], 256],
          126648: [[1584], 256],
          126649: [[1590], 256],
          126650: [[1592], 256],
          126651: [[1594], 256]
        },
        61696: {
          127232: [[48, 46], 256],
          127233: [[48, 44], 256],
          127234: [[49, 44], 256],
          127235: [[50, 44], 256],
          127236: [[51, 44], 256],
          127237: [[52, 44], 256],
          127238: [[53, 44], 256],
          127239: [[54, 44], 256],
          127240: [[55, 44], 256],
          127241: [[56, 44], 256],
          127242: [[57, 44], 256],
          127248: [[40, 65, 41], 256],
          127249: [[40, 66, 41], 256],
          127250: [[40, 67, 41], 256],
          127251: [[40, 68, 41], 256],
          127252: [[40, 69, 41], 256],
          127253: [[40, 70, 41], 256],
          127254: [[40, 71, 41], 256],
          127255: [[40, 72, 41], 256],
          127256: [[40, 73, 41], 256],
          127257: [[40, 74, 41], 256],
          127258: [[40, 75, 41], 256],
          127259: [[40, 76, 41], 256],
          127260: [[40, 77, 41], 256],
          127261: [[40, 78, 41], 256],
          127262: [[40, 79, 41], 256],
          127263: [[40, 80, 41], 256],
          127264: [[40, 81, 41], 256],
          127265: [[40, 82, 41], 256],
          127266: [[40, 83, 41], 256],
          127267: [[40, 84, 41], 256],
          127268: [[40, 85, 41], 256],
          127269: [[40, 86, 41], 256],
          127270: [[40, 87, 41], 256],
          127271: [[40, 88, 41], 256],
          127272: [[40, 89, 41], 256],
          127273: [[40, 90, 41], 256],
          127274: [[12308, 83, 12309], 256],
          127275: [[67], 256],
          127276: [[82], 256],
          127277: [[67, 68], 256],
          127278: [[87, 90], 256],
          127280: [[65], 256],
          127281: [[66], 256],
          127282: [[67], 256],
          127283: [[68], 256],
          127284: [[69], 256],
          127285: [[70], 256],
          127286: [[71], 256],
          127287: [[72], 256],
          127288: [[73], 256],
          127289: [[74], 256],
          127290: [[75], 256],
          127291: [[76], 256],
          127292: [[77], 256],
          127293: [[78], 256],
          127294: [[79], 256],
          127295: [[80], 256],
          127296: [[81], 256],
          127297: [[82], 256],
          127298: [[83], 256],
          127299: [[84], 256],
          127300: [[85], 256],
          127301: [[86], 256],
          127302: [[87], 256],
          127303: [[88], 256],
          127304: [[89], 256],
          127305: [[90], 256],
          127306: [[72, 86], 256],
          127307: [[77, 86], 256],
          127308: [[83, 68], 256],
          127309: [[83, 83], 256],
          127310: [[80, 80, 86], 256],
          127311: [[87, 67], 256],
          127338: [[77, 67], 256],
          127339: [[77, 68], 256],
          127376: [[68, 74], 256]
        },
        61952: {
          127488: [[12411, 12363], 256],
          127489: [[12467, 12467], 256],
          127490: [[12469], 256],
          127504: [[25163], 256],
          127505: [[23383], 256],
          127506: [[21452], 256],
          127507: [[12487], 256],
          127508: [[20108], 256],
          127509: [[22810], 256],
          127510: [[35299], 256],
          127511: [[22825], 256],
          127512: [[20132], 256],
          127513: [[26144], 256],
          127514: [[28961], 256],
          127515: [[26009], 256],
          127516: [[21069], 256],
          127517: [[24460], 256],
          127518: [[20877], 256],
          127519: [[26032], 256],
          127520: [[21021], 256],
          127521: [[32066], 256],
          127522: [[29983], 256],
          127523: [[36009], 256],
          127524: [[22768], 256],
          127525: [[21561], 256],
          127526: [[28436], 256],
          127527: [[25237], 256],
          127528: [[25429], 256],
          127529: [[19968], 256],
          127530: [[19977], 256],
          127531: [[36938], 256],
          127532: [[24038], 256],
          127533: [[20013], 256],
          127534: [[21491], 256],
          127535: [[25351], 256],
          127536: [[36208], 256],
          127537: [[25171], 256],
          127538: [[31105], 256],
          127539: [[31354], 256],
          127540: [[21512], 256],
          127541: [[28288], 256],
          127542: [[26377], 256],
          127543: [[26376], 256],
          127544: [[30003], 256],
          127545: [[21106], 256],
          127546: [[21942], 256],
          127552: [[12308, 26412, 12309], 256],
          127553: [[12308, 19977, 12309], 256],
          127554: [[12308, 20108, 12309], 256],
          127555: [[12308, 23433, 12309], 256],
          127556: [[12308, 28857, 12309], 256],
          127557: [[12308, 25171, 12309], 256],
          127558: [[12308, 30423, 12309], 256],
          127559: [[12308, 21213, 12309], 256],
          127560: [[12308, 25943, 12309], 256],
          127568: [[24471], 256],
          127569: [[21487], 256]
        },
        63488: {
          194560: [[20029]],
          194561: [[20024]],
          194562: [[20033]],
          194563: [[131362]],
          194564: [[20320]],
          194565: [[20398]],
          194566: [[20411]],
          194567: [[20482]],
          194568: [[20602]],
          194569: [[20633]],
          194570: [[20711]],
          194571: [[20687]],
          194572: [[13470]],
          194573: [[132666]],
          194574: [[20813]],
          194575: [[20820]],
          194576: [[20836]],
          194577: [[20855]],
          194578: [[132380]],
          194579: [[13497]],
          194580: [[20839]],
          194581: [[20877]],
          194582: [[132427]],
          194583: [[20887]],
          194584: [[20900]],
          194585: [[20172]],
          194586: [[20908]],
          194587: [[20917]],
          194588: [[168415]],
          194589: [[20981]],
          194590: [[20995]],
          194591: [[13535]],
          194592: [[21051]],
          194593: [[21062]],
          194594: [[21106]],
          194595: [[21111]],
          194596: [[13589]],
          194597: [[21191]],
          194598: [[21193]],
          194599: [[21220]],
          194600: [[21242]],
          194601: [[21253]],
          194602: [[21254]],
          194603: [[21271]],
          194604: [[21321]],
          194605: [[21329]],
          194606: [[21338]],
          194607: [[21363]],
          194608: [[21373]],
          194609: [[21375]],
          194610: [[21375]],
          194611: [[21375]],
          194612: [[133676]],
          194613: [[28784]],
          194614: [[21450]],
          194615: [[21471]],
          194616: [[133987]],
          194617: [[21483]],
          194618: [[21489]],
          194619: [[21510]],
          194620: [[21662]],
          194621: [[21560]],
          194622: [[21576]],
          194623: [[21608]],
          194624: [[21666]],
          194625: [[21750]],
          194626: [[21776]],
          194627: [[21843]],
          194628: [[21859]],
          194629: [[21892]],
          194630: [[21892]],
          194631: [[21913]],
          194632: [[21931]],
          194633: [[21939]],
          194634: [[21954]],
          194635: [[22294]],
          194636: [[22022]],
          194637: [[22295]],
          194638: [[22097]],
          194639: [[22132]],
          194640: [[20999]],
          194641: [[22766]],
          194642: [[22478]],
          194643: [[22516]],
          194644: [[22541]],
          194645: [[22411]],
          194646: [[22578]],
          194647: [[22577]],
          194648: [[22700]],
          194649: [[136420]],
          194650: [[22770]],
          194651: [[22775]],
          194652: [[22790]],
          194653: [[22810]],
          194654: [[22818]],
          194655: [[22882]],
          194656: [[136872]],
          194657: [[136938]],
          194658: [[23020]],
          194659: [[23067]],
          194660: [[23079]],
          194661: [[23000]],
          194662: [[23142]],
          194663: [[14062]],
          194664: [[14076]],
          194665: [[23304]],
          194666: [[23358]],
          194667: [[23358]],
          194668: [[137672]],
          194669: [[23491]],
          194670: [[23512]],
          194671: [[23527]],
          194672: [[23539]],
          194673: [[138008]],
          194674: [[23551]],
          194675: [[23558]],
          194676: [[24403]],
          194677: [[23586]],
          194678: [[14209]],
          194679: [[23648]],
          194680: [[23662]],
          194681: [[23744]],
          194682: [[23693]],
          194683: [[138724]],
          194684: [[23875]],
          194685: [[138726]],
          194686: [[23918]],
          194687: [[23915]],
          194688: [[23932]],
          194689: [[24033]],
          194690: [[24034]],
          194691: [[14383]],
          194692: [[24061]],
          194693: [[24104]],
          194694: [[24125]],
          194695: [[24169]],
          194696: [[14434]],
          194697: [[139651]],
          194698: [[14460]],
          194699: [[24240]],
          194700: [[24243]],
          194701: [[24246]],
          194702: [[24266]],
          194703: [[172946]],
          194704: [[24318]],
          194705: [[140081]],
          194706: [[140081]],
          194707: [[33281]],
          194708: [[24354]],
          194709: [[24354]],
          194710: [[14535]],
          194711: [[144056]],
          194712: [[156122]],
          194713: [[24418]],
          194714: [[24427]],
          194715: [[14563]],
          194716: [[24474]],
          194717: [[24525]],
          194718: [[24535]],
          194719: [[24569]],
          194720: [[24705]],
          194721: [[14650]],
          194722: [[14620]],
          194723: [[24724]],
          194724: [[141012]],
          194725: [[24775]],
          194726: [[24904]],
          194727: [[24908]],
          194728: [[24910]],
          194729: [[24908]],
          194730: [[24954]],
          194731: [[24974]],
          194732: [[25010]],
          194733: [[24996]],
          194734: [[25007]],
          194735: [[25054]],
          194736: [[25074]],
          194737: [[25078]],
          194738: [[25104]],
          194739: [[25115]],
          194740: [[25181]],
          194741: [[25265]],
          194742: [[25300]],
          194743: [[25424]],
          194744: [[142092]],
          194745: [[25405]],
          194746: [[25340]],
          194747: [[25448]],
          194748: [[25475]],
          194749: [[25572]],
          194750: [[142321]],
          194751: [[25634]],
          194752: [[25541]],
          194753: [[25513]],
          194754: [[14894]],
          194755: [[25705]],
          194756: [[25726]],
          194757: [[25757]],
          194758: [[25719]],
          194759: [[14956]],
          194760: [[25935]],
          194761: [[25964]],
          194762: [[143370]],
          194763: [[26083]],
          194764: [[26360]],
          194765: [[26185]],
          194766: [[15129]],
          194767: [[26257]],
          194768: [[15112]],
          194769: [[15076]],
          194770: [[20882]],
          194771: [[20885]],
          194772: [[26368]],
          194773: [[26268]],
          194774: [[32941]],
          194775: [[17369]],
          194776: [[26391]],
          194777: [[26395]],
          194778: [[26401]],
          194779: [[26462]],
          194780: [[26451]],
          194781: [[144323]],
          194782: [[15177]],
          194783: [[26618]],
          194784: [[26501]],
          194785: [[26706]],
          194786: [[26757]],
          194787: [[144493]],
          194788: [[26766]],
          194789: [[26655]],
          194790: [[26900]],
          194791: [[15261]],
          194792: [[26946]],
          194793: [[27043]],
          194794: [[27114]],
          194795: [[27304]],
          194796: [[145059]],
          194797: [[27355]],
          194798: [[15384]],
          194799: [[27425]],
          194800: [[145575]],
          194801: [[27476]],
          194802: [[15438]],
          194803: [[27506]],
          194804: [[27551]],
          194805: [[27578]],
          194806: [[27579]],
          194807: [[146061]],
          194808: [[138507]],
          194809: [[146170]],
          194810: [[27726]],
          194811: [[146620]],
          194812: [[27839]],
          194813: [[27853]],
          194814: [[27751]],
          194815: [[27926]]
        },
        63744: {
          63744: [[35912]],
          63745: [[26356]],
          63746: [[36554]],
          63747: [[36040]],
          63748: [[28369]],
          63749: [[20018]],
          63750: [[21477]],
          63751: [[40860]],
          63752: [[40860]],
          63753: [[22865]],
          63754: [[37329]],
          63755: [[21895]],
          63756: [[22856]],
          63757: [[25078]],
          63758: [[30313]],
          63759: [[32645]],
          63760: [[34367]],
          63761: [[34746]],
          63762: [[35064]],
          63763: [[37007]],
          63764: [[27138]],
          63765: [[27931]],
          63766: [[28889]],
          63767: [[29662]],
          63768: [[33853]],
          63769: [[37226]],
          63770: [[39409]],
          63771: [[20098]],
          63772: [[21365]],
          63773: [[27396]],
          63774: [[29211]],
          63775: [[34349]],
          63776: [[40478]],
          63777: [[23888]],
          63778: [[28651]],
          63779: [[34253]],
          63780: [[35172]],
          63781: [[25289]],
          63782: [[33240]],
          63783: [[34847]],
          63784: [[24266]],
          63785: [[26391]],
          63786: [[28010]],
          63787: [[29436]],
          63788: [[37070]],
          63789: [[20358]],
          63790: [[20919]],
          63791: [[21214]],
          63792: [[25796]],
          63793: [[27347]],
          63794: [[29200]],
          63795: [[30439]],
          63796: [[32769]],
          63797: [[34310]],
          63798: [[34396]],
          63799: [[36335]],
          63800: [[38706]],
          63801: [[39791]],
          63802: [[40442]],
          63803: [[30860]],
          63804: [[31103]],
          63805: [[32160]],
          63806: [[33737]],
          63807: [[37636]],
          63808: [[40575]],
          63809: [[35542]],
          63810: [[22751]],
          63811: [[24324]],
          63812: [[31840]],
          63813: [[32894]],
          63814: [[29282]],
          63815: [[30922]],
          63816: [[36034]],
          63817: [[38647]],
          63818: [[22744]],
          63819: [[23650]],
          63820: [[27155]],
          63821: [[28122]],
          63822: [[28431]],
          63823: [[32047]],
          63824: [[32311]],
          63825: [[38475]],
          63826: [[21202]],
          63827: [[32907]],
          63828: [[20956]],
          63829: [[20940]],
          63830: [[31260]],
          63831: [[32190]],
          63832: [[33777]],
          63833: [[38517]],
          63834: [[35712]],
          63835: [[25295]],
          63836: [[27138]],
          63837: [[35582]],
          63838: [[20025]],
          63839: [[23527]],
          63840: [[24594]],
          63841: [[29575]],
          63842: [[30064]],
          63843: [[21271]],
          63844: [[30971]],
          63845: [[20415]],
          63846: [[24489]],
          63847: [[19981]],
          63848: [[27852]],
          63849: [[25976]],
          63850: [[32034]],
          63851: [[21443]],
          63852: [[22622]],
          63853: [[30465]],
          63854: [[33865]],
          63855: [[35498]],
          63856: [[27578]],
          63857: [[36784]],
          63858: [[27784]],
          63859: [[25342]],
          63860: [[33509]],
          63861: [[25504]],
          63862: [[30053]],
          63863: [[20142]],
          63864: [[20841]],
          63865: [[20937]],
          63866: [[26753]],
          63867: [[31975]],
          63868: [[33391]],
          63869: [[35538]],
          63870: [[37327]],
          63871: [[21237]],
          63872: [[21570]],
          63873: [[22899]],
          63874: [[24300]],
          63875: [[26053]],
          63876: [[28670]],
          63877: [[31018]],
          63878: [[38317]],
          63879: [[39530]],
          63880: [[40599]],
          63881: [[40654]],
          63882: [[21147]],
          63883: [[26310]],
          63884: [[27511]],
          63885: [[36706]],
          63886: [[24180]],
          63887: [[24976]],
          63888: [[25088]],
          63889: [[25754]],
          63890: [[28451]],
          63891: [[29001]],
          63892: [[29833]],
          63893: [[31178]],
          63894: [[32244]],
          63895: [[32879]],
          63896: [[36646]],
          63897: [[34030]],
          63898: [[36899]],
          63899: [[37706]],
          63900: [[21015]],
          63901: [[21155]],
          63902: [[21693]],
          63903: [[28872]],
          63904: [[35010]],
          63905: [[35498]],
          63906: [[24265]],
          63907: [[24565]],
          63908: [[25467]],
          63909: [[27566]],
          63910: [[31806]],
          63911: [[29557]],
          63912: [[20196]],
          63913: [[22265]],
          63914: [[23527]],
          63915: [[23994]],
          63916: [[24604]],
          63917: [[29618]],
          63918: [[29801]],
          63919: [[32666]],
          63920: [[32838]],
          63921: [[37428]],
          63922: [[38646]],
          63923: [[38728]],
          63924: [[38936]],
          63925: [[20363]],
          63926: [[31150]],
          63927: [[37300]],
          63928: [[38584]],
          63929: [[24801]],
          63930: [[20102]],
          63931: [[20698]],
          63932: [[23534]],
          63933: [[23615]],
          63934: [[26009]],
          63935: [[27138]],
          63936: [[29134]],
          63937: [[30274]],
          63938: [[34044]],
          63939: [[36988]],
          63940: [[40845]],
          63941: [[26248]],
          63942: [[38446]],
          63943: [[21129]],
          63944: [[26491]],
          63945: [[26611]],
          63946: [[27969]],
          63947: [[28316]],
          63948: [[29705]],
          63949: [[30041]],
          63950: [[30827]],
          63951: [[32016]],
          63952: [[39006]],
          63953: [[20845]],
          63954: [[25134]],
          63955: [[38520]],
          63956: [[20523]],
          63957: [[23833]],
          63958: [[28138]],
          63959: [[36650]],
          63960: [[24459]],
          63961: [[24900]],
          63962: [[26647]],
          63963: [[29575]],
          63964: [[38534]],
          63965: [[21033]],
          63966: [[21519]],
          63967: [[23653]],
          63968: [[26131]],
          63969: [[26446]],
          63970: [[26792]],
          63971: [[27877]],
          63972: [[29702]],
          63973: [[30178]],
          63974: [[32633]],
          63975: [[35023]],
          63976: [[35041]],
          63977: [[37324]],
          63978: [[38626]],
          63979: [[21311]],
          63980: [[28346]],
          63981: [[21533]],
          63982: [[29136]],
          63983: [[29848]],
          63984: [[34298]],
          63985: [[38563]],
          63986: [[40023]],
          63987: [[40607]],
          63988: [[26519]],
          63989: [[28107]],
          63990: [[33256]],
          63991: [[31435]],
          63992: [[31520]],
          63993: [[31890]],
          63994: [[29376]],
          63995: [[28825]],
          63996: [[35672]],
          63997: [[20160]],
          63998: [[33590]],
          63999: [[21050]],
          194816: [[27966]],
          194817: [[28023]],
          194818: [[27969]],
          194819: [[28009]],
          194820: [[28024]],
          194821: [[28037]],
          194822: [[146718]],
          194823: [[27956]],
          194824: [[28207]],
          194825: [[28270]],
          194826: [[15667]],
          194827: [[28363]],
          194828: [[28359]],
          194829: [[147153]],
          194830: [[28153]],
          194831: [[28526]],
          194832: [[147294]],
          194833: [[147342]],
          194834: [[28614]],
          194835: [[28729]],
          194836: [[28702]],
          194837: [[28699]],
          194838: [[15766]],
          194839: [[28746]],
          194840: [[28797]],
          194841: [[28791]],
          194842: [[28845]],
          194843: [[132389]],
          194844: [[28997]],
          194845: [[148067]],
          194846: [[29084]],
          194847: [[148395]],
          194848: [[29224]],
          194849: [[29237]],
          194850: [[29264]],
          194851: [[149000]],
          194852: [[29312]],
          194853: [[29333]],
          194854: [[149301]],
          194855: [[149524]],
          194856: [[29562]],
          194857: [[29579]],
          194858: [[16044]],
          194859: [[29605]],
          194860: [[16056]],
          194861: [[16056]],
          194862: [[29767]],
          194863: [[29788]],
          194864: [[29809]],
          194865: [[29829]],
          194866: [[29898]],
          194867: [[16155]],
          194868: [[29988]],
          194869: [[150582]],
          194870: [[30014]],
          194871: [[150674]],
          194872: [[30064]],
          194873: [[139679]],
          194874: [[30224]],
          194875: [[151457]],
          194876: [[151480]],
          194877: [[151620]],
          194878: [[16380]],
          194879: [[16392]],
          194880: [[30452]],
          194881: [[151795]],
          194882: [[151794]],
          194883: [[151833]],
          194884: [[151859]],
          194885: [[30494]],
          194886: [[30495]],
          194887: [[30495]],
          194888: [[30538]],
          194889: [[16441]],
          194890: [[30603]],
          194891: [[16454]],
          194892: [[16534]],
          194893: [[152605]],
          194894: [[30798]],
          194895: [[30860]],
          194896: [[30924]],
          194897: [[16611]],
          194898: [[153126]],
          194899: [[31062]],
          194900: [[153242]],
          194901: [[153285]],
          194902: [[31119]],
          194903: [[31211]],
          194904: [[16687]],
          194905: [[31296]],
          194906: [[31306]],
          194907: [[31311]],
          194908: [[153980]],
          194909: [[154279]],
          194910: [[154279]],
          194911: [[31470]],
          194912: [[16898]],
          194913: [[154539]],
          194914: [[31686]],
          194915: [[31689]],
          194916: [[16935]],
          194917: [[154752]],
          194918: [[31954]],
          194919: [[17056]],
          194920: [[31976]],
          194921: [[31971]],
          194922: [[32000]],
          194923: [[155526]],
          194924: [[32099]],
          194925: [[17153]],
          194926: [[32199]],
          194927: [[32258]],
          194928: [[32325]],
          194929: [[17204]],
          194930: [[156200]],
          194931: [[156231]],
          194932: [[17241]],
          194933: [[156377]],
          194934: [[32634]],
          194935: [[156478]],
          194936: [[32661]],
          194937: [[32762]],
          194938: [[32773]],
          194939: [[156890]],
          194940: [[156963]],
          194941: [[32864]],
          194942: [[157096]],
          194943: [[32880]],
          194944: [[144223]],
          194945: [[17365]],
          194946: [[32946]],
          194947: [[33027]],
          194948: [[17419]],
          194949: [[33086]],
          194950: [[23221]],
          194951: [[157607]],
          194952: [[157621]],
          194953: [[144275]],
          194954: [[144284]],
          194955: [[33281]],
          194956: [[33284]],
          194957: [[36766]],
          194958: [[17515]],
          194959: [[33425]],
          194960: [[33419]],
          194961: [[33437]],
          194962: [[21171]],
          194963: [[33457]],
          194964: [[33459]],
          194965: [[33469]],
          194966: [[33510]],
          194967: [[158524]],
          194968: [[33509]],
          194969: [[33565]],
          194970: [[33635]],
          194971: [[33709]],
          194972: [[33571]],
          194973: [[33725]],
          194974: [[33767]],
          194975: [[33879]],
          194976: [[33619]],
          194977: [[33738]],
          194978: [[33740]],
          194979: [[33756]],
          194980: [[158774]],
          194981: [[159083]],
          194982: [[158933]],
          194983: [[17707]],
          194984: [[34033]],
          194985: [[34035]],
          194986: [[34070]],
          194987: [[160714]],
          194988: [[34148]],
          194989: [[159532]],
          194990: [[17757]],
          194991: [[17761]],
          194992: [[159665]],
          194993: [[159954]],
          194994: [[17771]],
          194995: [[34384]],
          194996: [[34396]],
          194997: [[34407]],
          194998: [[34409]],
          194999: [[34473]],
          195000: [[34440]],
          195001: [[34574]],
          195002: [[34530]],
          195003: [[34681]],
          195004: [[34600]],
          195005: [[34667]],
          195006: [[34694]],
          195007: [[17879]],
          195008: [[34785]],
          195009: [[34817]],
          195010: [[17913]],
          195011: [[34912]],
          195012: [[34915]],
          195013: [[161383]],
          195014: [[35031]],
          195015: [[35038]],
          195016: [[17973]],
          195017: [[35066]],
          195018: [[13499]],
          195019: [[161966]],
          195020: [[162150]],
          195021: [[18110]],
          195022: [[18119]],
          195023: [[35488]],
          195024: [[35565]],
          195025: [[35722]],
          195026: [[35925]],
          195027: [[162984]],
          195028: [[36011]],
          195029: [[36033]],
          195030: [[36123]],
          195031: [[36215]],
          195032: [[163631]],
          195033: [[133124]],
          195034: [[36299]],
          195035: [[36284]],
          195036: [[36336]],
          195037: [[133342]],
          195038: [[36564]],
          195039: [[36664]],
          195040: [[165330]],
          195041: [[165357]],
          195042: [[37012]],
          195043: [[37105]],
          195044: [[37137]],
          195045: [[165678]],
          195046: [[37147]],
          195047: [[37432]],
          195048: [[37591]],
          195049: [[37592]],
          195050: [[37500]],
          195051: [[37881]],
          195052: [[37909]],
          195053: [[166906]],
          195054: [[38283]],
          195055: [[18837]],
          195056: [[38327]],
          195057: [[167287]],
          195058: [[18918]],
          195059: [[38595]],
          195060: [[23986]],
          195061: [[38691]],
          195062: [[168261]],
          195063: [[168474]],
          195064: [[19054]],
          195065: [[19062]],
          195066: [[38880]],
          195067: [[168970]],
          195068: [[19122]],
          195069: [[169110]],
          195070: [[38923]],
          195071: [[38923]]
        },
        64000: {
          64000: [[20999]],
          64001: [[24230]],
          64002: [[25299]],
          64003: [[31958]],
          64004: [[23429]],
          64005: [[27934]],
          64006: [[26292]],
          64007: [[36667]],
          64008: [[34892]],
          64009: [[38477]],
          64010: [[35211]],
          64011: [[24275]],
          64012: [[20800]],
          64013: [[21952]],
          64016: [[22618]],
          64018: [[26228]],
          64021: [[20958]],
          64022: [[29482]],
          64023: [[30410]],
          64024: [[31036]],
          64025: [[31070]],
          64026: [[31077]],
          64027: [[31119]],
          64028: [[38742]],
          64029: [[31934]],
          64030: [[32701]],
          64032: [[34322]],
          64034: [[35576]],
          64037: [[36920]],
          64038: [[37117]],
          64042: [[39151]],
          64043: [[39164]],
          64044: [[39208]],
          64045: [[40372]],
          64046: [[37086]],
          64047: [[38583]],
          64048: [[20398]],
          64049: [[20711]],
          64050: [[20813]],
          64051: [[21193]],
          64052: [[21220]],
          64053: [[21329]],
          64054: [[21917]],
          64055: [[22022]],
          64056: [[22120]],
          64057: [[22592]],
          64058: [[22696]],
          64059: [[23652]],
          64060: [[23662]],
          64061: [[24724]],
          64062: [[24936]],
          64063: [[24974]],
          64064: [[25074]],
          64065: [[25935]],
          64066: [[26082]],
          64067: [[26257]],
          64068: [[26757]],
          64069: [[28023]],
          64070: [[28186]],
          64071: [[28450]],
          64072: [[29038]],
          64073: [[29227]],
          64074: [[29730]],
          64075: [[30865]],
          64076: [[31038]],
          64077: [[31049]],
          64078: [[31048]],
          64079: [[31056]],
          64080: [[31062]],
          64081: [[31069]],
          64082: [[31117]],
          64083: [[31118]],
          64084: [[31296]],
          64085: [[31361]],
          64086: [[31680]],
          64087: [[32244]],
          64088: [[32265]],
          64089: [[32321]],
          64090: [[32626]],
          64091: [[32773]],
          64092: [[33261]],
          64093: [[33401]],
          64094: [[33401]],
          64095: [[33879]],
          64096: [[35088]],
          64097: [[35222]],
          64098: [[35585]],
          64099: [[35641]],
          64100: [[36051]],
          64101: [[36104]],
          64102: [[36790]],
          64103: [[36920]],
          64104: [[38627]],
          64105: [[38911]],
          64106: [[38971]],
          64107: [[24693]],
          64108: [[148206]],
          64109: [[33304]],
          64112: [[20006]],
          64113: [[20917]],
          64114: [[20840]],
          64115: [[20352]],
          64116: [[20805]],
          64117: [[20864]],
          64118: [[21191]],
          64119: [[21242]],
          64120: [[21917]],
          64121: [[21845]],
          64122: [[21913]],
          64123: [[21986]],
          64124: [[22618]],
          64125: [[22707]],
          64126: [[22852]],
          64127: [[22868]],
          64128: [[23138]],
          64129: [[23336]],
          64130: [[24274]],
          64131: [[24281]],
          64132: [[24425]],
          64133: [[24493]],
          64134: [[24792]],
          64135: [[24910]],
          64136: [[24840]],
          64137: [[24974]],
          64138: [[24928]],
          64139: [[25074]],
          64140: [[25140]],
          64141: [[25540]],
          64142: [[25628]],
          64143: [[25682]],
          64144: [[25942]],
          64145: [[26228]],
          64146: [[26391]],
          64147: [[26395]],
          64148: [[26454]],
          64149: [[27513]],
          64150: [[27578]],
          64151: [[27969]],
          64152: [[28379]],
          64153: [[28363]],
          64154: [[28450]],
          64155: [[28702]],
          64156: [[29038]],
          64157: [[30631]],
          64158: [[29237]],
          64159: [[29359]],
          64160: [[29482]],
          64161: [[29809]],
          64162: [[29958]],
          64163: [[30011]],
          64164: [[30237]],
          64165: [[30239]],
          64166: [[30410]],
          64167: [[30427]],
          64168: [[30452]],
          64169: [[30538]],
          64170: [[30528]],
          64171: [[30924]],
          64172: [[31409]],
          64173: [[31680]],
          64174: [[31867]],
          64175: [[32091]],
          64176: [[32244]],
          64177: [[32574]],
          64178: [[32773]],
          64179: [[33618]],
          64180: [[33775]],
          64181: [[34681]],
          64182: [[35137]],
          64183: [[35206]],
          64184: [[35222]],
          64185: [[35519]],
          64186: [[35576]],
          64187: [[35531]],
          64188: [[35585]],
          64189: [[35582]],
          64190: [[35565]],
          64191: [[35641]],
          64192: [[35722]],
          64193: [[36104]],
          64194: [[36664]],
          64195: [[36978]],
          64196: [[37273]],
          64197: [[37494]],
          64198: [[38524]],
          64199: [[38627]],
          64200: [[38742]],
          64201: [[38875]],
          64202: [[38911]],
          64203: [[38923]],
          64204: [[38971]],
          64205: [[39698]],
          64206: [[40860]],
          64207: [[141386]],
          64208: [[141380]],
          64209: [[144341]],
          64210: [[15261]],
          64211: [[16408]],
          64212: [[16441]],
          64213: [[152137]],
          64214: [[154832]],
          64215: [[163539]],
          64216: [[40771]],
          64217: [[40846]],
          195072: [[38953]],
          195073: [[169398]],
          195074: [[39138]],
          195075: [[19251]],
          195076: [[39209]],
          195077: [[39335]],
          195078: [[39362]],
          195079: [[39422]],
          195080: [[19406]],
          195081: [[170800]],
          195082: [[39698]],
          195083: [[40000]],
          195084: [[40189]],
          195085: [[19662]],
          195086: [[19693]],
          195087: [[40295]],
          195088: [[172238]],
          195089: [[19704]],
          195090: [[172293]],
          195091: [[172558]],
          195092: [[172689]],
          195093: [[40635]],
          195094: [[19798]],
          195095: [[40697]],
          195096: [[40702]],
          195097: [[40709]],
          195098: [[40719]],
          195099: [[40726]],
          195100: [[40763]],
          195101: [[173568]]
        },
        64256: {
          64256: [[102, 102], 256],
          64257: [[102, 105], 256],
          64258: [[102, 108], 256],
          64259: [[102, 102, 105], 256],
          64260: [[102, 102, 108], 256],
          64261: [[383, 116], 256],
          64262: [[115, 116], 256],
          64275: [[1396, 1398], 256],
          64276: [[1396, 1381], 256],
          64277: [[1396, 1387], 256],
          64278: [[1406, 1398], 256],
          64279: [[1396, 1389], 256],
          64285: [[1497, 1460], 512],
          64286: [, 26],
          64287: [[1522, 1463], 512],
          64288: [[1506], 256],
          64289: [[1488], 256],
          64290: [[1491], 256],
          64291: [[1492], 256],
          64292: [[1499], 256],
          64293: [[1500], 256],
          64294: [[1501], 256],
          64295: [[1512], 256],
          64296: [[1514], 256],
          64297: [[43], 256],
          64298: [[1513, 1473], 512],
          64299: [[1513, 1474], 512],
          64300: [[64329, 1473], 512],
          64301: [[64329, 1474], 512],
          64302: [[1488, 1463], 512],
          64303: [[1488, 1464], 512],
          64304: [[1488, 1468], 512],
          64305: [[1489, 1468], 512],
          64306: [[1490, 1468], 512],
          64307: [[1491, 1468], 512],
          64308: [[1492, 1468], 512],
          64309: [[1493, 1468], 512],
          64310: [[1494, 1468], 512],
          64312: [[1496, 1468], 512],
          64313: [[1497, 1468], 512],
          64314: [[1498, 1468], 512],
          64315: [[1499, 1468], 512],
          64316: [[1500, 1468], 512],
          64318: [[1502, 1468], 512],
          64320: [[1504, 1468], 512],
          64321: [[1505, 1468], 512],
          64323: [[1507, 1468], 512],
          64324: [[1508, 1468], 512],
          64326: [[1510, 1468], 512],
          64327: [[1511, 1468], 512],
          64328: [[1512, 1468], 512],
          64329: [[1513, 1468], 512],
          64330: [[1514, 1468], 512],
          64331: [[1493, 1465], 512],
          64332: [[1489, 1471], 512],
          64333: [[1499, 1471], 512],
          64334: [[1508, 1471], 512],
          64335: [[1488, 1500], 256],
          64336: [[1649], 256],
          64337: [[1649], 256],
          64338: [[1659], 256],
          64339: [[1659], 256],
          64340: [[1659], 256],
          64341: [[1659], 256],
          64342: [[1662], 256],
          64343: [[1662], 256],
          64344: [[1662], 256],
          64345: [[1662], 256],
          64346: [[1664], 256],
          64347: [[1664], 256],
          64348: [[1664], 256],
          64349: [[1664], 256],
          64350: [[1658], 256],
          64351: [[1658], 256],
          64352: [[1658], 256],
          64353: [[1658], 256],
          64354: [[1663], 256],
          64355: [[1663], 256],
          64356: [[1663], 256],
          64357: [[1663], 256],
          64358: [[1657], 256],
          64359: [[1657], 256],
          64360: [[1657], 256],
          64361: [[1657], 256],
          64362: [[1700], 256],
          64363: [[1700], 256],
          64364: [[1700], 256],
          64365: [[1700], 256],
          64366: [[1702], 256],
          64367: [[1702], 256],
          64368: [[1702], 256],
          64369: [[1702], 256],
          64370: [[1668], 256],
          64371: [[1668], 256],
          64372: [[1668], 256],
          64373: [[1668], 256],
          64374: [[1667], 256],
          64375: [[1667], 256],
          64376: [[1667], 256],
          64377: [[1667], 256],
          64378: [[1670], 256],
          64379: [[1670], 256],
          64380: [[1670], 256],
          64381: [[1670], 256],
          64382: [[1671], 256],
          64383: [[1671], 256],
          64384: [[1671], 256],
          64385: [[1671], 256],
          64386: [[1677], 256],
          64387: [[1677], 256],
          64388: [[1676], 256],
          64389: [[1676], 256],
          64390: [[1678], 256],
          64391: [[1678], 256],
          64392: [[1672], 256],
          64393: [[1672], 256],
          64394: [[1688], 256],
          64395: [[1688], 256],
          64396: [[1681], 256],
          64397: [[1681], 256],
          64398: [[1705], 256],
          64399: [[1705], 256],
          64400: [[1705], 256],
          64401: [[1705], 256],
          64402: [[1711], 256],
          64403: [[1711], 256],
          64404: [[1711], 256],
          64405: [[1711], 256],
          64406: [[1715], 256],
          64407: [[1715], 256],
          64408: [[1715], 256],
          64409: [[1715], 256],
          64410: [[1713], 256],
          64411: [[1713], 256],
          64412: [[1713], 256],
          64413: [[1713], 256],
          64414: [[1722], 256],
          64415: [[1722], 256],
          64416: [[1723], 256],
          64417: [[1723], 256],
          64418: [[1723], 256],
          64419: [[1723], 256],
          64420: [[1728], 256],
          64421: [[1728], 256],
          64422: [[1729], 256],
          64423: [[1729], 256],
          64424: [[1729], 256],
          64425: [[1729], 256],
          64426: [[1726], 256],
          64427: [[1726], 256],
          64428: [[1726], 256],
          64429: [[1726], 256],
          64430: [[1746], 256],
          64431: [[1746], 256],
          64432: [[1747], 256],
          64433: [[1747], 256],
          64467: [[1709], 256],
          64468: [[1709], 256],
          64469: [[1709], 256],
          64470: [[1709], 256],
          64471: [[1735], 256],
          64472: [[1735], 256],
          64473: [[1734], 256],
          64474: [[1734], 256],
          64475: [[1736], 256],
          64476: [[1736], 256],
          64477: [[1655], 256],
          64478: [[1739], 256],
          64479: [[1739], 256],
          64480: [[1733], 256],
          64481: [[1733], 256],
          64482: [[1737], 256],
          64483: [[1737], 256],
          64484: [[1744], 256],
          64485: [[1744], 256],
          64486: [[1744], 256],
          64487: [[1744], 256],
          64488: [[1609], 256],
          64489: [[1609], 256],
          64490: [[1574, 1575], 256],
          64491: [[1574, 1575], 256],
          64492: [[1574, 1749], 256],
          64493: [[1574, 1749], 256],
          64494: [[1574, 1608], 256],
          64495: [[1574, 1608], 256],
          64496: [[1574, 1735], 256],
          64497: [[1574, 1735], 256],
          64498: [[1574, 1734], 256],
          64499: [[1574, 1734], 256],
          64500: [[1574, 1736], 256],
          64501: [[1574, 1736], 256],
          64502: [[1574, 1744], 256],
          64503: [[1574, 1744], 256],
          64504: [[1574, 1744], 256],
          64505: [[1574, 1609], 256],
          64506: [[1574, 1609], 256],
          64507: [[1574, 1609], 256],
          64508: [[1740], 256],
          64509: [[1740], 256],
          64510: [[1740], 256],
          64511: [[1740], 256]
        },
        64512: {
          64512: [[1574, 1580], 256],
          64513: [[1574, 1581], 256],
          64514: [[1574, 1605], 256],
          64515: [[1574, 1609], 256],
          64516: [[1574, 1610], 256],
          64517: [[1576, 1580], 256],
          64518: [[1576, 1581], 256],
          64519: [[1576, 1582], 256],
          64520: [[1576, 1605], 256],
          64521: [[1576, 1609], 256],
          64522: [[1576, 1610], 256],
          64523: [[1578, 1580], 256],
          64524: [[1578, 1581], 256],
          64525: [[1578, 1582], 256],
          64526: [[1578, 1605], 256],
          64527: [[1578, 1609], 256],
          64528: [[1578, 1610], 256],
          64529: [[1579, 1580], 256],
          64530: [[1579, 1605], 256],
          64531: [[1579, 1609], 256],
          64532: [[1579, 1610], 256],
          64533: [[1580, 1581], 256],
          64534: [[1580, 1605], 256],
          64535: [[1581, 1580], 256],
          64536: [[1581, 1605], 256],
          64537: [[1582, 1580], 256],
          64538: [[1582, 1581], 256],
          64539: [[1582, 1605], 256],
          64540: [[1587, 1580], 256],
          64541: [[1587, 1581], 256],
          64542: [[1587, 1582], 256],
          64543: [[1587, 1605], 256],
          64544: [[1589, 1581], 256],
          64545: [[1589, 1605], 256],
          64546: [[1590, 1580], 256],
          64547: [[1590, 1581], 256],
          64548: [[1590, 1582], 256],
          64549: [[1590, 1605], 256],
          64550: [[1591, 1581], 256],
          64551: [[1591, 1605], 256],
          64552: [[1592, 1605], 256],
          64553: [[1593, 1580], 256],
          64554: [[1593, 1605], 256],
          64555: [[1594, 1580], 256],
          64556: [[1594, 1605], 256],
          64557: [[1601, 1580], 256],
          64558: [[1601, 1581], 256],
          64559: [[1601, 1582], 256],
          64560: [[1601, 1605], 256],
          64561: [[1601, 1609], 256],
          64562: [[1601, 1610], 256],
          64563: [[1602, 1581], 256],
          64564: [[1602, 1605], 256],
          64565: [[1602, 1609], 256],
          64566: [[1602, 1610], 256],
          64567: [[1603, 1575], 256],
          64568: [[1603, 1580], 256],
          64569: [[1603, 1581], 256],
          64570: [[1603, 1582], 256],
          64571: [[1603, 1604], 256],
          64572: [[1603, 1605], 256],
          64573: [[1603, 1609], 256],
          64574: [[1603, 1610], 256],
          64575: [[1604, 1580], 256],
          64576: [[1604, 1581], 256],
          64577: [[1604, 1582], 256],
          64578: [[1604, 1605], 256],
          64579: [[1604, 1609], 256],
          64580: [[1604, 1610], 256],
          64581: [[1605, 1580], 256],
          64582: [[1605, 1581], 256],
          64583: [[1605, 1582], 256],
          64584: [[1605, 1605], 256],
          64585: [[1605, 1609], 256],
          64586: [[1605, 1610], 256],
          64587: [[1606, 1580], 256],
          64588: [[1606, 1581], 256],
          64589: [[1606, 1582], 256],
          64590: [[1606, 1605], 256],
          64591: [[1606, 1609], 256],
          64592: [[1606, 1610], 256],
          64593: [[1607, 1580], 256],
          64594: [[1607, 1605], 256],
          64595: [[1607, 1609], 256],
          64596: [[1607, 1610], 256],
          64597: [[1610, 1580], 256],
          64598: [[1610, 1581], 256],
          64599: [[1610, 1582], 256],
          64600: [[1610, 1605], 256],
          64601: [[1610, 1609], 256],
          64602: [[1610, 1610], 256],
          64603: [[1584, 1648], 256],
          64604: [[1585, 1648], 256],
          64605: [[1609, 1648], 256],
          64606: [[32, 1612, 1617], 256],
          64607: [[32, 1613, 1617], 256],
          64608: [[32, 1614, 1617], 256],
          64609: [[32, 1615, 1617], 256],
          64610: [[32, 1616, 1617], 256],
          64611: [[32, 1617, 1648], 256],
          64612: [[1574, 1585], 256],
          64613: [[1574, 1586], 256],
          64614: [[1574, 1605], 256],
          64615: [[1574, 1606], 256],
          64616: [[1574, 1609], 256],
          64617: [[1574, 1610], 256],
          64618: [[1576, 1585], 256],
          64619: [[1576, 1586], 256],
          64620: [[1576, 1605], 256],
          64621: [[1576, 1606], 256],
          64622: [[1576, 1609], 256],
          64623: [[1576, 1610], 256],
          64624: [[1578, 1585], 256],
          64625: [[1578, 1586], 256],
          64626: [[1578, 1605], 256],
          64627: [[1578, 1606], 256],
          64628: [[1578, 1609], 256],
          64629: [[1578, 1610], 256],
          64630: [[1579, 1585], 256],
          64631: [[1579, 1586], 256],
          64632: [[1579, 1605], 256],
          64633: [[1579, 1606], 256],
          64634: [[1579, 1609], 256],
          64635: [[1579, 1610], 256],
          64636: [[1601, 1609], 256],
          64637: [[1601, 1610], 256],
          64638: [[1602, 1609], 256],
          64639: [[1602, 1610], 256],
          64640: [[1603, 1575], 256],
          64641: [[1603, 1604], 256],
          64642: [[1603, 1605], 256],
          64643: [[1603, 1609], 256],
          64644: [[1603, 1610], 256],
          64645: [[1604, 1605], 256],
          64646: [[1604, 1609], 256],
          64647: [[1604, 1610], 256],
          64648: [[1605, 1575], 256],
          64649: [[1605, 1605], 256],
          64650: [[1606, 1585], 256],
          64651: [[1606, 1586], 256],
          64652: [[1606, 1605], 256],
          64653: [[1606, 1606], 256],
          64654: [[1606, 1609], 256],
          64655: [[1606, 1610], 256],
          64656: [[1609, 1648], 256],
          64657: [[1610, 1585], 256],
          64658: [[1610, 1586], 256],
          64659: [[1610, 1605], 256],
          64660: [[1610, 1606], 256],
          64661: [[1610, 1609], 256],
          64662: [[1610, 1610], 256],
          64663: [[1574, 1580], 256],
          64664: [[1574, 1581], 256],
          64665: [[1574, 1582], 256],
          64666: [[1574, 1605], 256],
          64667: [[1574, 1607], 256],
          64668: [[1576, 1580], 256],
          64669: [[1576, 1581], 256],
          64670: [[1576, 1582], 256],
          64671: [[1576, 1605], 256],
          64672: [[1576, 1607], 256],
          64673: [[1578, 1580], 256],
          64674: [[1578, 1581], 256],
          64675: [[1578, 1582], 256],
          64676: [[1578, 1605], 256],
          64677: [[1578, 1607], 256],
          64678: [[1579, 1605], 256],
          64679: [[1580, 1581], 256],
          64680: [[1580, 1605], 256],
          64681: [[1581, 1580], 256],
          64682: [[1581, 1605], 256],
          64683: [[1582, 1580], 256],
          64684: [[1582, 1605], 256],
          64685: [[1587, 1580], 256],
          64686: [[1587, 1581], 256],
          64687: [[1587, 1582], 256],
          64688: [[1587, 1605], 256],
          64689: [[1589, 1581], 256],
          64690: [[1589, 1582], 256],
          64691: [[1589, 1605], 256],
          64692: [[1590, 1580], 256],
          64693: [[1590, 1581], 256],
          64694: [[1590, 1582], 256],
          64695: [[1590, 1605], 256],
          64696: [[1591, 1581], 256],
          64697: [[1592, 1605], 256],
          64698: [[1593, 1580], 256],
          64699: [[1593, 1605], 256],
          64700: [[1594, 1580], 256],
          64701: [[1594, 1605], 256],
          64702: [[1601, 1580], 256],
          64703: [[1601, 1581], 256],
          64704: [[1601, 1582], 256],
          64705: [[1601, 1605], 256],
          64706: [[1602, 1581], 256],
          64707: [[1602, 1605], 256],
          64708: [[1603, 1580], 256],
          64709: [[1603, 1581], 256],
          64710: [[1603, 1582], 256],
          64711: [[1603, 1604], 256],
          64712: [[1603, 1605], 256],
          64713: [[1604, 1580], 256],
          64714: [[1604, 1581], 256],
          64715: [[1604, 1582], 256],
          64716: [[1604, 1605], 256],
          64717: [[1604, 1607], 256],
          64718: [[1605, 1580], 256],
          64719: [[1605, 1581], 256],
          64720: [[1605, 1582], 256],
          64721: [[1605, 1605], 256],
          64722: [[1606, 1580], 256],
          64723: [[1606, 1581], 256],
          64724: [[1606, 1582], 256],
          64725: [[1606, 1605], 256],
          64726: [[1606, 1607], 256],
          64727: [[1607, 1580], 256],
          64728: [[1607, 1605], 256],
          64729: [[1607, 1648], 256],
          64730: [[1610, 1580], 256],
          64731: [[1610, 1581], 256],
          64732: [[1610, 1582], 256],
          64733: [[1610, 1605], 256],
          64734: [[1610, 1607], 256],
          64735: [[1574, 1605], 256],
          64736: [[1574, 1607], 256],
          64737: [[1576, 1605], 256],
          64738: [[1576, 1607], 256],
          64739: [[1578, 1605], 256],
          64740: [[1578, 1607], 256],
          64741: [[1579, 1605], 256],
          64742: [[1579, 1607], 256],
          64743: [[1587, 1605], 256],
          64744: [[1587, 1607], 256],
          64745: [[1588, 1605], 256],
          64746: [[1588, 1607], 256],
          64747: [[1603, 1604], 256],
          64748: [[1603, 1605], 256],
          64749: [[1604, 1605], 256],
          64750: [[1606, 1605], 256],
          64751: [[1606, 1607], 256],
          64752: [[1610, 1605], 256],
          64753: [[1610, 1607], 256],
          64754: [[1600, 1614, 1617], 256],
          64755: [[1600, 1615, 1617], 256],
          64756: [[1600, 1616, 1617], 256],
          64757: [[1591, 1609], 256],
          64758: [[1591, 1610], 256],
          64759: [[1593, 1609], 256],
          64760: [[1593, 1610], 256],
          64761: [[1594, 1609], 256],
          64762: [[1594, 1610], 256],
          64763: [[1587, 1609], 256],
          64764: [[1587, 1610], 256],
          64765: [[1588, 1609], 256],
          64766: [[1588, 1610], 256],
          64767: [[1581, 1609], 256]
        },
        64768: {
          64768: [[1581, 1610], 256],
          64769: [[1580, 1609], 256],
          64770: [[1580, 1610], 256],
          64771: [[1582, 1609], 256],
          64772: [[1582, 1610], 256],
          64773: [[1589, 1609], 256],
          64774: [[1589, 1610], 256],
          64775: [[1590, 1609], 256],
          64776: [[1590, 1610], 256],
          64777: [[1588, 1580], 256],
          64778: [[1588, 1581], 256],
          64779: [[1588, 1582], 256],
          64780: [[1588, 1605], 256],
          64781: [[1588, 1585], 256],
          64782: [[1587, 1585], 256],
          64783: [[1589, 1585], 256],
          64784: [[1590, 1585], 256],
          64785: [[1591, 1609], 256],
          64786: [[1591, 1610], 256],
          64787: [[1593, 1609], 256],
          64788: [[1593, 1610], 256],
          64789: [[1594, 1609], 256],
          64790: [[1594, 1610], 256],
          64791: [[1587, 1609], 256],
          64792: [[1587, 1610], 256],
          64793: [[1588, 1609], 256],
          64794: [[1588, 1610], 256],
          64795: [[1581, 1609], 256],
          64796: [[1581, 1610], 256],
          64797: [[1580, 1609], 256],
          64798: [[1580, 1610], 256],
          64799: [[1582, 1609], 256],
          64800: [[1582, 1610], 256],
          64801: [[1589, 1609], 256],
          64802: [[1589, 1610], 256],
          64803: [[1590, 1609], 256],
          64804: [[1590, 1610], 256],
          64805: [[1588, 1580], 256],
          64806: [[1588, 1581], 256],
          64807: [[1588, 1582], 256],
          64808: [[1588, 1605], 256],
          64809: [[1588, 1585], 256],
          64810: [[1587, 1585], 256],
          64811: [[1589, 1585], 256],
          64812: [[1590, 1585], 256],
          64813: [[1588, 1580], 256],
          64814: [[1588, 1581], 256],
          64815: [[1588, 1582], 256],
          64816: [[1588, 1605], 256],
          64817: [[1587, 1607], 256],
          64818: [[1588, 1607], 256],
          64819: [[1591, 1605], 256],
          64820: [[1587, 1580], 256],
          64821: [[1587, 1581], 256],
          64822: [[1587, 1582], 256],
          64823: [[1588, 1580], 256],
          64824: [[1588, 1581], 256],
          64825: [[1588, 1582], 256],
          64826: [[1591, 1605], 256],
          64827: [[1592, 1605], 256],
          64828: [[1575, 1611], 256],
          64829: [[1575, 1611], 256],
          64848: [[1578, 1580, 1605], 256],
          64849: [[1578, 1581, 1580], 256],
          64850: [[1578, 1581, 1580], 256],
          64851: [[1578, 1581, 1605], 256],
          64852: [[1578, 1582, 1605], 256],
          64853: [[1578, 1605, 1580], 256],
          64854: [[1578, 1605, 1581], 256],
          64855: [[1578, 1605, 1582], 256],
          64856: [[1580, 1605, 1581], 256],
          64857: [[1580, 1605, 1581], 256],
          64858: [[1581, 1605, 1610], 256],
          64859: [[1581, 1605, 1609], 256],
          64860: [[1587, 1581, 1580], 256],
          64861: [[1587, 1580, 1581], 256],
          64862: [[1587, 1580, 1609], 256],
          64863: [[1587, 1605, 1581], 256],
          64864: [[1587, 1605, 1581], 256],
          64865: [[1587, 1605, 1580], 256],
          64866: [[1587, 1605, 1605], 256],
          64867: [[1587, 1605, 1605], 256],
          64868: [[1589, 1581, 1581], 256],
          64869: [[1589, 1581, 1581], 256],
          64870: [[1589, 1605, 1605], 256],
          64871: [[1588, 1581, 1605], 256],
          64872: [[1588, 1581, 1605], 256],
          64873: [[1588, 1580, 1610], 256],
          64874: [[1588, 1605, 1582], 256],
          64875: [[1588, 1605, 1582], 256],
          64876: [[1588, 1605, 1605], 256],
          64877: [[1588, 1605, 1605], 256],
          64878: [[1590, 1581, 1609], 256],
          64879: [[1590, 1582, 1605], 256],
          64880: [[1590, 1582, 1605], 256],
          64881: [[1591, 1605, 1581], 256],
          64882: [[1591, 1605, 1581], 256],
          64883: [[1591, 1605, 1605], 256],
          64884: [[1591, 1605, 1610], 256],
          64885: [[1593, 1580, 1605], 256],
          64886: [[1593, 1605, 1605], 256],
          64887: [[1593, 1605, 1605], 256],
          64888: [[1593, 1605, 1609], 256],
          64889: [[1594, 1605, 1605], 256],
          64890: [[1594, 1605, 1610], 256],
          64891: [[1594, 1605, 1609], 256],
          64892: [[1601, 1582, 1605], 256],
          64893: [[1601, 1582, 1605], 256],
          64894: [[1602, 1605, 1581], 256],
          64895: [[1602, 1605, 1605], 256],
          64896: [[1604, 1581, 1605], 256],
          64897: [[1604, 1581, 1610], 256],
          64898: [[1604, 1581, 1609], 256],
          64899: [[1604, 1580, 1580], 256],
          64900: [[1604, 1580, 1580], 256],
          64901: [[1604, 1582, 1605], 256],
          64902: [[1604, 1582, 1605], 256],
          64903: [[1604, 1605, 1581], 256],
          64904: [[1604, 1605, 1581], 256],
          64905: [[1605, 1581, 1580], 256],
          64906: [[1605, 1581, 1605], 256],
          64907: [[1605, 1581, 1610], 256],
          64908: [[1605, 1580, 1581], 256],
          64909: [[1605, 1580, 1605], 256],
          64910: [[1605, 1582, 1580], 256],
          64911: [[1605, 1582, 1605], 256],
          64914: [[1605, 1580, 1582], 256],
          64915: [[1607, 1605, 1580], 256],
          64916: [[1607, 1605, 1605], 256],
          64917: [[1606, 1581, 1605], 256],
          64918: [[1606, 1581, 1609], 256],
          64919: [[1606, 1580, 1605], 256],
          64920: [[1606, 1580, 1605], 256],
          64921: [[1606, 1580, 1609], 256],
          64922: [[1606, 1605, 1610], 256],
          64923: [[1606, 1605, 1609], 256],
          64924: [[1610, 1605, 1605], 256],
          64925: [[1610, 1605, 1605], 256],
          64926: [[1576, 1582, 1610], 256],
          64927: [[1578, 1580, 1610], 256],
          64928: [[1578, 1580, 1609], 256],
          64929: [[1578, 1582, 1610], 256],
          64930: [[1578, 1582, 1609], 256],
          64931: [[1578, 1605, 1610], 256],
          64932: [[1578, 1605, 1609], 256],
          64933: [[1580, 1605, 1610], 256],
          64934: [[1580, 1581, 1609], 256],
          64935: [[1580, 1605, 1609], 256],
          64936: [[1587, 1582, 1609], 256],
          64937: [[1589, 1581, 1610], 256],
          64938: [[1588, 1581, 1610], 256],
          64939: [[1590, 1581, 1610], 256],
          64940: [[1604, 1580, 1610], 256],
          64941: [[1604, 1605, 1610], 256],
          64942: [[1610, 1581, 1610], 256],
          64943: [[1610, 1580, 1610], 256],
          64944: [[1610, 1605, 1610], 256],
          64945: [[1605, 1605, 1610], 256],
          64946: [[1602, 1605, 1610], 256],
          64947: [[1606, 1581, 1610], 256],
          64948: [[1602, 1605, 1581], 256],
          64949: [[1604, 1581, 1605], 256],
          64950: [[1593, 1605, 1610], 256],
          64951: [[1603, 1605, 1610], 256],
          64952: [[1606, 1580, 1581], 256],
          64953: [[1605, 1582, 1610], 256],
          64954: [[1604, 1580, 1605], 256],
          64955: [[1603, 1605, 1605], 256],
          64956: [[1604, 1580, 1605], 256],
          64957: [[1606, 1580, 1581], 256],
          64958: [[1580, 1581, 1610], 256],
          64959: [[1581, 1580, 1610], 256],
          64960: [[1605, 1580, 1610], 256],
          64961: [[1601, 1605, 1610], 256],
          64962: [[1576, 1581, 1610], 256],
          64963: [[1603, 1605, 1605], 256],
          64964: [[1593, 1580, 1605], 256],
          64965: [[1589, 1605, 1605], 256],
          64966: [[1587, 1582, 1610], 256],
          64967: [[1606, 1580, 1610], 256],
          65008: [[1589, 1604, 1746], 256],
          65009: [[1602, 1604, 1746], 256],
          65010: [[1575, 1604, 1604, 1607], 256],
          65011: [[1575, 1603, 1576, 1585], 256],
          65012: [[1605, 1581, 1605, 1583], 256],
          65013: [[1589, 1604, 1593, 1605], 256],
          65014: [[1585, 1587, 1608, 1604], 256],
          65015: [[1593, 1604, 1610, 1607], 256],
          65016: [[1608, 1587, 1604, 1605], 256],
          65017: [[1589, 1604, 1609], 256],
          65018: [[1589, 1604, 1609, 32, 1575, 1604, 1604, 1607, 32, 1593, 1604, 1610, 1607, 32, 1608, 1587, 1604, 1605], 256],
          65019: [[1580, 1604, 32, 1580, 1604, 1575, 1604, 1607], 256],
          65020: [[1585, 1740, 1575, 1604], 256]
        },
        65024: {
          65040: [[44], 256],
          65041: [[12289], 256],
          65042: [[12290], 256],
          65043: [[58], 256],
          65044: [[59], 256],
          65045: [[33], 256],
          65046: [[63], 256],
          65047: [[12310], 256],
          65048: [[12311], 256],
          65049: [[8230], 256],
          65056: [, 230],
          65057: [, 230],
          65058: [, 230],
          65059: [, 230],
          65060: [, 230],
          65061: [, 230],
          65062: [, 230],
          65063: [, 220],
          65064: [, 220],
          65065: [, 220],
          65066: [, 220],
          65067: [, 220],
          65068: [, 220],
          65069: [, 220],
          65072: [[8229], 256],
          65073: [[8212], 256],
          65074: [[8211], 256],
          65075: [[95], 256],
          65076: [[95], 256],
          65077: [[40], 256],
          65078: [[41], 256],
          65079: [[123], 256],
          65080: [[125], 256],
          65081: [[12308], 256],
          65082: [[12309], 256],
          65083: [[12304], 256],
          65084: [[12305], 256],
          65085: [[12298], 256],
          65086: [[12299], 256],
          65087: [[12296], 256],
          65088: [[12297], 256],
          65089: [[12300], 256],
          65090: [[12301], 256],
          65091: [[12302], 256],
          65092: [[12303], 256],
          65095: [[91], 256],
          65096: [[93], 256],
          65097: [[8254], 256],
          65098: [[8254], 256],
          65099: [[8254], 256],
          65100: [[8254], 256],
          65101: [[95], 256],
          65102: [[95], 256],
          65103: [[95], 256],
          65104: [[44], 256],
          65105: [[12289], 256],
          65106: [[46], 256],
          65108: [[59], 256],
          65109: [[58], 256],
          65110: [[63], 256],
          65111: [[33], 256],
          65112: [[8212], 256],
          65113: [[40], 256],
          65114: [[41], 256],
          65115: [[123], 256],
          65116: [[125], 256],
          65117: [[12308], 256],
          65118: [[12309], 256],
          65119: [[35], 256],
          65120: [[38], 256],
          65121: [[42], 256],
          65122: [[43], 256],
          65123: [[45], 256],
          65124: [[60], 256],
          65125: [[62], 256],
          65126: [[61], 256],
          65128: [[92], 256],
          65129: [[36], 256],
          65130: [[37], 256],
          65131: [[64], 256],
          65136: [[32, 1611], 256],
          65137: [[1600, 1611], 256],
          65138: [[32, 1612], 256],
          65140: [[32, 1613], 256],
          65142: [[32, 1614], 256],
          65143: [[1600, 1614], 256],
          65144: [[32, 1615], 256],
          65145: [[1600, 1615], 256],
          65146: [[32, 1616], 256],
          65147: [[1600, 1616], 256],
          65148: [[32, 1617], 256],
          65149: [[1600, 1617], 256],
          65150: [[32, 1618], 256],
          65151: [[1600, 1618], 256],
          65152: [[1569], 256],
          65153: [[1570], 256],
          65154: [[1570], 256],
          65155: [[1571], 256],
          65156: [[1571], 256],
          65157: [[1572], 256],
          65158: [[1572], 256],
          65159: [[1573], 256],
          65160: [[1573], 256],
          65161: [[1574], 256],
          65162: [[1574], 256],
          65163: [[1574], 256],
          65164: [[1574], 256],
          65165: [[1575], 256],
          65166: [[1575], 256],
          65167: [[1576], 256],
          65168: [[1576], 256],
          65169: [[1576], 256],
          65170: [[1576], 256],
          65171: [[1577], 256],
          65172: [[1577], 256],
          65173: [[1578], 256],
          65174: [[1578], 256],
          65175: [[1578], 256],
          65176: [[1578], 256],
          65177: [[1579], 256],
          65178: [[1579], 256],
          65179: [[1579], 256],
          65180: [[1579], 256],
          65181: [[1580], 256],
          65182: [[1580], 256],
          65183: [[1580], 256],
          65184: [[1580], 256],
          65185: [[1581], 256],
          65186: [[1581], 256],
          65187: [[1581], 256],
          65188: [[1581], 256],
          65189: [[1582], 256],
          65190: [[1582], 256],
          65191: [[1582], 256],
          65192: [[1582], 256],
          65193: [[1583], 256],
          65194: [[1583], 256],
          65195: [[1584], 256],
          65196: [[1584], 256],
          65197: [[1585], 256],
          65198: [[1585], 256],
          65199: [[1586], 256],
          65200: [[1586], 256],
          65201: [[1587], 256],
          65202: [[1587], 256],
          65203: [[1587], 256],
          65204: [[1587], 256],
          65205: [[1588], 256],
          65206: [[1588], 256],
          65207: [[1588], 256],
          65208: [[1588], 256],
          65209: [[1589], 256],
          65210: [[1589], 256],
          65211: [[1589], 256],
          65212: [[1589], 256],
          65213: [[1590], 256],
          65214: [[1590], 256],
          65215: [[1590], 256],
          65216: [[1590], 256],
          65217: [[1591], 256],
          65218: [[1591], 256],
          65219: [[1591], 256],
          65220: [[1591], 256],
          65221: [[1592], 256],
          65222: [[1592], 256],
          65223: [[1592], 256],
          65224: [[1592], 256],
          65225: [[1593], 256],
          65226: [[1593], 256],
          65227: [[1593], 256],
          65228: [[1593], 256],
          65229: [[1594], 256],
          65230: [[1594], 256],
          65231: [[1594], 256],
          65232: [[1594], 256],
          65233: [[1601], 256],
          65234: [[1601], 256],
          65235: [[1601], 256],
          65236: [[1601], 256],
          65237: [[1602], 256],
          65238: [[1602], 256],
          65239: [[1602], 256],
          65240: [[1602], 256],
          65241: [[1603], 256],
          65242: [[1603], 256],
          65243: [[1603], 256],
          65244: [[1603], 256],
          65245: [[1604], 256],
          65246: [[1604], 256],
          65247: [[1604], 256],
          65248: [[1604], 256],
          65249: [[1605], 256],
          65250: [[1605], 256],
          65251: [[1605], 256],
          65252: [[1605], 256],
          65253: [[1606], 256],
          65254: [[1606], 256],
          65255: [[1606], 256],
          65256: [[1606], 256],
          65257: [[1607], 256],
          65258: [[1607], 256],
          65259: [[1607], 256],
          65260: [[1607], 256],
          65261: [[1608], 256],
          65262: [[1608], 256],
          65263: [[1609], 256],
          65264: [[1609], 256],
          65265: [[1610], 256],
          65266: [[1610], 256],
          65267: [[1610], 256],
          65268: [[1610], 256],
          65269: [[1604, 1570], 256],
          65270: [[1604, 1570], 256],
          65271: [[1604, 1571], 256],
          65272: [[1604, 1571], 256],
          65273: [[1604, 1573], 256],
          65274: [[1604, 1573], 256],
          65275: [[1604, 1575], 256],
          65276: [[1604, 1575], 256]
        },
        65280: {
          65281: [[33], 256],
          65282: [[34], 256],
          65283: [[35], 256],
          65284: [[36], 256],
          65285: [[37], 256],
          65286: [[38], 256],
          65287: [[39], 256],
          65288: [[40], 256],
          65289: [[41], 256],
          65290: [[42], 256],
          65291: [[43], 256],
          65292: [[44], 256],
          65293: [[45], 256],
          65294: [[46], 256],
          65295: [[47], 256],
          65296: [[48], 256],
          65297: [[49], 256],
          65298: [[50], 256],
          65299: [[51], 256],
          65300: [[52], 256],
          65301: [[53], 256],
          65302: [[54], 256],
          65303: [[55], 256],
          65304: [[56], 256],
          65305: [[57], 256],
          65306: [[58], 256],
          65307: [[59], 256],
          65308: [[60], 256],
          65309: [[61], 256],
          65310: [[62], 256],
          65311: [[63], 256],
          65312: [[64], 256],
          65313: [[65], 256],
          65314: [[66], 256],
          65315: [[67], 256],
          65316: [[68], 256],
          65317: [[69], 256],
          65318: [[70], 256],
          65319: [[71], 256],
          65320: [[72], 256],
          65321: [[73], 256],
          65322: [[74], 256],
          65323: [[75], 256],
          65324: [[76], 256],
          65325: [[77], 256],
          65326: [[78], 256],
          65327: [[79], 256],
          65328: [[80], 256],
          65329: [[81], 256],
          65330: [[82], 256],
          65331: [[83], 256],
          65332: [[84], 256],
          65333: [[85], 256],
          65334: [[86], 256],
          65335: [[87], 256],
          65336: [[88], 256],
          65337: [[89], 256],
          65338: [[90], 256],
          65339: [[91], 256],
          65340: [[92], 256],
          65341: [[93], 256],
          65342: [[94], 256],
          65343: [[95], 256],
          65344: [[96], 256],
          65345: [[97], 256],
          65346: [[98], 256],
          65347: [[99], 256],
          65348: [[100], 256],
          65349: [[101], 256],
          65350: [[102], 256],
          65351: [[103], 256],
          65352: [[104], 256],
          65353: [[105], 256],
          65354: [[106], 256],
          65355: [[107], 256],
          65356: [[108], 256],
          65357: [[109], 256],
          65358: [[110], 256],
          65359: [[111], 256],
          65360: [[112], 256],
          65361: [[113], 256],
          65362: [[114], 256],
          65363: [[115], 256],
          65364: [[116], 256],
          65365: [[117], 256],
          65366: [[118], 256],
          65367: [[119], 256],
          65368: [[120], 256],
          65369: [[121], 256],
          65370: [[122], 256],
          65371: [[123], 256],
          65372: [[124], 256],
          65373: [[125], 256],
          65374: [[126], 256],
          65375: [[10629], 256],
          65376: [[10630], 256],
          65377: [[12290], 256],
          65378: [[12300], 256],
          65379: [[12301], 256],
          65380: [[12289], 256],
          65381: [[12539], 256],
          65382: [[12530], 256],
          65383: [[12449], 256],
          65384: [[12451], 256],
          65385: [[12453], 256],
          65386: [[12455], 256],
          65387: [[12457], 256],
          65388: [[12515], 256],
          65389: [[12517], 256],
          65390: [[12519], 256],
          65391: [[12483], 256],
          65392: [[12540], 256],
          65393: [[12450], 256],
          65394: [[12452], 256],
          65395: [[12454], 256],
          65396: [[12456], 256],
          65397: [[12458], 256],
          65398: [[12459], 256],
          65399: [[12461], 256],
          65400: [[12463], 256],
          65401: [[12465], 256],
          65402: [[12467], 256],
          65403: [[12469], 256],
          65404: [[12471], 256],
          65405: [[12473], 256],
          65406: [[12475], 256],
          65407: [[12477], 256],
          65408: [[12479], 256],
          65409: [[12481], 256],
          65410: [[12484], 256],
          65411: [[12486], 256],
          65412: [[12488], 256],
          65413: [[12490], 256],
          65414: [[12491], 256],
          65415: [[12492], 256],
          65416: [[12493], 256],
          65417: [[12494], 256],
          65418: [[12495], 256],
          65419: [[12498], 256],
          65420: [[12501], 256],
          65421: [[12504], 256],
          65422: [[12507], 256],
          65423: [[12510], 256],
          65424: [[12511], 256],
          65425: [[12512], 256],
          65426: [[12513], 256],
          65427: [[12514], 256],
          65428: [[12516], 256],
          65429: [[12518], 256],
          65430: [[12520], 256],
          65431: [[12521], 256],
          65432: [[12522], 256],
          65433: [[12523], 256],
          65434: [[12524], 256],
          65435: [[12525], 256],
          65436: [[12527], 256],
          65437: [[12531], 256],
          65438: [[12441], 256],
          65439: [[12442], 256],
          65440: [[12644], 256],
          65441: [[12593], 256],
          65442: [[12594], 256],
          65443: [[12595], 256],
          65444: [[12596], 256],
          65445: [[12597], 256],
          65446: [[12598], 256],
          65447: [[12599], 256],
          65448: [[12600], 256],
          65449: [[12601], 256],
          65450: [[12602], 256],
          65451: [[12603], 256],
          65452: [[12604], 256],
          65453: [[12605], 256],
          65454: [[12606], 256],
          65455: [[12607], 256],
          65456: [[12608], 256],
          65457: [[12609], 256],
          65458: [[12610], 256],
          65459: [[12611], 256],
          65460: [[12612], 256],
          65461: [[12613], 256],
          65462: [[12614], 256],
          65463: [[12615], 256],
          65464: [[12616], 256],
          65465: [[12617], 256],
          65466: [[12618], 256],
          65467: [[12619], 256],
          65468: [[12620], 256],
          65469: [[12621], 256],
          65470: [[12622], 256],
          65474: [[12623], 256],
          65475: [[12624], 256],
          65476: [[12625], 256],
          65477: [[12626], 256],
          65478: [[12627], 256],
          65479: [[12628], 256],
          65482: [[12629], 256],
          65483: [[12630], 256],
          65484: [[12631], 256],
          65485: [[12632], 256],
          65486: [[12633], 256],
          65487: [[12634], 256],
          65490: [[12635], 256],
          65491: [[12636], 256],
          65492: [[12637], 256],
          65493: [[12638], 256],
          65494: [[12639], 256],
          65495: [[12640], 256],
          65498: [[12641], 256],
          65499: [[12642], 256],
          65500: [[12643], 256],
          65504: [[162], 256],
          65505: [[163], 256],
          65506: [[172], 256],
          65507: [[175], 256],
          65508: [[166], 256],
          65509: [[165], 256],
          65510: [[8361], 256],
          65512: [[9474], 256],
          65513: [[8592], 256],
          65514: [[8593], 256],
          65515: [[8594], 256],
          65516: [[8595], 256],
          65517: [[9632], 256],
          65518: [[9675], 256]
        }
      };
      /***** Module to export */

      var unorm = {
        nfc: nfc,
        nfd: nfd,
        nfkc: nfkc,
        nfkd: nfkd
      };
      /*globals module:true,define:true*/
      // CommonJS

      {
        module.exports = unorm; // AMD
      }
      /***** Export as shim for String::normalize method *****/

      /*
         http://wiki.ecmascript.org/doku.php?id=harmony:specification_drafts#november_8_2013_draft_rev_21
          21.1.3.12 String.prototype.normalize(form="NFC")
         When the normalize method is called with one argument form, the following steps are taken:
          1. Let O be CheckObjectCoercible(this value).
         2. Let S be ToString(O).
         3. ReturnIfAbrupt(S).
         4. If form is not provided or undefined let form be "NFC".
         5. Let f be ToString(form).
         6. ReturnIfAbrupt(f).
         7. If f is not one of "NFC", "NFD", "NFKC", or "NFKD", then throw a RangeError Exception.
         8. Let ns be the String value is the result of normalizing S into the normalization form named by f as specified in Unicode Standard Annex #15, UnicodeNormalizatoin Forms.
         9. Return ns.
          The length property of the normalize method is 0.
          *NOTE* The normalize function is intentionally generic; it does not require that its this value be a String object. Therefore it can be transferred to other kinds of objects for use as a method.
      */


      unorm.shimApplied = false;

      if (!String.prototype.normalize) {
        Object.defineProperty(String.prototype, "normalize", {
          enumerable: false,
          configurable: true,
          writable: true,
          value: function normalize()
          /*form*/
          {
            var str = "" + this;
            var form = arguments[0] === undefined ? "NFC" : arguments[0];

            if (this === null || this === undefined) {
              throw new TypeError("Cannot call method on " + Object.prototype.toString.call(this));
            }

            if (form === "NFC") {
              return unorm.nfc(str);
            } else if (form === "NFD") {
              return unorm.nfd(str);
            } else if (form === "NFKC") {
              return unorm.nfkc(str);
            } else if (form === "NFKD") {
              return unorm.nfkd(str);
            } else {
              throw new RangeError("Invalid normalization form: " + form);
            }
          }
        });
        unorm.shimApplied = true;
      }
    })();
  });

  var uslug = createCommonjsModule$1(function (module) {
    (function () {
      var L$1 = L.L,
          N$1 = N.N,
          Z = Z$1.Z,
          M$1 = M.M,
          unorm$1 = unorm;

      var _unicodeCategory = function _unicodeCategory(code) {
        if (~L$1.indexOf(code)) return 'L';
        if (~N$1.indexOf(code)) return 'N';
        if (~Z.indexOf(code)) return 'Z';
        if (~M$1.indexOf(code)) return 'M';
        return undefined;
      };

      module.exports = function (string, options) {
        string = string || '';
        options = options || {};
        var allowedChars = options.allowedChars || '-_~';
        var lower = typeof options.lower === 'boolean' ? options.lower : true;
        var spaces = typeof options.spaces === 'boolean' ? options.spaces : false;
        var rv = [];
        var chars = unorm$1.nfkc(string);

        for (var i = 0; i < chars.length; i++) {
          var c = chars[i];
          var code = c.charCodeAt(0); // Allow Common CJK Unified Ideographs
          // See: http://www.unicode.org/versions/Unicode6.0.0/ch12.pdf - Table 12-2 

          if (0x4E00 <= code && code <= 0x9FFF) {
            rv.push(c);
            continue;
          } // Allow Hangul


          if (0xAC00 <= code && code <= 0xD7A3) {
            rv.push(c);
            continue;
          } // Japanese ideographic punctuation


          if (0x3000 <= code && code <= 0x3002 || 0xFF01 <= code && code <= 0xFF02) {
            rv.push(' ');
          }

          if (allowedChars.indexOf(c) != -1) {
            rv.push(c);
            continue;
          }

          var val = _unicodeCategory(code);

          if (val && ~'LNM'.indexOf(val)) rv.push(c);
          if (val && ~'Z'.indexOf(val)) rv.push(' ');
        }

        var slug = rv.join('').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
        if (!spaces) slug = slug.replace(/[\s\-]+/g, '-');
        if (lower) slug = slug.toLowerCase();
        return slug;
      };
    })();
  });

  var uslug$1 = uslug;

  /*! markdown-it-toc-done-right 4.2.0-5 https://github.com//GerHobbelt/markdown-it-toc-done-right @license MIT */
  function slugify$1(x) {
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
      slugify: slugify$1,
      uniqueSlugStartIndex: 2,
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
    var ast;
    var pattern = new RegExp('^' + options.placeholder + '$', 'i');

    function toc(state, startLine, endLine, silent) {
      var token;
      var pos = state.bMarks[startLine] + state.tShift[startLine];
      var max = state.eMarks[startLine]; // use whitespace as a line tokenizer and extract the first token
      // to test against the placeholder anchored pattern, rejecting if false

      var lineFirstToken = state.src.slice(pos, max).split(' ')[0];
      if (!pattern.test(lineFirstToken)) return false;
      if (silent) return true;
      var matches = pattern.exec(lineFirstToken);
      var inlineOptions = {};

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
      var token = tokens[idx];

      var _options = Object.assign({}, options, token.inlineOptions);

      var id = _options.containerId ? " id=\"" + htmlencode(_options.containerId) + "\"" : '';
      return "<nav" + id + " class=\"" + htmlencode(_options.containerClass) + "\">";
    };

    md.renderer.rules.tocClose = function ()
    /* tokens, idx, options, env, renderer */
    {
      return '</nav>';
    };

    md.renderer.rules.tocBody = function (tokens, idx
    /* , options, env, renderer */
    ) {
      var token = tokens[idx];

      var _options = Object.assign({}, options, token.inlineOptions);

      var uniques = new Map();

      function unique(slug, failOnNonUnique) {
        // If first slug, return as is.
        var key = slug;
        var n = _options.uniqueSlugStartIndex;

        while (uniques.has(key)) {
          // Duplicate slug, add a `-2`, `-3`, etc. to keep ID unique.
          key = slug + "-" + n++;
        }

        if (n > _options.uniqueSlugStartIndex && failOnNonUnique) {
          throw new Error("The ID attribute '" + slug + "' defined by user or other markdown-it plugin is not unique. Please fix it in your markdown to continue.");
        } // Mark this slug as used in the environment.


        uniques.set(key, true);
        return key;
      }

      var isLevelSelectedNumber = function isLevelSelectedNumber(selection) {
        return function (level) {
          return level <= selection;
        };
      };

      var isLevelSelectedArray = function isLevelSelectedArray(selection) {
        return function (level) {
          return selection.includes(level);
        };
      };

      var isLevelSelected = Array.isArray(_options.level) ? isLevelSelectedArray(_options.level) : isLevelSelectedNumber(_options.level);

      function ast2html(tree, level) {
        var listClass = _options.listClass ? " class=\"" + htmlencode(_options.listClass) + "\"" : '';
        var itemClass = _options.itemClass ? " class=\"" + htmlencode(_options.itemClass) + "\"" : '';
        var linkClass = _options.linkClass ? " class=\"" + htmlencode(_options.linkClass) + "\"" : '';
        if (tree.c.length === 0) return '';
        var buffer = '';

        if (tree.l === 0 || isLevelSelected(tree.l + 1)) {
          buffer += "<" + (htmlencode(_options.listType) + listClass) + ">";
        }

        tree.c.forEach(function (node) {
          // first, check if the heading already has an ID attribute:
          // if it has, use that one!
          var slug = node.token.attrGet('id');

          if (isLevelSelected(node.l)) {
            if (slug == null) {
              slug = unique(options.slugify(node.n), false); // and register the ID for this heading,
              // so it won't have to be re-generated by other plugins,
              // resulting in consistent ID usage in the page:

              node.token.attrSet('id', slug);
            }

            buffer += "<li" + itemClass + "><a" + linkClass + " href=\"#" + slug + "\">" + (typeof _options.format === 'function' ? _options.format(node.n, htmlencode) : htmlencode(node.n)) + "</a>" + ast2html(node) + "</li>";
          } else {
            buffer += ast2html(node);
          }
        });

        if (tree.l === 0 || isLevelSelected(tree.l + 1)) {
          buffer += "</" + htmlencode(_options.listType) + ">";
        }

        return buffer;
      }

      tokens.filter(function (token) {
        return token.type === 'heading_open';
      }).forEach(function (token) {
        // Before we do anything, we must collect all previously defined ID attributes to ensure we won't generate any duplicates:
        var slug = token.attrGet('id');

        if (slug != null) {
          // mark existing slug/ID as unique, at least.
          // IFF it collides, FAIL!
          unique(slug, true);
        }
      });
      return ast2html(ast);
    };

    function headings2ast(tokens) {
      var ast = {
        l: 0,
        n: '',
        c: []
      };
      var stack = [ast];

      for (var i = 0, iK = tokens.length; i < iK; i++) {
        var token = tokens[i];

        if (token.type === 'heading_open') {
          var keyparts = [];

          for (var j = i + 1; j < iK; j++) {
            var _token = tokens[j];

            if (_token.type === 'heading_close') {
              break;
            }

            if (!_token.children) {
              continue;
            }

            var keypart = _token.children.filter(function (token) {
              return token.type === 'text' || token.type === 'code_inline';
            }).reduce(function (acc, t) {
              return acc + t.content;
            }, '').trim();

            if (keypart.length > 0) {
              keyparts.push(keypart);
            }
          }

          var key = keyparts.join(' ');
          var node = {
            l: parseInt(token.tag.substr(1), 10),
            n: key,
            c: [],
            token: token
          };

          if (node.l > stack[0].l) {
            stack[0].c.push(node);
            stack.unshift(node);
          } else if (node.l === stack[0].l) {
            stack[1].c.push(node);
            stack[0] = node;
          } else {
            while (node.l <= stack[0].l) {
              stack.shift();
            }

            stack[0].c.push(node);
            stack.unshift(node);
          }
        }
      }

      return ast;
    }

    md.core.ruler.push('generateTocAst', function (state) {
      var tokens = state.tokens;
      ast = headings2ast(tokens);

      if (typeof options.callback === 'function') {
        for (var i = 0, iK = tokens.length; i < iK; i++) {
          var token = tokens[i];

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

  var markdownItTocDoneRight = {
    __proto__: null,
    'default': tocPlugin
  };

  // this file will be processed by rollup/microbundle to produce assets/demo.js,
  var demo = {
    markdownit: markdownIt,
    markdownItAnchor: markdownItAnchor,
    uslug: uslug$1,
    markdownItTocDoneRight: markdownItTocDoneRight
  }; // set up the global `window` object as well:

  for (var _i = 0, _Object$keys = Object.keys(demo); _i < _Object$keys.length; _i++) {
    var key = _Object$keys[_i];
    window[key] = demo[key];
  } // dummy export to appease microbundle:

  return demo;

}());
