(function(global) {
const ZWNJ = '\u200c';
const VERB_PREFIXES = ['می‌', 'نمی‌', 'ب'];
const VERB_ENDINGS = [
  ['م', 'م'], ['ی', 'ی'], ['د', 'ه'],
  ['یم', 'یم'], ['ید', 'ین'], ['ند', 'ن']
];
const preparedRuleCache = new WeakMap();

// Expand compact verb stems once when rules are loaded, not for each text.
function prepareRules(rules) {
  if (!rules || typeof rules !== 'object') throw new TypeError('Rules must be an object.');
  const cached = preparedRuleCache.get(rules);
  if (cached) return cached;

  const verbs = Array.isArray(rules.verbs) ? rules.verbs.slice() : [];
  const seenSources = new Set();
  for (const pair of verbs) {
    if (Array.isArray(pair) && pair[0]) seenSources.add(pair[0]);
  }

  for (const stem of Array.isArray(rules.verb_stems) ? rules.verb_stems : []) {
    if (!stem || typeof stem.f !== 'string' || typeof stem.c !== 'string' || !stem.f || !stem.c) continue;
    const formal = stem.f + (typeof stem.link === 'string' ? stem.link : '');
    for (const prefix of VERB_PREFIXES) {
      for (const [formalEnding, colloquialEnding] of VERB_ENDINGS) {
        const source = prefix + formal + formalEnding;
        const replacement = prefix + stem.c + colloquialEnding;
        // Explicit rules always win, so irregular verbs remain hand-authored.
        if (source !== replacement && !seenSources.has(source)) {
          verbs.push([source, replacement]);
          seenSources.add(source);
        }
      }
    }
  }

  const prepared = Object.assign({}, rules, { verbs });
  preparedRuleCache.set(rules, prepared);
  preparedRuleCache.set(prepared, prepared);
  return prepared;
}

function parseRules(json) {
  return prepareRules(JSON.parse(json));
}

// الگوی منعطف: نیم‌فاصله‌های میانی اختیاری، اولیِ قواعد پسوند/پیشوند اجباری
function makeFlexiblePattern(source, anchorStart = false) {
  let pattern = '';
  source.split('').forEach((char, i) => {
    if (char === ZWNJ) {
      // نیم‌فاصله اول قاعده فقط در پسوند اجباریه تا وسط کلمه‌ها مچ نشه
      pattern += (anchorStart && i === 0) ? ZWNJ : '[ \\u200c]?';
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  });
  return pattern;
}

function replacePairs(text, pairs, kind = 'general', suffixes = []) {
  const mapping = new Map();
  for (const [src, dst] of pairs) {
    if (src && src !== dst) mapping.set(src, dst);
  }
  if (mapping.size === 0) return text;

  // مرتب‌سازی: طولانی‌ترین اول
  const sortedSources = Array.from(mapping.keys()).sort((a, b) => b.length - a.length);

  const anchored = (kind === 'suffix' || kind === 'prefix');
  const patterns = sortedSources.map((src, i) => `(?<rule${i}>${makeFlexiblePattern(src, anchored)})`);
  const combined = patterns.join('|');

  let regexStr = '';
  if (kind === 'prefix') {
    regexStr = `(?<![\\p{L}\\p{N}\\u200c])(?:${combined})(?=[\\p{L}])`;
  } else if (kind === 'suffix') {
    regexStr = `(?:${combined})(?![\\p{L}\\p{N}\\u200c])`;
  } else if (kind === 'word') {
    const joined = suffixes
      .filter(([s]) => s.startsWith(ZWNJ))
      .map(([s]) => makeFlexiblePattern(s.slice(1)));
    const extra = joined.length ? `|(?=(?:${joined.join('|')})(?![\\p{L}\\p{N}\\u200c]))` : '';
    regexStr = `(?<![\\p{L}\\p{N}\\u200c])(?:${combined})((?![\\p{L}\\p{N}])${extra})`;
  } else {
    regexStr = `(?<![\\p{L}\\p{N}\\u200c])(?:${combined})(?![\\p{L}\\p{N}\\u200c])`;
  }

  const regex = new RegExp(regexStr, 'gu');

  return text.replace(regex, (...args) => {
    const groups = args[args.length - 1];
    for (let i = 0; i < sortedSources.length; i++) {
      if (groups[`rule${i}`] !== undefined) {
        return mapping.get(sortedSources[i]);
      }
    }
    return args[0];
  });
}

function replaceContextualPairs(text, rules) {
  let result = text;
  for (const [source, replacement, rawContexts] of rules || []) {
    if (!source || !replacement || !Array.isArray(rawContexts)) continue;
    const contexts = rawContexts.filter(Boolean).sort((a, b) => b.length - a.length);
    for (const context of contexts) {
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}\\u200c])(${makeFlexiblePattern(context)})([ \\u200c]+)` +
        `${makeFlexiblePattern(source)}(?![\\p{L}\\p{N}\\u200c])`,
        'gu'
      );
      result = result.replace(pattern, (_, before, separator) => before + separator + replacement);
    }
  }
  return result;
}

function transform(text, inputRules) {
  const rules = prepareRules(inputRules);
  const suffixes = Array.isArray(rules.suffixes) ? rules.suffixes : [];
  let result = replacePairs(text, rules.normalizations || []);
  result = replacePairs(result, rules.prefixes || [], 'prefix');
  result = replacePairs(result, rules.phrases || []);
  result = replaceContextualPairs(result, rules.contextualVerbs || []);
  result = replacePairs(result, suffixes, 'suffix');
  result = replacePairs(result, rules.words || [], 'word', suffixes);
  return replacePairs(result, rules.verbs || []);
}

if (typeof module !== 'undefined') module.exports = { makeFlexiblePattern, replacePairs, parseRules, prepareRules, transform };

  global.ColloquialCore = { makeFlexiblePattern, replacePairs, parseRules, prepareRules, transform };
})(globalThis);
