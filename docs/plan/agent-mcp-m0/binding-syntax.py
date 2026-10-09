"""只读源码语法扫描；仅提取注册参数，不推断凭据或领域权限。"""
import re
TOKEN=re.compile(r"""(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|(?P<string>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60)|(?P<id>[A-Za-z_$][\w$]*)|(?P<op>\.\.\.|=>|\?\?|[^\s])""")
def lex(text):
 return [m.group() for m in TOKEN.finditer(text) if m.lastgroup!="comment"]
def segments(tokens):
 out=[];start=0;stack=[]
 for i,t in enumerate(tokens):
  if t in ("(","{","["):stack.append(t)
  elif t in (")","}","]"):stack.pop()
  elif t=="," and not stack:out.append(tokens[start:i]);start=i+1
 out.append(tokens[start:])
 return [v for v in out if v]
def end(tokens,i):
 pairs={"(":")","{":"}","[":"]"};stack=[pairs[tokens[i]]]
 for j in range(i+1,len(tokens)):
  if tokens[j] in pairs:stack.append(pairs[tokens[j]])
  elif tokens[j] in pairs.values():
   assert stack[-1]==tokens[j];stack.pop()
   if not stack:return j
 raise AssertionError("源码括号不完整")
def fields(tokens,variables):
 if not tokens:return {}
 if tokens[0]!="{" and len(tokens)==1:return fields(variables[tokens[0]],variables) if tokens[0] in variables else {}
 if tokens[0]!="{":return {}
 result={}
 for part in segments(tokens[1:end(tokens,0)]):
  if part[0]=="...":
   assert part[1] in variables,("未解析inputSchema spread",part)
   result.update(fields(variables[part[1]],variables))
  elif len(part)>2 and part[1]==":":result[part[0].strip("'\"")]=part[2:]
  else:result[part[0]]=variables.get(part[0],part)
 return result
def scan(text, external=""):
 tokens=lex(text);variables={}
 external_tokens=lex(external)
 for k in range(len(external_tokens)-8):
  if external_tokens[k]=="const" and external_tokens[k+2:k+7]==["=","z",".","object","("] and external_tokens[k+7]=="{":
   variables[external_tokens[k+1]+".shape"]=external_tokens[k+7:end(external_tokens,k+7)+1]
 for i in range(len(tokens)-4):
  if tokens[i]=="const" and tokens[i+2]=="=" and tokens[i+3]=="{":variables[tokens[i+1]]=tokens[i+3:end(tokens,i+3)+1]
 result={}
 for i in range(len(tokens)-6):
  if tokens[i:i+3]==["server",".","registerTool"] or tokens[i:i+3]==["server",".","registerResource"]:
   assert tokens[i+3]=="(";j=end(tokens,i+3);args=segments(tokens[i+4:j]);name=args[0][0][1:-1]
   config=fields(args[1] if tokens[i+2]=="registerTool" else args[2],variables)
   schema=config.get("inputSchema",[])
   if len(schema)==3 and schema[1]=="." and schema[2]=="shape":
    assert schema[0]+".shape" in variables,("缺少外部schema",schema)
    schema=variables[schema[0]+".shape"]
   callback=args[-1];calls=[]
   for k in range(len(callback)-3):
    if callback[k] in ("client","options") and callback[k+1]==".":
     offset=4 if callback[k:k+4]==["options",".","client","."] else 2
     following=k+offset+1
     if following<len(callback) and callback[following]=="<":
      while following<len(callback) and callback[following]!=">":following+=1
      following+=1
     if following<len(callback) and callback[following]=="(":calls.append(callback[k+offset])
   kind="tool" if tokens[i+2]=="registerTool" else "resource"
   uri=next((v[1:-1] for v in args[1] if v.startswith(("'workmesh://","\"workmesh://"))),None) if kind=="resource" else None
   result[kind+":"+name]={"inputFields":{k:" ".join(v) for k,v in fields(schema,variables).items()},
    "inputSchemaExpression":" ".join(schema),"uri":uri,"uriParameters":re.findall(r"\{(\w+)\}",uri or ""),"sdkMethods":sorted(set(calls)),
    "registrationExpression":" ".join(tokens[i:i+4]),"callbackTokens":callback}
 return result

def refresh_condition(text):
 """只解析实际request第一条if的布尔式；未知运算/变量直接失败。"""
 tokens=lex(text[text.index("private async request<T>("):])
 start=tokens.index("if")+1
 assert tokens[start]=="("
 raw=tokens[start+1:end(tokens,start)];merged=[];i=0
 while i<len(raw):
  if raw[i:i+2] in (["&","&"],["|","|"]):merged.append("".join(raw[i:i+2]));i+=2
  else:merged.append(raw[i]);i+=1
 return merged

def evaluate_boolean(tokens,facts):
 pos=0
 def primary():
  nonlocal pos
  t=tokens[pos];pos+=1
  if t=="!":return not primary()
  if t=="(":
   value=or_expr();assert tokens[pos]==")";pos+=1;return value
  if t=="Boolean":
   assert tokens[pos]=="(";pos+=1;value=primary();assert tokens[pos]==")";pos+=1;return bool(value)
  assert t in ["options","this"],("未知条件变量",t)
  assert tokens[pos]==".";pos+=1;field=t+"."+tokens[pos];pos+=1
  assert field in facts,("未核条件事实",field)
  return bool(facts[field])
 def and_expr():
  nonlocal pos
  value=primary()
  while pos<len(tokens) and tokens[pos]=="&&":
   pos+=1;other=primary();value=value and other
  return value
 def or_expr():
  nonlocal pos
  value=and_expr()
  while pos<len(tokens) and tokens[pos]=="||":
   pos+=1;other=and_expr();value=value or other
  return value
 value=or_expr();assert pos==len(tokens);return value
if __name__=="__main__":
 import pathlib,json
 root=pathlib.Path(__file__).resolve().parents[3]
 for key,value in scan((root/"apps/mcp/src/index.ts").read_text(encoding="utf8")).items():
  print(key,list(value["inputFields"]),value["uriParameters"],value["sdkMethods"])
