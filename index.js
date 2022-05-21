const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');

const HEADERS = 'h1,h2,h3,h4,h5,h6,h7';
const DIV_ARTICLE = 'article,.article,#article,section,table,.container';
const BASIC_CONTENT = 'p,h1,h2,h3,h4,h5,h6,h7';
const BAD_TAGS = 'script,link,header,style,noscript,object,footer,nav,iframe,br,svg';

const N0T_A_GOOD_CLASS =
  '.combx,.comment,.disqus,.foot,.header,.menu,.meta,.nav,.rss,.shoutbox,.sidebar,.sponsor,.ssba,.bctt-click-to-tweet,.promo,.promotion';
const N0T_A_GOOD_ID =
  '#combx,#comments,#disqus,#foot,#header,#menu,#meta,#nav,#rss,#shoutbox,#sidebar,#sponsor,#promo,#promotion,#ads';

const CLASS_WEIGHT = 25;
const MIN_LINK_DENSITY = 0.33;
const VERY_GOOD_SCORE = 5;
const GOOD_SCORE = 3;
const BAD_SCORE = -3;
const VERY_BAD_SCORE = -5;

const HALF = 2;
const NBR_CHARS = 100;
const EXTRA_SCORE = 3;

const MIN_CHARS = 25;

const HTML = 'html';
const MD = 'md';
const TXT = 'txt';

const REGEX = {
  positiveRe: /article|body|content|entry|hentry|page|pagination|post|text/i,
  negativeRe: /combx|comment|contact|foot|footer|footnote|link|media|meta|promo|related|scroll|shoutbox|sponsor|tags|widget/i
};

const defaultOptions = {
  // If more then one H1 is found, use the first one as the main title of the page
  useFirstH1: true,

  // Remove the H1 from the main content, the H1 will be in the final json structure
  removeH1FromContent: true,

  // Some site set some links in Hn, if true, we remove them
  removeHeadersWithoutText: true,

  // if true, don't add the images in the final extraction
  removeImages: true,

  // Remove HTML tag figcaption
  removeFigcaptions: true,

  // Replace links by their anchor text
  replaceLinks: true,

  // Remove HTML Form
  removeForm: false,

  // Remove basic html tags that have no children
  removeEmptyTag: false
};


function removeLineBreakTabs(str) {
  return str;
}

/**
 * findContent - Main function of the module
 *
 * Return the main content of a page without menu, header, footer, sidebar, ....
 *
 * @param  {object} $                        Cheerio reference matching to the HTML page
 * @param  {string} type                     the output type : HTML, TXT ot MD (markdown)
 *                                           else the html text is returned
 * @param  {object} o = defaultOptions List of options to change the content output
 * @returns {string}                         The HTML code of the main content of the page
 */
function findContent($, type = HTML, o = defaultOptions) {
  const options = { ...o, ...defaultOptions };

  // Get the title, description and the H1
  const result = {
    title: getTitle($),
    description: getDescription($),
    h1: getH1($, options.useFirstH1)
  };

  // Clean the HTML before finding the main content
  cleanHTML($, options);

  // Find the main div containing the main content
  let content = null;

  if (options.htmlSelector) {
    content = $(options.htmlSelector);
  } else {
    content = $(findContentSection($, content));
  }

  content = content ? content : $('body');

  // Extract images, links, headers
  result.images = findImages($, content, options);
  result.links = findLinks($, content, options);
  result.headers = findHeaders($, content, options);

  // Clean the final content in function of the options
  cleanContent($, content, options);

  if (content.html() === null) {
    throw new Error('Impossible to find the main content, try with an HTML selector');
  }

  result.content = type === MD ? convertToMD(content.html()) : type === TXT ? getCleanText($, content) : content.html();

  return result;
}

/**
 * convertToMD - Convert the HTML into markdown
 *
 * @param  {type} html the html to convert
 * @returns {type}     the markdown version
 */
function convertToMD(html) {
  const turndownService = new TurndownService();

  turndownService.use(turndownPluginGfm.gfm);

  return turndownService.turndown(html);
}

/**
 * getCleanText - Get the text version of the page.
 * it returns only the text found in the <p> tags of the main content div
 * in order to avoid invalid text concatenation
 * @param  {type} $              The Cheerio reference
 * @param  {type} contentSection The main content div
 * @returns {type}                the text version of the main content div
 */
