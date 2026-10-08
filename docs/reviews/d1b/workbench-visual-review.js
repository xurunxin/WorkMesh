const combinations = document.getElementById('combination');
const labels = { ready: '就绪', create: '新建表单', loading: '加载', error: '错误与重试', empty: '空态', rich: '富文本', portal: 'CommandCenter 浮层' };
const local = path => path.replace(/^docs\/reviews\/d1b\//, '');
fetch('evidence/workbench/comparisons.json').then(response => {
  if (!response.ok) throw new Error('对比清单读取失败');
  return response.json();
}).then(({ rows }) => {
  rows.forEach((row, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${row.variant} · ${row.rowID === 'root-redirect' ? '根路径跳转' : '工作台'} · ${labels[row.state]}`;
    combinations.append(option);
  });
  const render = () => {
    const row = rows[Number(combinations.value)];
    for (const key of ['before', 'after']) {
      const image = document.getElementById(key);
      const path = local(row.comparison[key === 'before' ? 'expected' : 'actual'].path);
      image.src = path;
      document.getElementById(`${key}-link`).href = path;
      document.getElementById(`${key}-json`).href = local(row.runtime[key]);
    }
    const diff = document.getElementById('diff');
    diff.hidden = !row.comparison.diff;
    if (row.comparison.diff) diff.src = local(row.comparison.diff.path);
    document.getElementById('comparison').textContent = row.comparison.message;
    document.getElementById('summary').textContent = `共 ${rows.length} 组；当前原始 PNG ${row.comparison.rawBytesEqual ? '字节相同' : '字节不同'}，固定比较器${row.comparison.comparatorPassed ? '通过' : '有差异'}。人工视觉评审待定。`;
  };
  combinations.addEventListener('change', render);
  render();
}).catch(error => { document.getElementById('summary').textContent = error.message; });
