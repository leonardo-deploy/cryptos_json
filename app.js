const $=id=>document.getElementById(id);const MAX_PAGES=50,FIXED_PER_PAGE=250,TABLE_PAGE_SIZE=250;let catalog=null,stopRequested=false,activeController=null,currentRows=[],currentTablePage=1;const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);const policy=globalThis.CollectionPolicy||{MIN_PAGE_DELAY_SECONDS:5,BLOCK_DELAY_SECONDS:15,PAGES_PER_BLOCK:4,MAX_ATTEMPTS:4,getRetryDelaySeconds:v=>Math.max(60,Number(v)||60)};const {MIN_PAGE_DELAY_SECONDS:PAGE_DELAY,BLOCK_DELAY_SECONDS:BLOCK_DELAY,PAGES_PER_BLOCK,MAX_ATTEMPTS:MAX_RETRIES}=policy;
function show(id){['empty','progressCard','results','error'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}function formatTime(sec){sec=Math.max(0,Math.ceil(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`:m?`${m}m ${String(s).padStart(2,'0')}s`:`${s}s`}
function estimatedWaitAfter(page,pages){let total=0;for(let p=page;p<pages;p++)total+=p%PAGES_PER_BLOCK===0?BLOCK_DELAY:PAGE_DELAY;return total}
function progress(page,pages,count,status,msg,title){const pct=Math.round(page/pages*100);$('progressPct').textContent=`${pct}%`;$('progressBar').style.width=`${pct}%`;$('progressBar').parentElement?.setAttribute('aria-valuenow',String(pct));$('statPages').textContent=String(page);$('statCoins').textContent=fmt(count);$('progressTitle').textContent=title||(page?`Página ${page} de ${pages}`:'Preparando coleta…');$('progressMessage').textContent=msg||''}
function sleepCountdown(seconds,pagesDone,pages){return new Promise(resolve=>{let left=Math.ceil(seconds);const tick=()=>{if(stopRequested){$('nextPageTimer').textContent='Parado';$('totalTimer').textContent='Parado';return resolve(false)}$('nextPageTimer').textContent=formatTime(left);$('totalTimer').textContent=formatTime(left+estimatedWaitAfter(pagesDone+1,pages));if(left<=0)return resolve(true);left--;setTimeout(tick,1000)};tick()})}
async function fetchWithTimeout(url,timeoutMs=25000){activeController=new AbortController();const timer=setTimeout(()=>activeController.abort(),timeoutMs);try{return await fetch(url,{signal:activeController.signal,cache:'no-store'})}catch(error){if(stopRequested&&error?.name==='AbortError')return null;if(error?.name==='AbortError')throw new Error('A consulta demorou mais de 25 segundos para responder.');throw new Error(`Falha de conexão com o servidor: ${error?.message||'erro desconhecido'}`)}finally{clearTimeout(timer);activeController=null}}
async function fetchPage(page,currency,perPage,pages,rows){const u=new URL('/api/markets',location.origin);u.searchParams.set('page',page);u.searchParams.set('currency',currency);u.searchParams.set('per_page',perPage);u.searchParams.set('_',Date.now());for(let attempt=1;attempt<=MAX_RETRIES;attempt++){if(stopRequested)return null;const r=await fetchWithTimeout(u);if(!r)return null;let data;try{data=await r.json()}catch{data={}}if(r.ok){if(!Array.isArray(data))throw new Error('A CoinGecko retornou dados em formato inesperado.');return data}const upstreamStatus=Number(data.upstream_status??data.status??r.status);if(r.status!==429||attempt===MAX_RETRIES)throw new Error((data.error||'A CoinGecko recusou a consulta.')+' (HTTP '+upstreamStatus+')');const wait=policy.getRetryDelaySeconds(data.retry_after_seconds??r.headers.get('Retry-After'));progress(page-1,pages,rows.length,'Limite atingido',`CoinGecko respondeu 429. Nova tentativa em ${formatTime(wait)}.`,'Aguardando CoinGecko');const go=await sleepCountdown(wait,page-1,pages);if(!go)return null}return null}
function build(rows,currency,stopped=false){const seen=new Set(),timestamp=new Date().toISOString(),validRows=rows.filter(c=>Number.isFinite(c.current_price)&&c.id&&!seen.has(c.id)&&seen.add(c.id));return{generated_at:timestamp,last_updated_timestamp:timestamp,source:'CoinGecko',vs_currency:currency,total:validRows.length,collection_status:stopped?'stopped':'completed',cryptos:validRows.map(c=>({id:c.id,symbol:(c.symbol||'').toUpperCase(),name:c.name,image:c.image,current_price:c.current_price,market_cap:c.market_cap,market_cap_rank:c.market_cap_rank,price_change_percentage_24h:c.price_change_percentage_24h,last_updated:c.last_updated}))}}function exportCatalog(){return{last_updated_timestamp:catalog.last_updated_timestamp,cryptos:catalog.cryptos.map(c=>({id:c.id,symbol:c.symbol,name:c.name,image:c.image,display_name:`${c.symbol} - ${c.name}`,current_price_brl:c.current_price}))}}
function finishPartial(rows,currency){if(!rows.length){show('error');$('error').textContent='Coleta interrompida antes de concluir a primeira página. Nenhum dado disponível para download.';return}catalog=build(rows,currency,true);render();show('results')}
$('stop').addEventListener('click',()=>{stopRequested=true;$('stop').disabled=true;$('stop').textContent='Parando…';if(activeController)activeController.abort()});
$('generate').addEventListener('click',async()=>{
  const pages=Number($('pages').value);
  if(!Number.isInteger(pages)||pages<1||pages>MAX_PAGES){show('error');$('error').textContent='Informe uma quantidade inteira de páginas entre 1 e 50.';return}
  const btn=$('generate');
  $('pages').disabled=true;
  stopRequested=false;
  $('stop').disabled=false;
  $('stop').textContent='■ Parar coleta';
  btn.disabled=true;
  $('error').classList.add('hidden');
  show('progressCard');
  const per=FIXED_PER_PAGE,currency=$('currency').value;
  let rows=[];
  $('nextPageTimer').textContent='Consultando…';
  $('totalTimer').textContent=formatTime(estimatedWaitAfter(0,pages));
  try{
    for(let p=1;p<=pages;p++){
      if(stopRequested)break;
      progress(p-1,pages,rows.length,'Consultando',`Enviando solicitação da página ${p}…`,`Consultando página ${p} de ${pages}`);
      $('nextPageTimer').textContent='Consultando…';
      $('totalTimer').textContent=formatTime(estimatedWaitAfter(p-1,pages));
      await new Promise(requestAnimationFrame);
      const data=await fetchPage(p,currency,per,pages,rows);
      if(!data||stopRequested)break;
      rows.push(...data);
      if(p<pages){
        const wait=p%PAGES_PER_BLOCK===0?BLOCK_DELAY:PAGE_DELAY;
        progress(p,pages,rows.length,'Aguardando','',`Página ${p} de ${pages} concluída`);
        const go=await sleepCountdown(wait,p,pages);
        if(!go)break;
      }else{
        progress(p,pages,rows.length,'Concluído',`As ${pages} páginas foram consultadas.`);
        $('nextPageTimer').textContent='Concluído';
        $('totalTimer').textContent='0s';
      }
    }
    if(stopRequested){finishPartial(rows,currency);return}
    catalog=build(rows,currency);
    render();
    show('results');
  }catch(e){
    if(stopRequested)finishPartial(rows,currency);
    else{
      show('error');
      $('error').textContent=`Não foi possível gerar o catálogo: ${e?.message||String(e)}`;
    }
  }finally{
    btn.disabled=false;
    $('pages').disabled=false;
    $('stop').disabled=false;
  }
});
function price(v,c){if(v==null)return'—';return new Intl.NumberFormat('pt-BR',{style:'currency',currency:c.toUpperCase(),maximumFractionDigits:v<1?8:2}).format(v)}function render(){const rows=catalog.cryptos;$('totalMetric').textContent=fmt(catalog.total);$('updatedMetric').textContent=new Date(catalog.generated_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});$('currencyMetric').textContent=catalog.vs_currency.toUpperCase();renderRows(rows)}function renderRows(rows){currentRows=rows;currentTablePage=1;renderTablePage()}function renderTablePage(){const c=catalog.vs_currency,total=currentRows.length,totalPages=Math.max(1,Math.ceil(total/TABLE_PAGE_SIZE));currentTablePage=Math.min(Math.max(1,currentTablePage),totalPages);const start=(currentTablePage-1)*TABLE_PAGE_SIZE,end=Math.min(start+TABLE_PAGE_SIZE,total),visible=currentRows.slice(start,end);$('tbody').innerHTML=visible.map(r=>`<tr><td>${r.market_cap_rank??'—'}</td><td><div class="coin">${coinThumb(r)}<div><b>${esc(r.name)}</b><span>${esc(r.symbol)}</span></div></div></td><td>${price(r.current_price,c)}</td><td class="${(r.price_change_percentage_24h??0)>=0?'positive':'negative'}">${r.price_change_percentage_24h==null?'—':r.price_change_percentage_24h.toFixed(2)+'%'}</td><td>${esc(r.id)}</td></tr>`).join('');$('countLabel').textContent=total?`Exibindo ${fmt(start+1)}–${fmt(end)} de ${fmt(total)} registros`:'Nenhum registro encontrado';$('pageLabel').textContent=`Página ${currentTablePage} de ${totalPages}`;$('prevPage').disabled=currentTablePage===1;$('nextPage').disabled=currentTablePage===totalPages;$('tableWrap').scrollTop=0}
function goToTablePage(delta){if(!catalog)return;const total=Math.max(1,Math.ceil(currentRows.length/TABLE_PAGE_SIZE)),target=currentTablePage+delta;if(target<1||target>total)return;currentTablePage=target;renderTablePage()}
$('prevPage').addEventListener('click',()=>goToTablePage(-1));
$('nextPage').addEventListener('click',()=>goToTablePage(1));
function coinThumb(row){const src=String(row.image||'');return /^https:\/\//.test(src)?`<img src="${esc(src)}" alt="" loading="lazy" width="30" height="30">`:`<span class="coin-fallback" aria-hidden="true">${esc((row.symbol||'?').slice(0,1))}</span>`}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}$('search').addEventListener('input',e=>{if(!catalog)return;const q=e.target.value.trim().toLowerCase();renderRows(!q?catalog.cryptos:catalog.cryptos.filter(r=>r.name.toLowerCase().includes(q)||r.symbol.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)))});$('download').addEventListener('click',()=>{if(!catalog)return;const blob=new Blob([JSON.stringify(exportCatalog(),null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cryptos.json';a.click();URL.revokeObjectURL(a.href)});