function getCleanText($, contentSection) {
  const paragraphs = [];

  contentSection.find('p').each((i, p) => {
    paragraphs.push($(p).text());
  });

  return paragraphs.join('').trim();
}

/**
 * getTitle - get the meta title of the page
 *
 * @param  {object} $  Cheerio ref
 * @returns {string}   the text of the title
 */
function getTitle($) {
  return $('title') ? removeLineBreakTabs($('title').text()) : null;
}

/**
 * getDescription - get the meta description of the page
 *
 * @param  {object} $ Cheerio ref
 * @returns {string}  the text of the meta description
 */
function getDescription($) {
  return $('meta[name=description]') ? removeLineBreakTabs($('meta[name=description]').attr('content')) : null;
}

/**
 * getH1 - get the H1 of the page
 *
 * @param  {object} $          The Cheerio ref
 * @param  {boolean} useFirstH1 if multiple H1, return the first one
 * @returns {strin}           The text of the H1
 */
function getH1($, useFirstH1) {
  const nbrH1 = $('body').find('h1').length;

  return nbrH1 === 0 ? '' : nbrH1 === 1 || useFirstH1 ? getFirstH1($) : '';
}

function getFirstH1($) {
  const h1s = [];

  $('body')
    .find('h1')
    .each((i, h1) => {
      const text = removeLineBreakTabs($(h1).text());

      if (text && text !== '') {
        h1s.push(text);
      }
    });

  return h1s.shift();
}

/**
 * cleanHTML - Clean the page before finding the main content
 *
 * @param  {object} $       Cheerio ref
 * @param  {object}options  the options used to scrape the page
 */
function cleanHTML($, options) {
  if (options.removeTags) {
    removeTags($, options.removeTags);
  }

  $('body')
    .find(BAD_TAGS + (options.removeForm ? ',form' : ''))
    .remove();
  $('body')
    .find(N0T_A_GOOD_CLASS)
    .remove();
  $('body')
    .find(N0T_A_GOOD_ID)
    .remove();

  // Remove all comments
  $('*')
    .contents()
    .filter((i, e) => e.type === 'comment')
    .remove();

  if (options.removeHeadersWithoutText) {
    removeHeadersWithoutText($);
  }
}

function removeTags($, tagsToRemoves) {
  const tags = tagsToRemoves.split(/[\n,]+/);

  tags.forEach(tag => {
    $('body')
      .find(tag)
      .remove();
  });
}

/**
 * cleantContent - Clean the main the content (empty div,p, remove small text, ...)
 *  and fix table without header
 *
 * @param  {object} $              Cheerio reference
 * @param  {object} contentSection the element/tag from which we will find div without content
 * @param  {object} options  the options used to scrape the page
 */
function cleanContent($, contentSection, options) {
  if (options.removeH1FromContent) {
    removeH1FromContent($, contentSection);
  }

  if (options.removeImages && options.removeFigcaptions) {
    contentSection.find('figcaption').each((i, d) => {
      $(d).remove();
    });
  }

  if (options.removeEmptyTag) {
    contentSection.find('div').each((i, d) => {
      if ($(d).children(BASIC_CONTENT).length === 0) {
        $(d).remove();
      }
    });
  }

  // Remove div that are empty
  contentSection.find('div').each((i, d) => {
    if ($(d).children().length === 0) {
      $(d).remove();
    }
  });

  // Remove span that are not in a paragraph
  contentSection.find('span').each((i, s) => {
    const parents = $(s).parents('p');

    if (parents && parents.length === 0) {
      $(s).remove();
    }
  });

  // Fix Tables without headers due to a bug in turndown
  // it cannot convert html table wihtout header into markdown
  contentSection.find('table').each((i, t) => {
    if ($(t).find('thead').length === 0) {
      addTableHeader($, t);
    }
  });
}

/**
 * addTableHeader - Add a header in a table
 * because turndown cannot convert a table without a header
 *
 * @param  {type} $ Cheerio reference
 * @param  {type} t The HTML Table
 */
function addTableHeader($, t) {
  // We simplify the process by removing caption inside the table
  // this is not possible to support all possibilities in the html tables structure
  $(t)
    .find('caption')
    .remove();

  const firstElement = $(t)
    .children()
    .first();

  // Case 1 :  a table with a tbody but without thead
  // Extract the first row from the tbody and create a header with it
  if (firstElement['0'].name === 'tbody') {
    const firstRow = $(firstElement)
      .children()
      .first();

    $(t).prepend(`<thead>${firstRow.html()}</thead>`);
    $(firstRow).remove();

    // Case 2 : a table without tbody & without thead
    // Create a header with the first row and create a tbody with the other rows
  } else {
    const headerHtml = firstElement.html();

    $(firstElement).remove();
    const rows = $(t)
      .children()
      .html();

    $(t)
      .children()
      .remove();
    $(t).append(`<thead>${headerHtml}</thead><tbody>${rows}</tbody>`);
  }
}

