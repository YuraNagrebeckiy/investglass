const fix = () => document.querySelectorAll('#shLights .mini-t th:first-child').forEach((th) => { if (th.textContent !== 'ТФ') th.textContent = 'ТФ'; });
new MutationObserver(fix).observe(document.body, { childList: true, subtree: true });
fix();
