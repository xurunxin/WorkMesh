import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync('dist/code.js', 'utf8');
let idSeq = 0;
const vars = [], cols = [], textStyles = [], effectStyles = [], paintStyles = [], pages = [];

function node(type) {
  const n = { id: `n${++idSeq}`, type, name: type, children: [], _fills: [], _strokes: [], parent: null,
    x:0,y:0,width:100,height:100,minWidth:0,minHeight:0,
    layoutMode:'NONE',primaryAxisSizingMode:'AUTO',counterAxisSizingMode:'AUTO',
    primaryAxisAlignItems:'MIN',counterAxisAlignItems:'MIN',itemSpacing:0,counterAxisSpacing:0,
    layoutWrap:'NO_WRAP',paddingLeft:0,paddingRight:0,paddingTop:0,paddingBottom:0,
    layoutGrow:0,layoutAlign:'INHERIT',opacity:1,visible:true,clipsContent:false,effects:[],
    characters:'',fontSize:14,fontName:{family:'Inter',style:'Regular'},lineHeight:{},letterSpacing:{},
    textCase:'ORIGINAL',textAutoResize:'NONE',textAlignHorizontal:'LEFT',textAlignVertical:'TOP',
    vectorPaths:[],strokeWeight:1,strokeAlign:'CENTER',strokeCap:'NONE',strokeJoin:'MITER',
    _modeBindings: [],
    resize(w,h){this.width=w;this.height=h},
    appendChild(c){c.parent=this;this.children.push(c);return c},
    insertChild(i,c){c.parent=this;this.children.splice(i,0,c);return c},
    remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1)}this.parent=null},
    setBoundVariable(){}, findAll(){return[]}, loadAsync(){return Promise.resolve()},
    setExplicitVariableModeForCollection(colId, modeId){ this._modeBindings.push([colId, modeId]); },
    get fills(){return this._fills}, set fills(v){this._fills=v},
    get strokes(){return this._strokes}, set strokes(v){this._strokes=v},
    get cornerRadius(){return this._r||0}, set cornerRadius(v){this._r=v},
    get topLeftRadius(){return this._r||0}, set topLeftRadius(v){this._r=v},
    get topRightRadius(){return this._r||0}, set topRightRadius(v){this._r=v},
    get bottomLeftRadius(){return this._r||0}, set bottomLeftRadius(v){this._r=v},
    get bottomRightRadius(){return this._r||0}, set bottomRightRadius(v){this._r=v},
  };
  return n;
}
function page(name){const p=node('PAGE');p.name=name;p.backgrounds=[];pages.push(p);return p}
const root = node('DOCUMENT'); root.children = pages; page('Page 1');

function col(name){let s=0;const c={id:`c${cols.length+1}`,name,modes:[{modeId:`m${++s}`,name:'Mode 1'}],variableIds:[],
  renameMode(id,n){const m=this.modes.find(x=>x.modeId===id);if(m)m.name=n},
  addMode(n){const id=`m${++s}`;this.modes.push({modeId:id,name:n});return id},
  remove(){const i=cols.indexOf(this);if(i>=0)cols.splice(i,1)}}; cols.push(c); return c;}
function vari(name,c,type){const v={id:`v${vars.length+1}`,name,resolvedType:type,collectionId:c.id,values:{},
  setValueForMode(id,val){ if(type==='COLOR'){ const ok=val&&(val.type==='VARIABLE_ALIAS'||(typeof val.r==='number'&&typeof val.g==='number'&&typeof val.b==='number'&&val.r>=0&&val.r<=1&&val.g>=0&&val.g<=1&&val.b>=0&&val.b<=1)); if(!ok) throw new Error('bad COLOR '+name); }
    if(type==='FLOAT'&&typeof val!=='number') throw new Error('bad FLOAT '+name); this.values[id]=val; },
  remove(){const i=vars.indexOf(this);if(i>=0)vars.splice(i,1)}}; vars.push(v); c.variableIds.push(v.id); return v;}

