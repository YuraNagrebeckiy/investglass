const fix = () => {
  document.querySelectorAll('#shLights .mini-t th:first-child').forEach((th) => { if (th.textContent !== 'ТФ') th.textContent = 'ТФ'; });
  document.querySelectorAll('.tour-card p').forEach((p) => {
    const t = p.textContent;
    if (t.includes('Журнал, Риск и Данные')) p.textContent = t.replace('Журнал, Риск и Данные', 'Журнал. Данные и источники находятся в настройках');
    if (t.includes('планом сделки и риском') && !t.includes('выбором брокера')) p.textContent = t.replace('планом сделки и риском', 'планом сделки, риском и выбором брокера');
  });
};
new MutationObserver(fix).observe(document.body, { childList: true, subtree: true });
fix();