/**
 * removeH1FromContent - Remove the H1 in the content
 *
 * @param  {type} $              Cheerio Reference
 * @param  {type} contentSection the element from which we will find the H1
 */
function removeH1FromContent($, contentSection) {
  const h1 = contentSection.find('h1');

  // Don't remove h1 if there more than one h1
  if (h1.length === 1) {
    $(h1).remove();
  }
}

/**
 * findHeaders - Find the hn (H1, H2, .... )
 *
 * @param  {object} $              The cheerion reference
 * @param  {object} contentSection The element/tag from which we will find the header
 * @param  {object} options        The options
 * @returns {Array<object>}        The list of the headers found in the content
 */
function findHeaders($, contentSection) {
  const headers = [];

  contentSection.find(HEADERS).each((i, header) => {
    const text = removeLineBreakTabs($(header).text());

    if (text && text.trim() !== '') {
      headers.push({ type: header.name, text });
    }
  });

  return headers;
}

/**
 * findLinks - Find the links & replace them if necessary
 *
 * @param  {object} $              The cheerion reference
 * @param  {object} contentSection The element/tag from which we will find the links
 * @param  {object} options        The options
 * @returns {Array<object>}        The list of the links found in the content
 */
function findLinks($, contentSection, options) {
  const links = [];

  contentSection.find('a').each((i, a) => {
    links.push({ href: removeLineBreakTabs($(a).attr('href')), text: removeLineBreakTabs($(a).text()) });

    if (options.replaceLinks) {
      $(a).replaceWith(`${removeLineBreakTabs($(a).text())}`);
    }
  });

  return links;
}

/**
 * findImages - Find the images & remove them if necessary
 *
 * @param  {object} $              The cheerio reference
 * @param  {object} contentSection The element/tag from which we will find the images
 * @param  {object} options        The options
 * @returns {Array<object>}        The list of the images found in the content
 */
function findImages($, contentSection, options) {
  const images = [];

  contentSection.find('img').each((i, img) => {
    images.push({ src: $(img).attr('src'), alt: $(img).attr('alt') });
  });

  if (options.removeImages) {
    $('body')
      .find('img')
      .remove();
  }

  return images;
}

/**
 * removeHeadersWithoutText - Clean out spurious headers are not containing important text
 *
 * @param  {object} $ Cheerion ref
 */
function removeHeadersWithoutText($) {
  $('body')
    .find(HEADERS)
    .each((i, header) => {
      if (getClassWeight($, header) < 0 || getLinkDensity($, header) > MIN_LINK_DENSITY) {
        $(header).remove();
      }
    });
}

/**
 * findContentSection - Try to find the div that contains the article content
 * Find the main content div - Using a variety of metrics (content score, classname, element types),
 * Find the content that is most likely to be the stuff a user wants to read.
 *
 * @param  {object} $ The Cheerio ref
 * @returns {object}  the Cheerio element matching to the main content, probably a div
 */
function findContentSection($) {
  // Try to find the main HTML tag (article, section, ... )
  const article = findArticle($);

  if (article) {
    return article;
  }

  // Bad luck, try to find the top candidate div
  const candidates = findGoodCandidates($);
  const topCandidate = getTopCandidate($, candidates);

  return topCandidate;
}

/**
 * findArticle - Find the tag that contains the article content
 *
 * @param  {object} $ The Cheerio reference
 * @returns {object}  The Cheerio tag that match to the tag
 */
function findArticle($) {
  let selectedSection = { s: null, nbrParas: 0 };
  const sectionTags = $('body').find(DIV_ARTICLE);

  // Select the tag that have the more important number of paragraph
  if (sectionTags.length > 0) {
    sectionTags.each((i, s) => {
      const nbrParas = $(s).find('p').length;

      if (selectedSection.nbrParas < nbrParas) {
        selectedSection = { s, nbrParas };
      }
    });
  }

  return selectedSection.s;
}

/**
 * findGoodCandidates - Find the best candidates for selecting the main content
 * This is mainly based on a score for each paragrap
 *
 * @param  {object} $ The Cheerio ref
 * @returns {Array<object>}   The List of candidates
 */