const figma = { root, currentPage: pages[0], showUI(){}, notify(){}, ui:{postMessage(){}},
  createPage(){return page('Untitled')}, createFrame(){return node('FRAME')}, createComponent(){return node('COMPONENT')},
  createRectangle(){return node('RECTANGLE')}, createEllipse(){return node('ELLIPSE')}, createLine(){return node('LINE')},
  createVector(){return node('VECTOR')}, createText(){const t=node('TEXT');t.fontName=null;return t},
  combineAsVariants(ns){const s=node('COMPONENT_SET');for(const n of ns){n.parent=s;s.children.push(n)}return s},
  loadFontAsync(f){const k=f.family+'|'+f.style; const known=['Inter|Regular','Inter|Medium','Inter|Semi Bold','Inter|Bold','Roboto|Regular','Roboto Mono|Regular'];
    return known.includes(k)?Promise.resolve():Promise.reject(new Error('no '+k))},
  listAvailableFontsAsync(){return Promise.resolve([{fontName:{family:'Inter',style:'Regular'}}])},
  variables:{ getLocalVariableCollections:()=>cols, getVariableById:id=>vars.find(v=>v.id===id)||null,
    createVariableCollection:col, createVariable:vari,
    setBoundVariableForPaint:(p,f,v)=>({...p,boundVariables:{[f]:{type:'VARIABLE_ALIAS',id:v.id}}})},
  createTextStyle(){const s={name:'',fontName:null,fontSize:0,lineHeight:{},letterSpacing:{},textCase:'ORIGINAL',remove(){}};textStyles.push(s);return s},
  createEffectStyle(){const s={name:'',effects:[],remove(){}};effectStyles.push(s);return s},
  createPaintStyle(){const s={name:'',paints:[],remove(){}};paintStyles.push(s);return s},
  getLocalTextStyles:()=>textStyles, getLocalEffectStyles:()=>effectStyles, getLocalPaintStyles:()=>paintStyles,
};

const sandbox = { figma, console:{log(){},error(){},warn(){}}, setTimeout, Promise, Math, Date, JSON, Object, Array, String, Number, Boolean, Error, Map, Set };
vm.runInContext(code, vm.createContext(sandbox), { filename: 'code.js' });
await new Promise(r=>setTimeout(r,400));

let fail = 0;
const check = (ok, label, detail='') => { console.log((ok?'PASS  ':'FAIL  ')+label+(detail?'  → '+detail:'')); if(!ok) fail++; };

// --- pages ---
const named = pages.map(p=>p.name);
check(named.includes('🎨 Tokens'), 'Tokens page created');
check(named.includes('🧩 Library'), 'Library page created');
check(named.includes('🖥 Screens'), 'Screens page created');
check(named.includes('🔍 Compare'), 'Compare page created');

// --- variables: every token must have BOTH modes set ---
const tokenCol = cols.find(c=>c.name==='WorkMesh Tokens');
const [modeA, modeB] = tokenCol.modes.map(m=>m.modeId);
let singleMode = 0, emptyVar = 0;
for (const v of vars.filter(v=>v.collectionId===tokenCol.id)) {
  const a = v.values[modeA], b = v.values[modeB];
  if (a===undefined || b===undefined) singleMode++;
  if (a===undefined && b===undefined) emptyVar++;
}
check(singleMode===0, 'every token has both Light and Dark values', `${singleMode} incomplete`);

// --- density collection ---
const denCol = cols.find(c=>c.name==='WorkMesh Density');
check(!!denCol && denCol.modes.length===2, 'Density collection has 2 modes',
  denCol ? denCol.modes.map(m=>m.name).join('/') : 'missing');

// --- components ---
const libPage = pages.find(p=>p.name==='🧩 Library');
let compSets = 0, comps = 0;
(function walk(n){ if(n.type==='COMPONENT_SET')compSets++; if(n.type==='COMPONENT')comps++;
  for(const c of n.children||[])walk(c); })(libPage);
check(compSets>=7, 'component variant sets built', `${compSets} sets, ${comps} components`);

// --- screens: 11 entries x 2 modes = 22 ---
const scrPage = pages.find(p=>p.name==='🖥 Screens');
const screens = scrPage.children.filter(c=>c.name && c.name.startsWith('screen/'));
check(screens.length===22, 'all screens rendered in both modes', `${screens.length}/22`);

// --- mode binding actually applied ---
const bound = screens.filter(s=>s._modeBindings.length>0);
check(bound.length===screens.length, 'every screen carries an explicit mode binding',
  `${bound.length}/${screens.length}`);

// distinct modes present
const modesUsed = new Set(screens.flatMap(s=>s._modeBindings.map(b=>b[1])));
check(modesUsed.size===2, 'both modes are actually used across screens', `${modesUsed.size} distinct`);

// --- compare page ---
const cmpPage = pages.find(p=>p.name==='🔍 Compare');
check(cmpPage.children.length===2, 'Compare has Light and Dark columns', `${cmpPage.children.length}`);

console.log(fail ? `\n${fail} FAILURES` : '\nall structural checks passed');
process.exit(fail?1:0);
