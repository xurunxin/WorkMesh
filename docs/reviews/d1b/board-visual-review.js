const combinations = document.getElementById('combination');
const labels = { ready: '就绪', loading: '加载', error: '失败／恢复', empty: '空态', compact: '紧凑密度', portal: '共享CommandCenter', detail: '未迁详情sheet' };
const local = path => path.replace(/^docs\/reviews\/d1b\//, '');
fetch('evidence/board/comparisons.json').then(response => {
  if (!response.ok) throw new Error('对比清单读取失败');
  return response.json();
}).then(({ rows }) => {
  rows.forEach((row, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${row.variant} · ${row.rowID} · ${labels[row.state]}`;
    combinations.append(option);
  });
  const render = () => {
    const row = rows[Number(combinations.value)];
    for (const key of ['before', 'after']) {
      const path = local(row.comparison[key === 'before' ? 'expected' : 'actual'].path);
      document.getElementById(key).src = path;
      document.getElementById(`${key}-link`).href = path;
      document.getElementById(`${key}-json`).href = local(row.runtime[key]);
    }
    const diff = document.getElementById('diff');
    diff.hidden = !row.comparison.diff;
    if (row.comparison.diff) diff.src = local(row.comparison.diff.path);
    document.getElementById('comparison').textContent = row.comparison.message;
    document.getElementById('historical').textContent = row.historicalD0 ? '本组另保留冻结D0的迁前／迁后历史差异，详情见comparison.json。' : '本组没有对应的冻结D0原图，使用本轮同条件迁前截图。';
    document.getElementById('summary').textContent = `共 ${rows.length} 组；固定比较器${row.comparison.comparatorPassed ? '通过' : '有差异'}。人工视觉待评审。请求 ${row.requestedURL}；导航结束 ${row.actualURL}`;
  };
  combinations.addEventListener('change', render);
  render();
}).catch(error => { document.getElementById('summary').textContent = error.message; });
