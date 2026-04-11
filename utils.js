// UI and formatting utilities

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span style="font-weight: 500">${message}</span>
  `;

  container.appendChild(toast);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.classList.add('closing');
    setTimeout(() => {
      if(container.contains(toast)) container.removeChild(toast);
    }, 300);
  }, 3000);
}

export function setLoading(buttonElement, isLoading, originalText = '') {
  if (isLoading) {
    if(!buttonElement.dataset.original) {
      buttonElement.dataset.original = buttonElement.innerHTML;
    }
    buttonElement.disabled = true;
    buttonElement.innerHTML = `<span class="spinner"></span> Processing...`;
  } else {
    buttonElement.disabled = false;
    buttonElement.innerHTML = buttonElement.dataset.original || originalText;
  }
}

export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function htmlToElement(html) {
  const template = document.createElement('template');
  html = html.trim(); 
  template.innerHTML = html;
  return template.content.firstChild;
}

export function generateEmptyState(title, message, ctaText = null, ctaRoute = null) {
  let ctaHtml = '';
  if (ctaText && ctaRoute) {
    ctaHtml = `<button class="btn btn-primary" style="margin-top: 24px; transform: scale(1);" onclick="document.querySelector('[data-route=\\'${ctaRoute}\\']')?.click()">${ctaText}</button>`;
  }
  return `
    <div class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 24px;">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="9" x2="15" y2="15"></line>
        <line x1="15" y1="9" x2="9" y2="15"></line>
      </svg>
      <h3 style="color: var(--text-primary); font-size: 20px;">${title}</h3>
      <p style="color: var(--text-secondary); max-width: 300px; margin: 8px auto 0;">${message}</p>
      ${ctaHtml}
    </div>
  `;
}
