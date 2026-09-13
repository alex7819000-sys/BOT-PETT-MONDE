// dashboard/public/js/app.js
(function () {
  // Confirmation avant les actions destructrices
  document.querySelectorAll('[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Auto-dismiss des bandeaux "sauvegardé"
  document.querySelectorAll('.toast-saved').forEach((el) => {
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 2500);
  });

  // Auto-refresh léger de la page d'overview (stats quasi temps réel)
  const auto = document.querySelector('[data-autorefresh]');
  if (auto) {
    const ms = Number(auto.getAttribute('data-autorefresh')) || 30000;
    setTimeout(() => window.location.reload(), ms);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Channel Search — remplace tous les <select data-channel-search> par un
// champ de recherche avec autocomplétion. Usage dans les EJS :
//
//   <%- channelSelect('welcomeChannelId', textChannels, cfg.welcomeChannelId) %>
//
// ou manuellement :
//   <select name="monChamp" data-channel-search data-current="<%= cfg.monChamp %>">
//     <% textChannels.forEach(c => { %>
//       <option value="<%= c.id %>" data-name="#<%= c.name %>"><%= c.name %></option>
//     <% }) %>
//   </select>
// ─────────────────────────────────────────────────────────────────────────────
(function initChannelSearch() {
  const CSS = `
.cs-wrap{position:relative;display:inline-block;width:100%}
.cs-input{width:100%;box-sizing:border-box;background:var(--elevated,#2b2d31);border:1px solid var(--border,#3a3d42);border-radius:8px;padding:8px 36px 8px 12px;color:#fff;font-size:13px;cursor:text;outline:none}
.cs-input:focus{border-color:var(--accent,#e2b94b)}
.cs-arrow{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-muted,#949ba4);font-size:11px}
.cs-dropdown{display:none;position:absolute;z-index:1000;top:calc(100% + 4px);left:0;right:0;background:#2b2d31;border:1px solid var(--border,#3a3d42);border-radius:8px;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.55)}
.cs-dropdown.open{display:block}
.cs-option{padding:8px 12px;font-size:13px;color:#dbdee1;cursor:pointer;display:flex;align-items:center;gap:6px;border-radius:4px;margin:2px 4px}
.cs-option:hover,.cs-option.focused{background:#3a3d42}
.cs-option .cs-hash{color:var(--text-muted,#949ba4);font-size:12px;flex-shrink:0}
.cs-option .cs-name em{background:rgba(226,185,75,.25);color:#e2b94b;font-style:normal;border-radius:2px}
.cs-none{padding:10px 12px;color:var(--text-muted,#949ba4);font-size:12px;text-align:center}
.cs-clear{position:absolute;right:28px;top:50%;transform:translateY(-50%);color:var(--text-muted,#949ba4);font-size:14px;cursor:pointer;display:none;background:none;border:none;padding:0;line-height:1}
.cs-clear.visible{display:block}
`;
  if (!document.getElementById('cs-style')) {
    const s = document.createElement('style'); s.id = 'cs-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function hl(text, q) {
    if (!q) return escH(text);
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return escH(text);
    return escH(text.slice(0, i)) + '<em>' + escH(text.slice(i, i + q.length)) + '</em>' + escH(text.slice(i + q.length));
  }
  function escH(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function initSelect(sel) {
    // Récupère les options
    const options = [];
    sel.querySelectorAll('option').forEach(o => {
      if (!o.value) return; // skip "— Aucun —"
      options.push({ id: o.value, name: o.textContent.trim() });
    });

    const currentId   = sel.dataset.current || sel.value || '';
    const currentOpt  = options.find(o => o.id === currentId);
    const fieldName   = sel.name;
    const placeholder = sel.dataset.placeholder || 'Rechercher un salon...';
    const allowNone   = sel.querySelector('option[value=""]') !== null;

    // Construit le HTML
    const wrap = document.createElement('div'); wrap.className = 'cs-wrap';
    wrap.innerHTML = `
      <input type="hidden" name="${escH(fieldName)}" value="${escH(currentId)}">
      <input type="text" class="cs-input" autocomplete="off" placeholder="${escH(placeholder)}"
             value="${currentOpt ? '# ' + escH(currentOpt.name) : ''}">
      <button type="button" class="cs-clear ${currentId ? 'visible' : ''}">✕</button>
      <span class="cs-arrow">▾</span>
      <div class="cs-dropdown"></div>`;
    sel.parentNode.replaceChild(wrap, sel);

    const hidden   = wrap.querySelector('input[type=hidden]');
    const input    = wrap.querySelector('.cs-input');
    const dropdown = wrap.querySelector('.cs-dropdown');
    const clearBtn = wrap.querySelector('.cs-clear');
    let focusIdx = -1;

    function renderList(q) {
      dropdown.innerHTML = '';
      focusIdx = -1;
      const q2 = (q || '').toLowerCase().trim();
      let filtered = options.filter(o => !q2 || o.name.toLowerCase().includes(q2));

      if (allowNone) {
        const noneDiv = document.createElement('div');
        noneDiv.className = 'cs-option';
        noneDiv.innerHTML = '<span class="cs-hash">—</span> <span class="cs-name">Aucun</span>';
        noneDiv.addEventListener('mousedown', e => { e.preventDefault(); pick('', 'Aucun'); });
        dropdown.appendChild(noneDiv);
      }

      if (!filtered.length) {
        dropdown.insertAdjacentHTML('beforeend', '<div class="cs-none">Aucun salon trouvé</div>');
        return;
      }
      filtered.forEach(o => {
        const div = document.createElement('div'); div.className = 'cs-option';
        div.innerHTML = `<span class="cs-hash">#</span><span class="cs-name">${hl(o.name, q2)}</span>`;
        div.addEventListener('mousedown', e => { e.preventDefault(); pick(o.id, o.name); });
        dropdown.appendChild(div);
      });
    }

    function pick(id, name) {
      hidden.value = id;
      input.value  = id ? '# ' + name : '';
      clearBtn.classList.toggle('visible', !!id);
      dropdown.classList.remove('open');
      input.blur();
    }

    function open() {
      renderList(input.value.replace(/^#\s*/, ''));
      dropdown.classList.add('open');
    }

    input.addEventListener('focus', () => { input.select(); open(); });
    input.addEventListener('input', () => {
      hidden.value = ''; // on a tapé → reset sélection
      clearBtn.classList.remove('visible');
      renderList(input.value);
      dropdown.classList.add('open');
    });
    clearBtn.addEventListener('mousedown', e => {
      e.preventDefault(); pick('', '');
    });
    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('.cs-option');
      if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx+1, items.length-1); items.forEach((it,i)=>it.classList.toggle('focused',i===focusIdx)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(focusIdx-1, 0); items.forEach((it,i)=>it.classList.toggle('focused',i===focusIdx)); }
      else if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); items[focusIdx]?.dispatchEvent(new MouseEvent('mousedown')); }
      else if (e.key === 'Escape') { dropdown.classList.remove('open'); input.blur(); }
    });
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) dropdown.classList.remove('open');
    });
  }

  function initAll() {
    document.querySelectorAll('select[data-channel-search]').forEach(initSelect);
  }

  // Init au chargement + observer pour les éléments ajoutés dynamiquement
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();

  const obs = new MutationObserver(() => {
    document.querySelectorAll('select[data-channel-search]:not([data-cs-init])').forEach(s => {
      s.dataset.csInit = '1'; initSelect(s);
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
