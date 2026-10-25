// dashboard/public/js/embedPreview.js
// Rendu Markdown "façon Discord" pour l'aperçu du créateur d'embeds.
// Tout est échappé d'abord (aucun HTML saisi par l'utilisateur n'est interprété).
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Autorise uniquement http(s) pour les liens
  function safeUrl(u) {
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
  }

  // opts.inline = true : pas de titres/citations/listes (valeurs de champs, footer...)
  function renderMarkdown(src, opts) {
    opts = opts || {};
    let s = esc(src);
    const stash = [];
    const keep = (html) => { stash.push(html); return '\u0000' + (stash.length - 1) + '\u0000'; };

    // 1) blocs de code et code en ligne (protégés du reste du formatage)
    s = s.replace(/```(?:[a-z]*\n)?([\s\S]*?)```/gi, (_, c) => keep('<pre class="md-pre">' + c.replace(/\n$/, '') + '</pre>'));
    s = s.replace(/`([^`\n]+)`/g, (_, c) => keep('<code class="md-code">' + c + '</code>'));

    // 2) mentions / emojis personnalisés (déjà échappés : &lt; ... &gt;)
    s = s.replace(/&lt;a?:([A-Za-z0-9_]+):(\d{5,25})&gt;/g, (_, n, id) =>
      keep('<img class="md-emoji" alt=":' + n + ':" src="https://cdn.discordapp.com/emojis/' + id + '.png?size=48">'));
    s = s.replace(/&lt;@&amp;(\d{5,25})&gt;/g, () => keep('<span class="md-mention">@rôle</span>'));
    s = s.replace(/&lt;@!?(\d{5,25})&gt;/g, () => keep('<span class="md-mention">@membre</span>'));
    s = s.replace(/&lt;#(\d{5,25})&gt;/g, () => keep('<span class="md-mention">#salon</span>'));
    s = s.replace(/@(everyone|here)\b/g, (_, w) => keep('<span class="md-mention">@' + w + '</span>'));

    // 3) liens [texte](url)
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => {
      const url = safeUrl(u.replace(/&amp;/g, '&'));
      return url ? keep('<a class="md-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + t + '</a>') : m;
    });

    // 4) mise en forme
    s = s.replace(/\|\|([^\n]+?)\|\|/g, '<span class="md-spoiler">$1</span>');
    s = s.replace(/\*\*\*([^\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^\n]+?)__/g, '<u>$1</u>');
    s = s.replace(/~~([^\n]+?)~~/g, '<s>$1</s>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?![_\w])/g, '$1<em>$2</em>');

    // 5) structure ligne par ligne
    if (!opts.inline) {
      s = s.split('\n').map((line) => {
        let m;
        if ((m = line.match(/^(#{1,3}) (.+)$/))) return '<div class="md-h md-h' + m[1].length + '">' + m[2] + '</div>';
        if ((m = line.match(/^-# (.+)$/)))       return '<div class="md-small">' + m[1] + '</div>';
        if ((m = line.match(/^&gt; (.*)$/)))     return '<div class="md-quote">' + m[1] + '</div>';
        if ((m = line.match(/^[-*] (.+)$/)))     return '<div class="md-li">• ' + m[1] + '</div>';
        return line;
      }).join('\n');
    }

    // 6) on remet le code / mentions / liens
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
    return s;
  }

  const api = { renderMarkdown, esc, safeUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmbedPreview = api;
})(typeof window !== 'undefined' ? window : globalThis);
