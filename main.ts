import fs from'node:fs'
let e=process.env,A=e.MAKEFUN_INPUT_DIR||'/input',B=e.MAKEFUN_OUTPUT_DIR||'/output',M
for(let i=1;i<6;i++){
let d='i00'+i,L=fs.readFileSync(A+'/'+d+'/level.txt','utf8'),W=L.indexOf('\n'),G=L.replace(/\n/g,''),P=G.indexOf('@'),Y=P/W|0,K=[1,-1,W,-W],V='rldu',Z='',x=P%W
let F=(s,f,p)=>{if(!p){p={[s]:''};M=s}M=s<M?s:M;for(let k in K){let n=s+K[k];if(f(n)&&!(n in p)){p[n]=p[s]+V[k];F(n,f,p)}}return p}
for(let X=0;X<W;X++)for(let D of[-1,1]){
let r=(Y+D)*W+X
if(G[r]=='#'||!G[r])continue
let R=F(r,n=>G[n]&&G[n]!='#'&&(n/W|0)^Y),o=Y*W+X,bx=[],gl=new Set
for(let j in G)if(j in R){let c=G[j];if(c=='$'||c=='*')bx.push(+j);if(c=='.'||c=='*')gl.add(+j)}
Z+=x<X?'r'.repeat(X-x):'l'.repeat(x-X);x=X
let f2=n=>n in R||n==o,lv=new Set(gl),lq=[...gl]
for(let t of lq)for(let k in K){let s=t-K[k];if(f2(s)&&f2(s-K[k])&&!lv.has(s)){lv.add(s);lq.push(s)}}
let q=[[bx,o,'']],sn={},u=0,fp=0
for(let st of q){
let[b,p,pa]=st
if(b.every(i=>gl.has(i))){u=pa;fp=p;break}
let pm=F(p,n=>f2(n)&&!b.includes(n)),ky=b+','+M
if(sn[ky])continue
sn[ky]=1
for(let j in b)for(let k in K){
let ps=b[j]-K[k],tg=b[j]+K[k]
if(ps in pm&&tg in R&&!b.includes(tg)){
let nb=[...b];nb[j]=tg;nb.sort((a,c)=>a-c)
if(nb.every(i=>lv.has(i)))q.push([nb,b[j],pa+pm[ps]+V[k]])
}
}
}
Z+=u+F(fp,n=>n in R&&!gl.has(n))[r]+V[D<0?2:3]
}
fs.mkdirSync(B+'/'+d);fs.writeFileSync(B+'/'+d+'/solution.txt',Z)
}
