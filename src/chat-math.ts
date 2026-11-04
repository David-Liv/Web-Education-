// A bounded arithmetic grammar for educational plots. Never executes JavaScript.
export function compilePlot(expression:string):(x:number)=>number {
  if(expression.length>160)throw new Error('Expression too long');
  const tokens=expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+\-*/^]/gi)??[];
  if(tokens.join('').toLowerCase()!==expression.replace(/\s/g,'').toLowerCase()||tokens.length>100)throw new Error('Unsupported expression');
  let i=0,nodes=0,depth=0;
  type Fn=(x:number)=>number;
  const functions:Record<string,(n:number)=>number>={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,ln:Math.log,log:Math.log10,exp:Math.exp};
  function atom():Fn {
    if(++nodes>100||++depth>20)throw new Error('Expression too complex');
    const t=tokens[i++]?.toLowerCase();let f:Fn;
    if(t==='('){f=sum();if(tokens[i++]!==')')throw new Error('Missing parenthesis')}
    else if(t==='x')f=x=>x;
    else if(t==='pi')f=()=>Math.PI;
    else if(t==='e')f=()=>Math.E;
    else if(t&&Object.hasOwn(functions,t)){if(tokens[i++]!=='(')throw new Error('Expected function argument');const a=sum();if(tokens[i++]!==')')throw new Error('Missing parenthesis');f=x=>functions[t](a(x))}
    else if(t&&Number.isFinite(Number(t)))f=()=>Number(t);
    else throw new Error('Unsupported token');
    depth--;return f;
  }
  function power():Fn {const a=atom();if(tokens[i]==='^'){i++;const b=unary();return x=>Math.pow(a(x),b(x))}return a}
  function unary():Fn {if(tokens[i]==='+'||tokens[i]==='-'){if(++nodes>100)throw new Error('Expression too complex');const negative=tokens[i++]==='-',a=unary();return x=>negative?-a(x):a(x)}return power()}
  function product():Fn {let a=unary();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],left=a,b=unary();a=x=>op==='*'?left(x)*b(x):left(x)/b(x)}return a}
  function sum():Fn {let a=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],left=a,b=product();a=x=>op==='+'?left(x)+b(x):left(x)-b(x)}return a}
  const result=sum();if(i!==tokens.length)throw new Error('Unexpected token');return result;
}
export function samplePlot(expression:string,xMin:number,xMax:number,yMin:number,yMax:number) {
  const f=compilePlot(expression),segments:{x:number;y:number}[][]=[];let current:{x:number;y:number}[]=[];
  for(let i=0;i<=240;i++){const x=xMin+(xMax-xMin)*i/240,y=f(x),previous=current.at(-1);
    if(!Number.isFinite(y)||y<yMin||y>yMax||previous&&Math.abs(y-previous.y)>(yMax-yMin)*.65){if(current.length>1)segments.push(current);current=[];if(!Number.isFinite(y)||y<yMin||y>yMax)continue}
    current.push({x,y});
  }
  if(current.length>1)segments.push(current);return segments;
}
