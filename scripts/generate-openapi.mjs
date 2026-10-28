import ts from 'typescript';
import fs from 'node:fs';

// Keep response contracts in sync with the TypeScript domain model.
const source = ts.createSourceFile('types.ts', fs.readFileSync('src/types.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const ref = name => ({ $ref: `#/components/schemas/${name}` });
function schema(node) {
  if (!node) return {};
  if (ts.isParenthesizedTypeNode(node)) return schema(node.type);
  if (ts.isLiteralTypeNode(node)) {
    if (node.literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null' };
    return { type: ts.isStringLiteral(node.literal) ? 'string' : 'number', const: ts.isStringLiteral(node.literal) ? node.literal.text : Number(node.literal.getText()) };
  }
  if (ts.isIntersectionTypeNode(node)) return { allOf: node.types.map(schema) };
  if (ts.isIndexedAccessTypeNode(node)) return { type: 'string' };
  if (ts.isUnionTypeNode(node)) return { anyOf: node.types.map(schema) };
  if (ts.isArrayTypeNode(node)) return { type: 'array', items: schema(node.elementType) };
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source);
    if (name === 'Record') return { type: 'object', additionalProperties: schema(node.typeArguments[1]) };
    if (name === 'Omit') return { allOf: [schema(node.typeArguments[0])], description: 'PublicQuestion excludes answer and explanation until submission.' };
    return ref(name);
  }
  if (ts.isTypeLiteralNode(node)) return members(node.members);
  return ({ [ts.SyntaxKind.StringKeyword]: {type:'string'}, [ts.SyntaxKind.NumberKeyword]:{type:'number'}, [ts.SyntaxKind.BooleanKeyword]:{type:'boolean'} })[node.kind] ?? {};
}
function members(nodes) {
  const properties={}, required=[];
  for(const m of nodes)if(ts.isPropertySignature(m)){const name=m.name.getText(source).replaceAll("'",'');properties[name]=schema(m.type);if(!m.questionToken)required.push(name);}
  return {type:'object',properties,...(required.length?{required}:{})};
}
const schemas={};
for(const node of source.statements){if(ts.isInterfaceDeclaration(node))schemas[node.name.text]=members(node.members);if(ts.isTypeAliasDeclaration(node))schemas[node.name.text]=schema(node.type);}
schemas.PublicQuestion=structuredClone(schemas.Question);delete schemas.PublicQuestion.properties.answer;delete schemas.PublicQuestion.properties.explanation;schemas.PublicQuestion.required=schemas.PublicQuestion.required.filter(k=>!['answer','explanation'].includes(k));
schemas.Error={type:'object',properties:{error:{type:'object',required:['code','message'],properties:{code:{type:'string'},message:{type:'string'}}}},required:['error']};
const obj = properties => ({type:'object',properties});
const quizResponse = obj({quiz:ref('Quiz'),questions:{type:'array',items:ref('PublicQuestion')}});
const definitions=[
 ['get','/bootstrap','Current local student database',ref('Database')],
 ['get','/catalog','Subject, topic, programme and resource catalog',ref('Catalog')],
 ['get','/profile','Current student profile',ref('Profile')],
 ['patch','/profile','Update selected profile fields',ref('Profile'),{...schemas.Profile,required:[]}],
 ['post','/reset','Restore demo or start a fresh local student',ref('Database'),obj({fresh:{type:'boolean'}})],
 ['post','/events','Record a learning unit and merge its review item',ref('LearningEvent'),obj({topicId:{type:'string'},type:{enum:['lesson','quiz','chat','writing','review']},minutes:{type:'number',minimum:1,maximum:60}})],
 ['get','/daily-review','Today, yesterday and due review queue',ref('DailyReview')],
 ['post','/review-items/{id}/complete','Idempotently complete a review for the demo day',ref('DailyReview')],
 ['patch','/review-items/{id}','Self-rate recall or postpone until tomorrow',ref('ReviewItem'),obj({confidence:{enum:['不懂','模糊','熟悉']},postpone:{type:'boolean'}})],
 ['post','/notes','Create or update a study note',ref('Note'),{...schemas.Note,required:['body']}],
 ['delete','/notes/{id}','Delete a local note',obj({ok:{type:'boolean'}})],
 ['get','/question-options','Question metadata without answer keys',{type:'array',items:obj({id:{type:'string'},topicId:{type:'string'},paper:{type:'string'},kind:{type:'string'},difficulty:{type:'string'}})}],
 ['post','/quizzes','Select authored fixtures using real filters',quizResponse,obj({subjectId:{type:'string'},topicIds:{type:'array',items:{type:'string'}},paper:{type:'string'},questionKind:{type:'string'},difficulty:{type:'string'},count:{type:'integer',minimum:1,maximum:20},kind:{enum:['practice','timed','diagnostic','review']},durationMinutes:{type:'number',minimum:1,maximum:180},reviewIds:{type:'array',items:{type:'string'}}})],
 ['get','/quizzes/{id}','Resume draft or read submitted results',quizResponse],
 ['put','/quizzes/{id}/answers','Save draft answers',ref('Quiz'),obj({answers:{type:'object',additionalProperties:ref('Answer')}})],
 ['post','/quizzes/{id}/submit','Idempotent objective marking and evidence update',ref('Quiz'),obj({answers:{type:'object',additionalProperties:ref('Answer')}})],
 ['get','/wrong/{id}','Read original question and explanation for a mistake',ref('Question')],
 ['patch','/wrong/{id}','Update mistake reason or resolved state',ref('WrongItem'),obj({reason:{type:'string'},resolved:{type:'boolean'}})],
 ['post','/plans/preview','Deterministic mock strategy; no database mutation',ref('PlanPreview')],
 ['post','/plans/apply','Apply next 14 days while preserving locked, completed and distant tasks',ref('PlanPreview')],
 ['post','/tasks','Add a task with conflict and capacity validation',ref('Task'),{...schemas.Task,required:['date','start','minutes','title']}],
 ['patch','/tasks/{id}','Edit, lock, complete or skip a revision task',ref('Task'),{...schemas.Task,required:[]}],
 ['post','/bookmarks/{id}','Toggle a resource bookmark',{type:'array',items:{type:'string'}}],
 ['post','/resource-clicks','Record a browser-local resource click',obj({ok:{type:'boolean'}}),obj({id:{type:'string'}})],
 ['post','/chats','Create a study chat with fixed context',ref('Chat'),obj({topicId:{type:'string'},mode:ref('StudyMode'),title:{type:'string'}})],
 ['patch','/chats/{id}','Rename a chat',ref('Chat'),obj({title:{type:'string'}})],
 ['delete','/chats/{id}','Delete a local chat',obj({ok:{type:'boolean'}})],
 ['post','/chats/{id}/stop','Persist interrupted state for a streaming reply',obj({ok:{type:'boolean'}})],
 ['post','/chats/{id}/save-summary','Add a completed conversation to daily review',obj({ok:{type:'boolean'}})],
 ['post','/chats/{id}/messages','Stream prepared demo reply using SSE; not a live AI call',{type:'string'},obj({content:{type:'string'},attachmentIds:{type:'array',items:{type:'string'}}})],
 ['post','/attachments','Save metadata; Blob bytes are stored separately in browser IndexedDB',ref('Attachment'),ref('Attachment')],
 ['post','/notifications/read','Mark local notifications read',obj({ok:{type:'boolean'}})],
];
const paths={};
for(const [method,path,summary,response,request] of definitions){
  const parameters=path.includes('{id}')?[{name:'id',in:'path',required:true,schema:{type:'string'}}]:[];
  if(path==='/question-options')parameters.push({name:'subjectId',in:'query',required:false,schema:{type:'string'}});
  const stream=path.endsWith('/messages');const status=method==='post'&&['/events','/notes','/quizzes','/tasks','/chats','/attachments'].includes(path)?'201':'200';
  (paths[path]??={})[method]={summary,...(parameters.length?{parameters}:{}),...(request?{requestBody:{required:true,content:{'application/json':{schema:request}}}}:{}),responses:{[status]:{description:stream?'SSE start, delta and done frames; request abort or /stop persists interrupted status.':'Success',content:{[stream?'text/event-stream':'application/json']:{schema:response}}},...Object.fromEntries(['400','404','409','422','503'].map(code=>[code,{description:'Structured API error (only where applicable)',content:{'application/json':{schema:ref('Error')}}}]))}};
}
const document={openapi:'3.1.0',info:{title:'HOKSE DSE frontend mock API',version:'1.0.0',description:'Browser-local MSW API, no authentication or remote persistence. Admissions strategies and AI replies are demonstrations. 2028 exam dates are fixtures. Bootstrap is a development convenience; replace it with authenticated, student-scoped endpoints for production.'},servers:[{url:'/api/v1'}],paths,components:{schemas}};
fs.writeFileSync('public/openapi.json',JSON.stringify(document,null,2)+'\n');
console.log(`Generated ${definitions.length} API operations and ${Object.keys(schemas).length} schemas.`);
