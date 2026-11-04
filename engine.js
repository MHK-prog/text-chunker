// engine.js
const ColloquialEngine = (() => {
  const ZWNJ = '\u200c';

  // الگو برای نادیده گرفتن اختیاری بودن نیم‌فاصله (نیم‌فاصله، فاصله یا چسبیده)
  function makeFlexiblePattern(source) {
    return source.split('').map(char => {
      if (char === ZWNJ) return '[ \\u200c]?';
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
  }

  function replacePairs(text, pairs, kind = 'general', suffixes = []) {
    const mapping = new Map();
    for (const [src, dst] of pairs) {
      if (src && src !== dst) mapping.set(src, dst);
    }
    if (mapping.size === 0) return text;

    const sortedSources = Array.from(mapping.keys()).sort((a, b) => b.length - a.length);
    const patterns = sortedSources.map((src, i) => `(?<rule${i}>${makeFlexiblePattern(src)})`);
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

  function toTehrani(text, rules) {
    if (!rules) return text;
    let res = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (const [src, dst] of rules.normalizations || []) {
      res = res.replaceAll(src, dst);
    }

    res = replacePairs(res, rules.prefixes || [], 'prefix');
    res = replacePairs(res, rules.phrases || [], 'general');

    const verbs = [...(rules.verbs || [])];
    const negativeVerbs = [];
    for (const [src, dst] of verbs) {
      if (src.startsWith('می‌') && dst.startsWith('می‌')) {
        negativeVerbs.push(['ن' + src, 'ن' + dst]);
      }
    }
    res = replacePairs(res, [...negativeVerbs, ...verbs], 'general');

    res = replacePairs(res, rules.words || [], 'word', rules.suffixes || []);
    res = replacePairs(res, rules.suffixes || [], 'suffix');
    res = replacePairs(res, rules.phrases || [], 'general');

    return res;
  }

  return { toTehrani };
})();
