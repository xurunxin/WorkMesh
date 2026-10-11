"""补齐现行有限写具名响应；仅替换准确操作的 schema，保原路径和错误。"""
from pathlib import Path
import json,re

root=Path(__file__).resolve().parents[4]
path=root/'OPENAPI.yaml'
text=path.read_text(encoding='utf-8')
responses={'getProjectHealthHistory':'ProjectHealthResponsePage','createProjectHealthUpdate':'ProjectHealthCreatedResponse','suggestWorkItemCompletion':'CompletionSuggestionResponse'}
for operation,schema in responses.items():
    lines=text.splitlines(keepends=True)
    matches=[i for i,line in enumerate(lines) if 'operationId: '+operation+',' in line]
    if len(matches)!=1: raise RuntimeError(operation)
    i=matches[0]
    lines[i],count=re.subn(r'"200": \{ \$ref: "#/components/responses/(?:PagedJson|Json)" \}',
      '"200": { description: "现行授权的具名响应。", content: { application/json: { schema: { $ref: "#/components/schemas/'+schema+'" } } } }',lines[i])
    if count!=1: raise RuntimeError(operation+' response')
    text=''.join(lines)
start=text.index('        operationId: createSavedView,')
end=text.index('\n  /api/v1/events:',start)
part=text[start:end]
part,count=re.subn(r'"200": \{ \$ref: "#/components/responses/Command" \}',
 '"200": { description: "本人 saved view 创建回执。", content: { application/json: { schema: { $ref: "#/components/schemas/SavedViewCreatedResponse" } } } }',part)
if count!=1: raise RuntimeError('saved view response')
text=text[:start]+part+text[end:]
identifier={'type':'string','format':'uuid'}
revision={'type':'integer','minimum':1}
def obj(properties): return dict(type='object',additionalProperties=True,properties=properties,required=list(properties))
schemas={
 'SavedViewCreatedResponse':obj({'id':identifier,'revision':revision}),
 'ProjectHealthCreatedResponse':obj({'id':identifier,'revision':revision,'projectRevision':revision}),
 'CompletionSuggestionResponse':obj({'id':identifier,'revision':revision}),
 'ProjectHealthResponse':obj({'id':identifier,'project_id':identifier,'revision':revision,'health':{'type':'string','enum':['on_track','at_risk','off_track','unknown']},'status':{'type':'string','enum':['draft','published']}}),
 'ProjectHealthResponsePage':obj({'items':{'type':'array','items':{'$ref':'#/components/schemas/ProjectHealthResponse'}},'nextCursor':{'type':['string','null']}}),
}
for name,value in schemas.items():
    if '\n    '+name+':' in text: raise RuntimeError('重复 schema '+name)
    text+='    '+name+':\n      '+json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n'
path.write_text(text,encoding='utf-8',newline='\n')
