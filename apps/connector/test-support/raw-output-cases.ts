// 只生成测试子进程程序；实际凭据从环境注入，不进入参数或日志。
export function rawOutputCases(stream: 'stdout' | 'stderr'): string {
  return `function emitRawCases(done) {
    const source=process.env.WORKMESH_INSTALLATION_TOKEN;
    const cases=[];
    for(const pre of ['\\x1b','\\x1b[','\\x9b','\\x1b]0;\\x1b','\\x1b]0;\\x1b[','\\x1b]0;\\x9b'])
      for(const kind of ['wmi_','wmp_']){const secret=kind+source.slice(4);cases.push([pre,secret],[pre,secret.slice(0,20)+'\\x1b[31m'+secret.slice(20)]);}
    let index=0;
    function next(){if(index===cases.length){process.${stream}.write('\\x1b[0m RAW_END\\n');done();return;}
      const [pre,secret]=cases[index++];process.${stream}.write(pre);
      setTimeout(()=>{process.${stream}.write(secret.slice(0,20));setTimeout(()=>{process.${stream}.write(secret.slice(20)+'\\x07\\x1b[0m\\n');next()},2)},2);}
    next();
  }`
}
