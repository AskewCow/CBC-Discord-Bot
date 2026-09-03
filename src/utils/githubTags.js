const logger = require('./logger');

const MAX_TAGS = 6;

// Language names that read better lowercased a certain way, or that we prefer
// to normalise. Anything not listed is just lowercased.
const NORMALISE = {
  "c++": "cpp",
  "c#": "csharp",
  "jupyter notebook": "jupyter",
  "objective-c": "objective-c",
};

function clean(tag) {
  const t = String(tag).trim().toLowerCase();
  return NORMALISE[t] ?? t;
}

/**
 * Derive up to six tags for a project from its GitHub repository: the repo's
 * configured topics first, then its most-used languages. Best-effort — any
 * failure (bad URL, private repo, rate limit, network) yields an empty array
 * and the project is simply published without tags.
 *
 * @param {string} githubUrl
 * @returns {Promise<string[]>}
 */
async function deriveTagsFromGitHub(githubUrl) {
  if (!githubUrl) return [];

  const match = String(githubUrl).match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return [];

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CBC-Discord-Bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const api = (path) =>
    fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

  try {
    const [repoRes, langRes] = await Promise.all([api(''), api('/languages')]);

    const tags = [];
    const seen = new Set();
    const push = (raw) => {
      const t = clean(raw);
      if (t && !seen.has(t)) {
        seen.add(t);
        tags.push(t);
      }
    };

    if (repoRes.ok) {
      const data = await repoRes.json();
      for (const topic of (data.topics ?? []).slice(0, 5)) push(topic);
      if (data.language) push(data.language);
    } else {
      logger.warn(`GitHub repo lookup for ${owner}/${repo} → HTTP ${repoRes.status}`);
    }

    if (langRes.ok) {
      const langs = await langRes.json();
      const top = Object.entries(langs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
      for (const l of top) push(l);
    }

    return tags.slice(0, MAX_TAGS);
  } catch (err) {
    logger.warn(`deriveTagsFromGitHub(${githubUrl}) failed: ${err.message}`);
    return [];
  }
}

module.exports = { deriveTagsFromGitHub };