function findGoodCandidates($) {
  const candidates = [];

  $('body')
    .find('p')
    .each((i, p) => {
      if ($(p).text().length === 0) {
        $(p).remove();
      }

      // Ignore p with less than a min of chars
      if ($(p).text() < MIN_CHARS) {
        return;
      }

      // Initialize readability data for the paragraph
      if (!p.readability) {
        initializeElement($, p);
        candidates.push(p);
      }

      // Initialize readability data for the parent element
      // The first element in a the array is the parent
      const parent = $(p).parent()['0'];

      if (!parent.readability) {
        initializeElement($, parent);
        candidates.push(parent);
      }

      let contentScore = 1;

      // Add points for any commas within this paragraph
      const text = $(p).text();

      contentScore += text.split(',').length;

      // For every 100 characters in this paragraph, add an extra scrore of 3 points
      contentScore += Math.min(Math.floor(text.length / NBR_CHARS), EXTRA_SCORE);

      /* Add the score to the p. The parent gets half. */
      p.readability.contentScore += contentScore;
      parent.readability.contentScore += contentScore / HALF;
    });

  return candidates;
}

/**
 * getTopCandidate - Return the top candiate matching to the main content of the page
 *
 * @param  {object} $          The Cheerio reference
 * @param  {Array} candidates The list of candidate elements
 * @returns {object}            The top candidate
 */
function getTopCandidate($, candidates) {
  let topCandidate = null;

  for (const c of candidates) {
    // Scale the final candidates score based on link density. Good content should have a
    // relatively small link density (5% or less) and be mostly unaffected by this operation.
    c.readability.contentScore = c.readability.contentScore * (1 - getLinkDensity($, c));

    if (!topCandidate || c.readability.contentScore > topCandidate.readability.contentScore) {
      topCandidate = c;
    }
  }

  return topCandidate;
}

/**
 * initializeElement - Initialize the score of an element
 *
 * @param  {object} $ The Cheerio ref
 * @param  {object} e The element
 */
function initializeElement($, e) {
  e.readability = { contentScore: getContentScore(e.name) };
  e.readability.contentScore += getClassWeight($, e);
}

/**
 * getContentScore - Calculate the score of an element
 *
 * @param  {string} elementName The name (tag) of an element
 * @returns {number}             The score
 */
function getContentScore(elementName) {
  return elementName.toUpperCase() === 'DIV'
    ? VERY_GOOD_SCORE
    : ['PRE', 'TD', 'BLOCKQUOTE'].includes(elementName)
    ? GOOD_SCORE
    : ['ADDRESS', 'OL', 'UL', 'DL', 'DD', 'DT', 'LI', 'FORM'].includes(elementName)
    ? BAD_SCORE
    : ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TH'].includes(elementName)
    ? VERY_BAD_SCORE
    : 0;
}

/**
 * getClassWeight - Calculate the weigth of a class of an element
 *
 * @param  {object} $       The Cheerio reference
 * @param  {object} element The element to chech
 * @returns {number}         The weight
 */
function getClassWeight($, element) {
  let weight = 0;

  /* Look for a special classname */
  const c = $(element).attr('class');

  if (c && c !== '') {
    if (c.search(REGEX.negativeRe) !== -1) {
      weight -= CLASS_WEIGHT;
    }

    if (c.search(REGEX.positiveRe) !== -1) {
      weight += CLASS_WEIGHT;
    }
  }

  /* Look for a special ID */
  const id = $(element).attr('id');

  if (id && typeof id === 'string' && id !== '') {
    if (id.search(REGEX.negativeRe) !== -1) {
      weight -= CLASS_WEIGHT;
    }

    if (id.search(REGEX.positiveRe) !== -1) {
      weight += CLASS_WEIGHT;
    }
  }

  return weight;
}

/**
 * getLinkDensity - Return the link density versus text for an element
 *
 * @param  {object} $       The Cheerio ref
 * @param  {object} element The element to check
 * @returns {number}         The link density value
 */
function getLinkDensity($, element) {
  const textLength = removeExtraChars($(element).text()).length;
  let linkLength = 0;

  $(element)
    .find('a')
    .each((i, a) => {
      linkLength += $(a).text().length;
    });

  return linkLength / textLength;
}

function removeExtraChars(s) {
  return s.replace(/\s+/g, ' ').trim();
}

exports.findContent = findContent;
