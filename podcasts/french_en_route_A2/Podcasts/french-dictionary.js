/*
 * ============================================================
 * FRENCH DICTIONARY HOVER SCRIPT
 * ============================================================
 *
 * Purpose:
 *
 * - Reads vocabulary from a global `allWords` array.
 * - Scans French transcript text.
 * - Finds words and multi-word expressions from your vocabulary.
 * - Wraps matching vocabulary in <abbr>.
 * - Hovering shows:
 *      English meaning
 *      pronunciation
 *      category
 *
 * This script does NOT control audio.
 *
 * ============================================================
 */

document.addEventListener('DOMContentLoaded', function () {
  /*
   * ========================================================
   * 1. CHECK VOCABULARY DATABASE
   * ========================================================
   */

  if (typeof allWords === 'undefined' || !Array.isArray(allWords)) {
    console.error(
      'French Dictionary: allWords vocabulary array was not found.',
    );

    return;
  }

  /*
   * ========================================================
   * 2. SETTINGS
   * ========================================================
   */

  // Maximum number of words in one vocabulary expression.
  //
  // Example:
  //
  // "de l'autre côté"
  //
  // The script tries longer expressions before individual words.

  const MAX_PHRASE_WORDS = 4;

  /*
   * Only scan transcript text.
   *
   * Your podcast HTML uses:
   *
   * .transcript_tag_body
   */

  const TRANSCRIPT_SELECTOR = '.transcript_tag_body';

  /*
   * ========================================================
   * 3. NORMALIZE FRENCH
   * ========================================================
   *
   * Makes:
   *
   * C’EST
   * c'est
   * c‘est
   *
   * behave consistently.
   */

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * ========================================================
   * 4. MERGE DUPLICATE VOCABULARY
   * ========================================================
   *
   * If your vocabulary contains:
   *
   * plage → beach
   * plage → seaside
   *
   * the tooltip becomes:
   *
   * beach | seaside
   */

  const mergedDictionary = Object.values(
    allWords.reduce((accumulator, word) => {
      const key = normalize(word?.french);

      if (!key) {
        return accumulator;
      }

      if (!accumulator[key]) {
        accumulator[key] = {
          french: String(word.french || '').trim(),

          english: [],

          pronunciation: String(word.pronunciation || '').trim(),

          category: String(word.category || '').trim(),
        };
      }

      const english = String(word.english || '').trim();

      if (english && !accumulator[key].english.includes(english)) {
        accumulator[key].english.push(english);
      }

      /*
       * If the first duplicate had no pronunciation,
       * use a later one.
       */

      if (!accumulator[key].pronunciation && word.pronunciation) {
        accumulator[key].pronunciation = String(word.pronunciation).trim();
      }

      /*
       * Same for category.
       */

      if (!accumulator[key].category && word.category) {
        accumulator[key].category = String(word.category).trim();
      }

      return accumulator;
    }, {}),
  );

  /*
   * Convert English meaning arrays into strings.
   */

  const vocabulary = mergedDictionary.map((item) => ({
    ...item,

    english: item.english.join(' | '),
  }));

  /*
   * ========================================================
   * 5. FAST LOOKUP MAP
   * ========================================================
   */

  const vocabularyMap = new Map(
    vocabulary.map((item) => [normalize(item.french), item]),
  );

  /*
   * ========================================================
   * 6. WORDS ENDING WITH S THAT ARE NOT PLURALS
   * ========================================================
   *
   * Prevent:
   *
   * pas → pa
   * très → trè
   * temps → temp
   */

  const noSingularSWords = new Set([
    'pas',
    'plus',
    'très',
    'temps',
    'cours',
    'pays',
    'toujours',
    'alors',
    'dans',
    'mais',
    'sous',
    'sans',
    'vers',
  ]);

  /*
   * ========================================================
   * 7. TOKENIZE FRENCH
   * ========================================================
   *
   * Recognizes:
   *
   * forêt
   * aujourd'hui
   * d'où
   * peut-être
   * l'océan
   */

  function tokenizeFrench(text) {
    const regex = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’‘`-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

    return [...String(text || '').matchAll(regex)].map((match) => ({
      text: match[0],

      normalized: normalize(match[0]),

      start: match.index,

      end: match.index + match[0].length,
    }));
  }

  /*
   * ========================================================
   * 8. DICTIONARY LOOKUP
   * ========================================================
   */

  function findDictionaryItem(phrase) {
    const normalized = normalize(phrase);

    /*
     * ------------------------------------------------
     * A. EXACT VOCABULARY MATCH
     * ------------------------------------------------
     */

    if (vocabularyMap.has(normalized)) {
      return {
        ...vocabularyMap.get(normalized),

        matchedBy: 'exact',
      };
    }

    /*
     * ------------------------------------------------
     * B. FRENCH CONTRACTIONS
     * ------------------------------------------------
     *
     * l'océan
     *      ↓
     * océan
     *
     * d'été
     *      ↓
     * été
     *
     * qu'il
     *      ↓
     * il
     */

    const contraction = normalized.match(/^(l|d|j|m|t|s|n|c|qu)'(.+)$/);

    if (contraction) {
      const baseWord = contraction[2];

      if (vocabularyMap.has(baseWord)) {
        return {
          ...vocabularyMap.get(baseWord),

          displayedForm: phrase,

          matchedBy: 'contraction',
        };
      }
    }

    /*
     * ------------------------------------------------
     * C. BASIC PLURAL FALLBACK
     * ------------------------------------------------
     *
     * dune → dunes
     * vague → vagues
     */

    if (normalized.endsWith('s') && !noSingularSWords.has(normalized)) {
      const singular = normalized.slice(0, -1);

      if (vocabularyMap.has(singular)) {
        return {
          ...vocabularyMap.get(singular),

          displayedForm: phrase,

          matchedBy: 'plural',
        };
      }
    }

    return null;
  }

  /*
   * ========================================================
   * 9. FIND BEST VOCABULARY MATCHES
   * ========================================================
   *
   * Longest match wins.
   *
   * Example vocabulary:
   *
   * autre
   * côté
   * de l'autre côté
   *
   * The full expression is preferred.
   */

  function getBestMatches(text, maxWords = MAX_PHRASE_WORDS) {
    const tokens = tokenizeFrench(text);

    const matches = [];

    const usedTokenIndexes = new Set();

    for (let i = 0; i < tokens.length; i++) {
      if (usedTokenIndexes.has(i)) {
        continue;
      }

      let bestMatch = null;

      /*
       * Start with longest expression.
       */

      for (let size = maxWords; size >= 1; size--) {
        const group = tokens.slice(i, i + size);

        if (group.length < size) {
          continue;
        }

        const overlaps = group.some((_, offset) =>
          usedTokenIndexes.has(i + offset),
        );

        if (overlaps) {
          continue;
        }

        /*
         * Re-create vocabulary phrase.
         */

        const phrase = group.map((token) => token.text).join(' ');

        const item = findDictionaryItem(phrase);

        if (item) {
          bestMatch = {
            item,

            start: group[0].start,

            end: group[group.length - 1].end,

            tokenIndexes: group.map((_, offset) => i + offset),
          };

          break;
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);

        bestMatch.tokenIndexes.forEach((index) => usedTokenIndexes.add(index));
      }
    }

    return matches.sort((a, b) => a.start - b.start);
  }

  /*
   * ========================================================
   * 10. TOOLTIP TEXT
   * ========================================================
   */

  function makeTooltip(item) {
    const lines = [];

    /*
     * English meaning
     */

    if (item.english) {
      lines.push(item.english);
    }

    /*
     * Base form.
     *
     * Example:
     *
     * dunes
     * Base: dune
     */

    if (item.matchedBy === 'plural' || item.matchedBy === 'contraction') {
      lines.push(`Base: ${item.french}`);
    }

    /*
     * Pronunciation
     */

    if (item.pronunciation) {
      lines.push(`Pronunciation: ${item.pronunciation}`);
    }

    /*
     * Category
     */

    if (item.category) {
      lines.push(`Type: ${item.category}`);
    }

    return lines.join('\n');
  }

  /*
   * ========================================================
   * 11. CREATE <abbr>
   * ========================================================
   */

  function createAbbreviation(visibleText, dictionaryItem) {
    const abbr = document.createElement('abbr');

    abbr.className = 'french-vocab-word';

    /*
     * Keep the original French text.
     */

    abbr.textContent = visibleText;

    /*
     * Native browser hover tooltip.
     */

    abbr.title = makeTooltip(dictionaryItem);

    /*
     * Store vocabulary information.
     *
     * Useful if we later replace
     * the native tooltip with a
     * custom tooltip.
     */

    abbr.dataset.english = dictionaryItem.english || '';

    abbr.dataset.french = dictionaryItem.french || '';

    abbr.dataset.pronunciation = dictionaryItem.pronunciation || '';

    abbr.dataset.category = dictionaryItem.category || '';

    return abbr;
  }

  /*
   * ========================================================
   * 12. PROCESS ONE TEXT NODE
   * ========================================================
   */

  function processTextNode(textNode) {
    const text = textNode.nodeValue;

    if (!text || !text.trim()) {
      return;
    }

    const matches = getBestMatches(text);

    /*
     * Nothing matched.
     */

    if (matches.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();

    let currentPosition = 0;

    matches.forEach((match) => {
      /*
       * Normal text before vocabulary.
       */

      if (match.start > currentPosition) {
        fragment.appendChild(
          document.createTextNode(text.slice(currentPosition, match.start)),
        );
      }

      /*
       * Matched vocabulary.
       */

      const visibleText = text.slice(
        match.start,

        match.end,
      );

      fragment.appendChild(
        createAbbreviation(
          visibleText,

          match.item,
        ),
      );

      currentPosition = match.end;
    });

    /*
     * Remaining text after last match.
     */

    if (currentPosition < text.length) {
      fragment.appendChild(
        document.createTextNode(text.slice(currentPosition)),
      );
    }

    /*
     * Replace original text.
     */

    textNode.replaceWith(fragment);
  }

  /*
   * ========================================================
   * 13. PROCESS ONE TRANSCRIPT
   * ========================================================
   */

  function processTranscript(transcriptElement) {
    /*
     * Prevent processing twice.
     */

    if (transcriptElement.dataset.dictionaryProcessed === 'true') {
      return;
    }

    const walker = document.createTreeWalker(
      transcriptElement,

      NodeFilter.SHOW_TEXT,

      {
        acceptNode(node) {
          const parent = node.parentElement;

          if (!parent) {
            return NodeFilter.FILTER_REJECT;
          }

          /*
           * Never modify elements
           * inside these tags.
           */

          if (parent.closest('abbr, script, style, textarea, input, button')) {
            return NodeFilter.FILTER_REJECT;
          }

          /*
           * Ignore blank whitespace.
           */

          if (!node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    /*
     * Store nodes before modifying DOM.
     */

    const textNodes = [];

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach(processTextNode);

    transcriptElement.dataset.dictionaryProcessed = 'true';
  }

  /*
   * ========================================================
   * 14. PROCESS ALL VISIBLE TRANSCRIPTS
   * ========================================================
   */

  function processAllTranscripts() {
    const transcripts = document.querySelectorAll(TRANSCRIPT_SELECTOR);

    let processedCount = 0;

    transcripts.forEach((transcript) => {
      /*
       * Find containing timeline block.
       */

      const tagBlock = transcript.closest('.tag_block');

      /*
       * Your French-only player hides
       * English blocks using display:none.
       *
       * Do NOT add dictionary markup
       * to those English transcript blocks.
       */

      if (tagBlock && getComputedStyle(tagBlock).display === 'none') {
        return;
      }

      /*
       * Already processed.
       */

      if (transcript.dataset.dictionaryProcessed === 'true') {
        return;
      }

      processTranscript(transcript);

      processedCount++;
    });

    return processedCount;
  }

  /*
   * ========================================================
   * 15. ABBR / VOCABULARY FORMATTING
   * ========================================================
   *
   * The browser normally gives <abbr> elements
   * a dotted underline.
   *
   * We remove that default formatting and use
   * a subtle orange vocabulary highlight instead.
   */

  function addDictionaryStyles() {
    /*
     * Prevent duplicate style elements.
     */

    if (document.getElementById('french-dictionary-styles')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'french-dictionary-styles';

    style.textContent = `

      /*
       * ==============================================
       * NORMAL VOCABULARY WORD
       * ==============================================
       */

      abbr.french-vocab-word {

        /*
         * Remove normal <abbr> dotted underline.
         */

        text-decoration:
          none !important;

        border-bottom:
          none !important;


        /*
         * Preserve surrounding transcript styling.
         */

        color:
          inherit;

        font:
          inherit;


        /*
         * Very light orange highlight.
         *
         * The RGB value 255,143,91 matches the
         * orange family used by French en Route.
         */

        background-color:
          rgba(
            255,
            143,
            91,
            0.12
          );


        /*
         * Slightly soften highlight edges.
         */

        border-radius:
          3px;


        /*
         * Tiny horizontal spacing around highlight.
         */

        padding:
          0 2px;


        /*
         * Indicates that hovering provides information.
         */

        cursor:
          help;


        /*
         * Smooth hover transition.
         */

        transition:
          background-color
          0.15s ease;

      }


      /*
       * ==============================================
       * HOVER
       * ==============================================
       */

      abbr.french-vocab-word:hover {

        /*
         * Slightly stronger orange when hovering.
         */

        background-color:
          rgba(
            255,
            143,
            91,
            0.30
          );

      }

    `;

    document.head.appendChild(style);
  }

  /*
   * ========================================================
   * 16. INITIALIZE
   * ========================================================
   */

  addDictionaryStyles();

  const processed = processAllTranscripts();

  console.log('📖 French Dictionary enabled.');

  console.log(`Vocabulary entries: ${vocabulary.length}`);

  console.log(`Transcript blocks processed: ${processed}`);

  console.log(
    `Highlighted vocabulary: ${
      document.querySelectorAll('abbr.french-vocab-word').length
    }`,
  );

  /*
   * ========================================================
   * 17. OPTIONAL PUBLIC REFRESH FUNCTION
   * ========================================================
   *
   * If transcript content is dynamically added later:
   *
   * refreshFrenchDictionary();
   */

  window.refreshFrenchDictionary = function () {
    const count = processAllTranscripts();

    console.log(
      `French Dictionary refreshed: ${count} new transcript blocks processed.`,
    );
  };
});
