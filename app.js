const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const fmt = n => 'RM ' + Number(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = n => Number(n||0).toLocaleString('en-MY',{maximumFractionDigits:1}) + '%';
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);}

const OP_TYPES = [
  {key:'facial',   field:'facialRate',   label:'润颜术', rateLabel:'润颜术手工费'},
  {key:'lash',     field:'lashRate',     label:'睫毛',   rateLabel:'睫毛手工费'},
  {key:'icepoint', field:'icepointRate', label:'冰点',   rateLabel:'冰点手工费'}
];
const OP_TYPE_KEYS = OP_TYPES.map(o=>o.key);

const TYPES = {
  invite:  { label:'邀约',                 groups:['client','closed'] },
  ...Object.fromEntries(OP_TYPES.map(o=>[o.key, { label:o.label, groups:['client'] }])),
  antiaging:{ label:'抗衰',                groups:['client','product','amount'] },
  care:    { label:'润护理/产品套盒方案',  groups:['client','amount'] },
  review:  { label:'客户Review点评',       groups:['client','amount'] },
  tattoo:  { label:'纹绣服务',             groups:['source','client','amount'] }
};
const ANTIAGING_OPFEE_VALUE_PREFIX = 'opfee:';
const ANTIAGING_PRODUCT_VALUE_PREFIX = 'product:';

const PERSONAL_AD_TIERS = [
  {min:0, max:20000, rate:0.01},
  {min:20000, max:80000, rate:0.03},
  {min:80000, max:Infinity, rate:0.05}
];
function tierRate(amount, tiers){
  for(const t of tiers){ if(amount>=t.min && amount<t.max) return t.rate; }
  return tiers[tiers.length-1].rate;
}

let currentProfile = null;
let people = [];
let records = [];
let antiAgingProducts = [];
let antiagingOpItems = [];
let settings = { reviewDefaultAmount:4, splitFacial:false, splitLash:false, splitIcepoint:false };
let currentType = 'invite';

function personName(id){
  if(!id) return '—';
  const p = people.find(p=>p.id===id);
  return p ? p.name : '未知';
}

function personalAdTotals(monthRecs){
  const totals = {};
  monthRecs.filter(r=>r.type==='invite' && r.closed && Number(r.amount)>0).forEach(r=>{
    totals[r.personId] = (totals[r.personId]||0) + Number(r.amount);
  });
  return totals;
}

function opTypeSplitFlag(key){
  if(key==='facial') return settings.splitFacial;
  if(key==='lash') return settings.splitLash;
  if(key==='icepoint') return settings.splitIcepoint;
  return false;
}

function allocationsFor(record, adRateByPerson){
  const amt = Number(record.amount)||0;
  switch(record.type){
    case 'invite': {
      const allocs = [{who:personName(record.personId), role:'邀约费 RM20', amount:20}];
      if(record.closed && amt>0){
        const rate = adRateByPerson[record.personId]||0;
        allocs.push({who:personName(record.personId), role:`面诊成交提成 ${fmtPct(rate*100)}（月度阶梯）`, amount: amt*rate});
      }
      return allocs;
    }
    case 'facial': case 'lash': case 'icepoint': {
      const op = OP_TYPES.find(o=>o.key===record.type);
      const person = people.find(p=>p.id===record.personId);
      const fee = person ? Number(person[op.field])||0 : 0;
      if(opTypeSplitFlag(op.key)){
        return [
          {who:personName(record.personId), role:`${op.rateLabel}（对半，本人）`, amount: fee/2},
          {who:'公司', role:`${op.rateLabel}（对半，公司）`, amount: fee/2}
        ];
      }
      return [{who:personName(record.personId), role:op.rateLabel, amount: fee}];
    }
    case 'antiaging': {
      const val = record.productName || '';
      if(val.startsWith(ANTIAGING_OPFEE_VALUE_PREFIX)){
        const itemName = val.slice(ANTIAGING_OPFEE_VALUE_PREFIX.length);
        const item = antiagingOpItems.find(i=>i.name===itemName);
        if(item && item.split){
          return [
            {who:personName(record.personId), role:`抗衰-${itemName}（对半，本人）`, amount: amt/2},
            {who:'公司', role:`抗衰-${itemName}（对半，公司）`, amount: amt/2}
          ];
        }
        return [{who:personName(record.personId), role:`抗衰-${itemName}（操作费）`, amount: amt}];
      }
      const productName = val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX) ? val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length) : val;
      return [{who:personName(record.personId), role: productName ? `抗衰-${productName} 提成` : '抗衰（未选项目）', amount: amt}];
    }
    case 'care': {
      const eligible = amt>=1000;
      return [{who:personName(record.personId), role: eligible?'润护理/产品套盒成交费 5%':'润护理/产品套盒（未满RM1000，不计提成）', amount: eligible? amt*0.05:0}];
    }
    case 'review': {
      return [{who:personName(record.personId), role:'Review点评奖励', amount: amt}];
    }
    case 'tattoo': {
      if(record.source==='self'){
        return [
          {who:personName(record.providerId), role:'纹绣自招 90%', amount: amt*0.9},
          {who:'公司', role:'公司抽成 10%', amount: amt*0.1}
        ];
      } else {
        return [
          {who:personName(record.referrerId), role:'合作推荐费 30%', amount: amt*0.3},
          {who:'公司', role:'公司抽成 42%', amount: amt*0.42},
          {who:record.director||'技术总监', role:'技术总监 / Director 28%', amount: amt*0.28}
        ];
      }
    }
    default: return [];
  }
}

// ---------------- Login ----------------
async function initLogin(){
  const { data, error } = await sb.rpc('list_login_names');
  const sel = document.getElementById('loginName');
  if(error){ document.getElementById('loginError').textContent = '读取人员名单失败：'+error.message; return; }
  sel.innerHTML = (data||[]).map(p=>`<option value="${p.id}" data-email="${escapeHtml(p.email)}">${escapeHtml(p.name)}</option>`).join('');
}

document.getElementById('loginBtn').addEventListener('click', async ()=>{
  const sel = document.getElementById('loginName');
  const opt = sel.options[sel.selectedIndex];
  const pin = document.getElementById('loginPin').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if(!opt || !pin){ errEl.textContent = '请选择姓名并输入 PIN。'; return; }
  const email = opt.getAttribute('data-email');
  const { error } = await sb.auth.signInWithPassword({ email, password: pin });
  if(error){ errEl.textContent = 'PIN 不对，请再试一次。'; return; }
  await bootApp();
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

// ---------------- Boot ----------------
async function bootApp(){
  const { data: sess } = await sb.auth.getSession();
  if(!sess.session){ return; }
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', sess.session.user.id).single();
  if(error || !profile){ document.getElementById('loginError').textContent = '找不到你的资料，联系管理员。'; return; }
  currentProfile = mapProfile(profile);

  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').style.display = '';
  document.getElementById('userChip').textContent = `${currentProfile.name}（${currentProfile.role==='admin'?'管理员':'员工'}）`;
  document.getElementById('pageTitle').textContent = currentProfile.role==='admin' ? '团队提成管理' : '我的提成';

  const now = new Date();
  document.getElementById('monthPicker').value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('monthPicker').addEventListener('change', renderAll);

  await loadAllData();
  buildStaffSection();
  if(currentProfile.role==='admin'){
    document.getElementById('adminSection').style.display = '';
    buildAdminSection();
  }
  renderAll();
}

function mapProfile(row){
  return { id:row.id, name:row.name, role:row.role, facialRate:row.facial_rate, lashRate:row.lash_rate, icepointRate:row.icepoint_rate };
}
function mapRecord(row){
  return {
    id:row.id, type:row.type, date:row.date, personId:row.person_id, client:row.client,
    amount:row.amount, rate:row.rate, note:row.note, status:row.status, closed:row.closed,
    productName:row.product_name, source:row.source, providerId:row.provider_id,
    referrerId:row.referrer_id, director:row.director, createdBy:row.created_by
  };
}

async function loadAllData(){
  const [{data:profRows}, {data:prodRows}, {data:opRows}, {data:setRow}] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('antiaging_products').select('*'),
    sb.from('antiaging_op_items').select('*'),
    sb.from('settings').select('*').eq('id',1).single()
  ]);
  people = (profRows||[]).map(mapProfile);
  antiAgingProducts = (prodRows||[]).map(r=>({name:r.name, commission:r.commission, id:r.id}));
  antiagingOpItems = (opRows||[]).map(r=>({name:r.name, split:r.split, rates:r.rates||{}, id:r.id}));
  if(setRow){
    settings = { reviewDefaultAmount:Number(setRow.review_default_amount)||4, splitFacial:!!setRow.split_facial, splitLash:!!setRow.split_lash, splitIcepoint:!!setRow.split_icepoint };
  }
}

async function loadRecordsForMonth(){
  const ym = document.getElementById('monthPicker').value;
  const start = `${ym}-01`;
  const [y,m] = ym.split('-').map(Number);
  const nextMonth = m===12 ? `${y+1}-01-01` : `${y}-${String(m+1).padStart(2,'0')}-01`;
  const { data, error } = await sb.from('records').select('*').gte('date', start).lt('date', nextMonth).order('date', {ascending:false});
  if(error){ console.error(error); records = []; return; }
  records = (data||[]).map(mapRecord);
}

async function renderAll(){
  await loadRecordsForMonth();
  renderStaffForm();
  renderMyRecords();
  if(currentProfile.role==='admin'){
    renderAdminSummary();
    renderAdminRecordsTable();
  }
}

// ---------------- Staff: new record form ----------------
function buildStaffSection(){
  const el = document.getElementById('staffSection');
  el.innerHTML = `
    <div class="panel">
      <h2>新增记录</h2>
      <div class="type-tabs" id="typeTabs"></div>
      <div class="field"><label for="f_date">日期</label><input type="date" id="f_date" /></div>

      <div data-group="source" style="display:none;">
        <div class="field"><label for="f_source">客户来源</label>
          <select id="f_source">
            <option value="self">自招客户（服务师 90% / 公司 10%）</option>
            <option value="company">公司客源 / 广告 / 推荐（推荐人 30% / 公司 42% / 技术总监 28%）</option>
          </select>
        </div>
        <div class="field" id="directorField" style="display:none;">
          <label for="f_director">技术总监 / Director</label>
          <input type="text" id="f_director" placeholder="姓名" />
        </div>
      </div>

      <div data-group="client" style="display:none;">
        <div class="field"><label for="f_client">客户名称</label><input type="text" id="f_client" placeholder="选填" /></div>
      </div>

      <div data-group="closed" style="display:none;">
        <div class="field" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" id="f_closed" style="width:auto;" />
          <label for="f_closed" style="margin:0;">已成交（成功邀约至总部由老师面诊成交）</label>
        </div>
      </div>

      <div data-group="product" style="display:none;">
        <div class="field"><label for="f_product">抗衰项目</label><select id="f_product"></select></div>
      </div>

      <div data-group="amount" style="display:none;">
        <div class="field"><label id="f_amount_label" for="f_amount">金额 (RM)</label><input type="number" id="f_amount" min="0" step="0.01" placeholder="0.00" /></div>
      </div>

      <div class="preview-commission" id="commissionPreview"></div>

      <div class="field"><label for="f_note">备注</label><input type="text" id="f_note" placeholder="选填" /></div>
      <button class="primary" id="addRecordBtn">记录入账</button>
      <p class="error-text" id="addRecordError"></p>
    </div>
  `;

  document.getElementById('f_date').value = new Date().toISOString().slice(0,10);
  renderTypeTabs();
  applyFieldVisibility();
  renderProductSelect();

  document.getElementById('f_source').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_closed').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_product').addEventListener('change', ()=>{ prefillAntiagingAmount(); updatePreview(); });
  document.getElementById('f_amount').addEventListener('input', updatePreview);
  document.getElementById('addRecordBtn').addEventListener('click', submitRecord);
}

function renderTypeTabs(){
  const wrap = document.getElementById('typeTabs');
  wrap.innerHTML = Object.keys(TYPES).map(k=>
    `<button type="button" data-type="${k}" class="${k===currentType?'active':''}">${TYPES[k].label}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentType = btn.getAttribute('data-type');
      renderTypeTabs(); applyFieldVisibility();
      if(currentType==='antiaging'){ prefillAntiagingAmount(); }
      updatePreview();
    });
  });
}

function prefillAntiagingAmount(){
  const val = document.getElementById('f_product').value;
  let suggested = 0;
  if(val.startsWith(ANTIAGING_OPFEE_VALUE_PREFIX)){
    const itemName = val.slice(ANTIAGING_OPFEE_VALUE_PREFIX.length);
    const item = antiagingOpItems.find(i=>i.name===itemName);
    suggested = item && item.rates ? Number(item.rates[currentProfile.id])||0 : 0;
  } else if(val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX)){
    const productName = val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length);
    const product = antiAgingProducts.find(p=>p.name===productName);
    suggested = product ? Number(product.commission)||0 : 0;
  }
  document.getElementById('f_amount').value = suggested || '';
}

function applyFieldVisibility(){
  const cfg = TYPES[currentType];
  const allGroups = ['source','client','closed','product','amount'];
  allGroups.forEach(g=>{
    const el = document.querySelector(`[data-group="${g}"]`);
    if(!el) return;
    let show = cfg.groups.includes(g);
    if(currentType==='invite' && g==='amount'){ show = document.getElementById('f_closed').checked; }
    el.style.display = show ? '' : 'none';
  });
  document.getElementById('directorField').style.display = (currentType==='tattoo' && document.getElementById('f_source').value==='company') ? '' : 'none';

  const amountInput = document.getElementById('f_amount');
  const label = document.getElementById('f_amount_label');
  if(currentType==='review'){
    label.textContent = '点评奖励金额 (RM)'; amountInput.min=3; amountInput.max=5; amountInput.step=0.5;
    if(!amountInput.value){ amountInput.value = settings.reviewDefaultAmount; }
  } else if(currentType==='antiaging'){
    label.textContent = '本次金额 (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='care'){
    label.textContent = '订单金额 (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='tattoo'){
    label.textContent = '服务金额 (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='invite'){
    label.textContent = '本次面诊成交业绩 (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else {
    label.textContent = '金额 (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  }
}

function renderProductSelect(){
  const sel = document.getElementById('f_product');
  const opOpts = antiagingOpItems.map(i=>`<option value="${ANTIAGING_OPFEE_VALUE_PREFIX}${escapeHtml(i.name)}">${escapeHtml(i.name)}（操作费）</option>`).join('');
  const productOpts = antiAgingProducts.map(p=>`<option value="${ANTIAGING_PRODUCT_VALUE_PREFIX}${escapeHtml(p.name)}">${escapeHtml(p.name)}（RM${p.commission} 提成）</option>`).join('');
  sel.innerHTML = opOpts + productOpts || '<option value="">先请管理员添加抗衰项目</option>';
}

function updatePreview(){
  const box = document.getElementById('commissionPreview');
  const amt = Number(document.getElementById('f_amount').value)||0;
  let lines = [];
  if(currentType==='invite'){
    lines.push({label:'邀约费（不论是否成交）', val:20});
    if(document.getElementById('f_closed').checked){
      const ym = document.getElementById('monthPicker').value;
      const existing = records.filter(r=>r.type==='invite' && r.closed && r.personId===currentProfile.id && r.date.slice(0,7)===ym)
        .reduce((s,r)=>s+(Number(r.amount)||0),0);
      const tRate = tierRate(existing+amt, PERSONAL_AD_TIERS);
      lines.push({label:`面诊成交提成 ${fmtPct(tRate*100)}（按本人当月累计业绩阶梯）`, val: amt*tRate});
    }
  } else if(OP_TYPE_KEYS.includes(currentType)){
    const op = OP_TYPES.find(o=>o.key===currentType);
    const fee = Number(currentProfile[op.field])||0;
    if(opTypeSplitFlag(op.key)){
      lines.push({label:`${op.rateLabel}（对半，本人）`, val: fee/2});
      lines.push({label:`${op.rateLabel}（对半，公司）`, val: fee/2});
    } else {
      lines.push({label:op.rateLabel, val: fee});
    }
  } else if(currentType==='antiaging'){
    const val = document.getElementById('f_product').value;
    if(val.startsWith(ANTIAGING_OPFEE_VALUE_PREFIX)){
      const itemName = val.slice(ANTIAGING_OPFEE_VALUE_PREFIX.length);
      const item = antiagingOpItems.find(i=>i.name===itemName);
      if(item && item.split){
        lines.push({label:`${itemName}（对半，本人）`, val: amt/2});
        lines.push({label:`${itemName}（对半，公司）`, val: amt/2});
      } else {
        lines.push({label:`${itemName} 操作费`, val: amt});
      }
    } else {
      const productName = val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX) ? val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length) : val;
      lines.push({label: productName?`${productName} 提成`:'抗衰提成', val: amt});
    }
  } else if(currentType==='care'){
    const eligible = amt>=1000;
    lines.push({label: eligible?'成交费 5%':'未满 RM1000，不计提成', val: eligible?amt*0.05:0});
  } else if(currentType==='review'){
    lines.push({label:'点评奖励', val: amt});
  } else if(currentType==='tattoo'){
    const src = document.getElementById('f_source').value;
    if(src==='self'){
      lines.push({label:'服务师 90%', val: amt*0.9});
      lines.push({label:'公司抽成 10%', val: amt*0.1});
    } else {
      lines.push({label:'推荐人 30%', val: amt*0.3});
      lines.push({label:'公司抽成 42%', val: amt*0.42});
      lines.push({label:'技术总监 28%', val: amt*0.28});
    }
  }
  box.innerHTML = lines.map(l=>`<div class="row"><span>${l.label}</span><span class="num">${fmt(l.val)}</span></div>`).join('');
}

async function submitRecord(){
  const errEl = document.getElementById('addRecordError');
  errEl.textContent = '';
  const date = document.getElementById('f_date').value;
  const client = document.getElementById('f_client').value.trim();
  const note = document.getElementById('f_note').value.trim();
  if(!date){ errEl.textContent = '请填写日期。'; return; }

  const rec = { type:currentType, date, client, note, status:'pending', created_by: currentProfile.id };

  if(currentType==='invite'){
    rec.person_id = currentProfile.id;
    rec.closed = document.getElementById('f_closed').checked;
    rec.amount = rec.closed ? (Number(document.getElementById('f_amount').value)||0) : 0;
    if(rec.closed && !rec.amount){ errEl.textContent = '已勾选「已成交」，请填写面诊成交业绩金额。'; return; }
  } else if(OP_TYPE_KEYS.includes(currentType)){
    rec.person_id = currentProfile.id;
  } else if(currentType==='antiaging'){
    rec.person_id = currentProfile.id;
    rec.product_name = document.getElementById('f_product').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.product_name || !rec.amount){ errEl.textContent = '请选择抗衰项目并填写金额。'; return; }
  } else if(currentType==='care'){
    rec.person_id = currentProfile.id;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = '请填写订单金额。'; return; }
  } else if(currentType==='review'){
    rec.person_id = currentProfile.id;
    rec.amount = Number(document.getElementById('f_amount').value)||settings.reviewDefaultAmount;
  } else if(currentType==='tattoo'){
    rec.source = document.getElementById('f_source').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = '请填写服务金额。'; return; }
    if(rec.source==='self'){ rec.provider_id = currentProfile.id; }
    else { rec.referrer_id = currentProfile.id; rec.director = document.getElementById('f_director').value.trim(); }
  }

  const { error } = await sb.from('records').insert(rec);
  if(error){ errEl.textContent = '保存失败：'+error.message; return; }

  document.getElementById('f_client').value='';
  document.getElementById('f_amount').value='';
  document.getElementById('f_note').value='';
  document.getElementById('f_closed').checked=false;
  const ym = date.slice(0,7);
  if(document.getElementById('monthPicker').value!==ym){ document.getElementById('monthPicker').value=ym; }
  await renderAll();
}

// ---------------- Staff: my records this month ----------------
function renderMyRecords(){
  const mine = records.filter(r=> r.personId===currentProfile.id || r.providerId===currentProfile.id || r.referrerId===currentProfile.id || r.createdBy===currentProfile.id);
  const adRateByPerson = {}; const raw = personalAdTotals(records);
  Object.keys(raw).forEach(id=>{ adRateByPerson[id] = tierRate(raw[id], PERSONAL_AD_TIERS); });

  let total = 0;
  const rows = mine.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson).filter(a=>a.who===currentProfile.name);
    const sum = allocs.reduce((s,a)=>s+a.amount,0);
    total += sum;
    return `<tr>
      <td class="num">${r.date}</td>
      <td>${TYPES[r.type].label}</td>
      <td>${escapeHtml(r.client||'—')}</td>
      <td class="num" style="font-weight:600;">${fmt(sum)}</td>
      <td><span class="pill ${r.status==='paid'?'paid':'pending'}">${r.status==='paid'?'已结算':'待结算'}</span></td>
    </tr>`;
  }).join('');

  const el = document.getElementById('staffSection');
  let listWrap = document.getElementById('myRecordsPanel');
  if(!listWrap){
    listWrap = document.createElement('div');
    listWrap.id = 'myRecordsPanel';
    listWrap.className = 'panel';
    el.appendChild(listWrap);
  }
  listWrap.innerHTML = `
    <h2>我本月的记录</h2>
    <div class="summary-strip"><div class="stat total"><p class="label">本月合计</p><p class="value num">${fmt(total)}</p></div></div>
    <div class="table-scroll">
      <table><thead><tr><th>日期</th><th>类型</th><th>客户</th><th class="num">金额</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">本月还没有记录</td></tr>'}</tbody></table>
    </div>
  `;
}

// ---------------- Admin ----------------
function buildAdminSection(){
  const el = document.getElementById('adminSection');
  el.innerHTML = `
    <div class="panel">
      <h2>本月团队汇总</h2>
      <div class="summary-strip" id="adminSummaryStrip"></div>
    </div>
    <div class="panel">
      <h2>团队人员</h2>
      <div class="roster-chips" id="rosterChips"></div>
      <div class="add-row">
        <input type="text" id="newPersonName" placeholder="姓名" />
        <input type="text" id="newPersonPin" placeholder="初始PIN（6位数字）" maxlength="6" />
        <select id="newPersonRole"><option value="staff">员工</option><option value="admin">管理员</option></select>
        <button id="addPersonBtn">添加人员</button>
      </div>
      <p class="hint">新人第一次登录用这个初始PIN，之后可以自己改。</p>
      <p class="error-text" id="addPersonError"></p>
    </div>
    <div class="panel">
      <h2>润颜术 / 睫毛 / 冰点 手工费</h2>
      <div id="opRatesWrap"></div>
    </div>
    <div class="panel">
      <h2>抗衰产品提成</h2>
      <div class="roster-chips" id="antiProductChips"></div>
      <div class="add-row">
        <input type="text" id="newProductName" placeholder="项目名称，例：298爆卡" />
        <input type="number" id="newProductCommission" placeholder="提成 RM" style="width:110px;" />
        <button id="addProductBtn">添加项目</button>
      </div>
    </div>
    <div class="panel">
      <h2>抗衰操作费项目</h2>
      <div id="antiOpItemsWrap"></div>
      <div class="add-row">
        <input type="text" id="newOpItemName" placeholder="项目名称，例：黄金炮" />
        <button id="addOpItemBtn">添加项目</button>
      </div>
    </div>
    <div class="panel">
      <h2>其他设置</h2>
      <div class="field" style="max-width:220px;">
        <label for="reviewDefaultInput">Review点评默认奖励金额 (RM)</label>
        <input type="number" id="reviewDefaultInput" min="3" max="5" step="0.5" />
      </div>
    </div>
    <div class="panel">
      <h2>本月全部明细</h2>
      <div class="table-scroll"><table>
        <thead><tr><th>日期</th><th>类型</th><th>人员</th><th>客户</th><th class="num">分成明细</th><th>状态</th></tr></thead>
        <tbody id="adminRecordsBody"></tbody>
      </table></div>
    </div>
  `;
  renderRoster();
  renderOpRates();
  renderAntiProducts();
  renderAntiOpItems();
  document.getElementById('reviewDefaultInput').value = settings.reviewDefaultAmount;

  document.getElementById('addPersonBtn').addEventListener('click', addPerson);
  document.getElementById('addProductBtn').addEventListener('click', addProduct);
  document.getElementById('addOpItemBtn').addEventListener('click', addOpItem);
  document.getElementById('reviewDefaultInput').addEventListener('input', async (e)=>{
    settings.reviewDefaultAmount = Number(e.target.value)||4;
    await sb.from('settings').update({review_default_amount:settings.reviewDefaultAmount}).eq('id',1);
  });
}

function renderRoster(){
  const wrap = document.getElementById('rosterChips');
  wrap.innerHTML = people.map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <span class="hint">(${p.role==='admin'?'管理员':'员工'})</span></span>`).join('') || '<p class="empty">还没有人员</p>';
}

async function addPerson(){
  const nameInput = document.getElementById('newPersonName');
  const pinInput = document.getElementById('newPersonPin');
  const roleSel = document.getElementById('newPersonRole');
  const errEl = document.getElementById('addPersonError');
  errEl.textContent = '';
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();
  if(!name || !/^\d{6}$/.test(pin)){ errEl.textContent = '请填写姓名，PIN 需要是6位数字。'; return; }
  const email = `u-${uid()}@mjpro.internal`;
  const { data: signData, error: signErr } = await sb.auth.signUp({ email, password: pin });
  if(signErr || !signData.user){ errEl.textContent = '创建登录账号失败：'+(signErr?signErr.message:'未知错误'); return; }
  const { error: profErr } = await sb.from('profiles').insert({ id:signData.user.id, name, email, role:roleSel.value });
  if(profErr){ errEl.textContent = '创建人员资料失败：'+profErr.message; return; }
  nameInput.value=''; pinInput.value='';
  await loadAllData();
  renderRoster(); renderOpRates();
  renderProductSelect();
}

function renderOpRates(){
  const wrap = document.getElementById('opRatesWrap');
  wrap.innerHTML = OP_TYPES.map(op=>`
    <div style="margin-bottom:14px;">
      <div class="op-item-header">
        <span>${op.label}</span>
        <label><input type="checkbox" data-split-op="${op.key}" ${opTypeSplitFlag(op.key)?'checked':''} /> 与公司平分（50%）</label>
      </div>
      <div class="roster-chips">
        ${people.map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${p[op.field]||0}" data-op-rate="${p.id}" data-op-field="${op.field}" /></span>`).join('') || '<span class="empty">先添加人员</span>'}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-split-op]').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      const key = cb.getAttribute('data-split-op');
      const col = key==='facial' ? 'split_facial' : key==='lash' ? 'split_lash' : 'split_icepoint';
      if(key==='facial') settings.splitFacial = cb.checked;
      if(key==='lash') settings.splitLash = cb.checked;
      if(key==='icepoint') settings.splitIcepoint = cb.checked;
      await sb.from('settings').update({[col]: cb.checked}).eq('id',1);
      await renderAll();
    });
  });
  wrap.querySelectorAll('[data-op-rate]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const personId = inp.getAttribute('data-op-rate');
      const field = inp.getAttribute('data-op-field');
      const col = field==='facialRate'?'facial_rate':field==='lashRate'?'lash_rate':'icepoint_rate';
      const val = Number(inp.value)||0;
      const person = people.find(p=>p.id===personId);
      if(person) person[field] = val;
      await sb.from('profiles').update({[col]: val}).eq('id', personId);
      await renderAll();
    });
  });
}

function renderAntiProducts(){
  const wrap = document.getElementById('antiProductChips');
  wrap.innerHTML = antiAgingProducts.map(p=>`
    <span class="roster-chip">${escapeHtml(p.name)}
      <input type="number" class="num" min="0" step="1" value="${p.commission}" data-product-rate="${p.id}" />
      <button class="del" data-del-product="${p.id}">✕</button>
    </span>`).join('') || '<p class="empty">还没有添加抗衰项目</p>';
  wrap.querySelectorAll('[data-product-rate]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      await sb.from('antiaging_products').update({commission:Number(inp.value)||0}).eq('id', inp.getAttribute('data-product-rate'));
      await loadAllData(); renderAntiProducts(); renderProductSelect(); await renderAll();
    });
  });
  wrap.querySelectorAll('[data-del-product]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sb.from('antiaging_products').delete().eq('id', btn.getAttribute('data-del-product'));
      await loadAllData(); renderAntiProducts(); renderProductSelect(); await renderAll();
    });
  });
}

async function addProduct(){
  const nameInput = document.getElementById('newProductName');
  const commInput = document.getElementById('newProductCommission');
  const name = nameInput.value.trim();
  if(!name) return;
  await sb.from('antiaging_products').insert({name, commission:Number(commInput.value)||0});
  nameInput.value=''; commInput.value='';
  await loadAllData(); renderAntiProducts(); renderProductSelect(); await renderAll();
}

function renderAntiOpItems(){
  const wrap = document.getElementById('antiOpItemsWrap');
  wrap.innerHTML = antiagingOpItems.map(item=>`
    <div class="op-item-card">
      <div class="op-item-header">
        <span>${escapeHtml(item.name)}</span>
        <span style="display:flex;align-items:center;gap:12px;">
          <label><input type="checkbox" data-split-opitem="${item.id}" ${item.split?'checked':''} /> 与公司平分（50%）</label>
          <button class="del" data-del-opitem="${item.id}">✕</button>
        </span>
      </div>
      <div class="roster-chips" style="margin-bottom:0;">
        ${people.map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${(item.rates&&item.rates[p.id])||0}" data-opitem="${item.id}" data-opperson="${p.id}" /></span>`).join('') || '<span class="empty">先添加人员</span>'}
      </div>
    </div>
  `).join('') || '<p class="empty">还没有操作费项目</p>';

  wrap.querySelectorAll('[data-del-opitem]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sb.from('antiaging_op_items').delete().eq('id', btn.getAttribute('data-del-opitem'));
      await loadAllData(); renderAntiOpItems(); renderProductSelect(); await renderAll();
    });
  });
  wrap.querySelectorAll('[data-split-opitem]').forEach(cb=>{
    cb.addEventListener('change', async ()=>{
      await sb.from('antiaging_op_items').update({split:cb.checked}).eq('id', cb.getAttribute('data-split-opitem'));
      await loadAllData(); renderAntiOpItems(); await renderAll();
    });
  });
  wrap.querySelectorAll('[data-opitem]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const itemId = inp.getAttribute('data-opitem');
      const personId = inp.getAttribute('data-opperson');
      const item = antiagingOpItems.find(i=>i.id===itemId);
      if(!item) return;
      const rates = {...(item.rates||{})};
      rates[personId] = Number(inp.value)||0;
      await sb.from('antiaging_op_items').update({rates}).eq('id', itemId);
      await loadAllData(); renderAntiOpItems(); await renderAll();
    });
  });
}

async function addOpItem(){
  const nameInput = document.getElementById('newOpItemName');
  const name = nameInput.value.trim();
  if(!name) return;
  await sb.from('antiaging_op_items').insert({name, split:false, rates:{}});
  nameInput.value='';
  await loadAllData(); renderAntiOpItems(); renderProductSelect(); await renderAll();
}

function renderAdminSummary(){
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });

  const personTotals = {}; let companyTotal = 0; let payoutTotal = 0;
  records.forEach(r=>{
    allocationsFor(r, adRateByPerson).forEach(a=>{
      if(a.who==='公司'){ companyTotal += a.amount; }
      else { personTotals[a.who] = (personTotals[a.who]||0)+a.amount; payoutTotal += a.amount; }
    });
  });
  const strip = document.getElementById('adminSummaryStrip');
  const personCards = Object.keys(personTotals).map(name=>`<div class="stat"><p class="label">${escapeHtml(name)}</p><p class="value num">${fmt(personTotals[name])}</p></div>`).join('');
  strip.innerHTML = `
    <div class="stat total"><p class="label">个人提成合计</p><p class="value num">${fmt(payoutTotal)}</p></div>
    <div class="stat"><p class="label">公司抽成合计</p><p class="value num">${fmt(companyTotal)}</p></div>
    ${personCards}
  `;
}

function renderAdminRecordsTable(){
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });

  const body = document.getElementById('adminRecordsBody');
  body.innerHTML = records.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson);
    const total = allocs.reduce((s,a)=>s+a.amount,0);
    const who = r.type==='tattoo' ? (r.source==='self'?personName(r.providerId):personName(r.referrerId)) : personName(r.personId);
    const allocText = allocs.map(a=>`${escapeHtml(a.who)} · ${escapeHtml(a.role)}：<b class="num">${fmt(a.amount)}</b>`).join('<br/>');
    return `<tr>
      <td class="num">${r.date}</td>
      <td>${TYPES[r.type].label}</td>
      <td>${escapeHtml(who)}</td>
      <td>${escapeHtml(r.client||'—')}</td>
      <td class="num">${allocText}<div style="margin-top:4px;font-weight:600;">合计 ${fmt(total)}</div></td>
      <td><button class="pill ${r.status==='paid'?'paid':'pending'}" data-toggle="${r.id}">${r.status==='paid'?'已结算':'待结算'}</button>
          <button data-del="${r.id}" style="margin-left:4px;">删除</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">本月还没有记录</td></tr>';

  body.querySelectorAll('[data-toggle]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const rec = records.find(r=>r.id===btn.getAttribute('data-toggle'));
      const newStatus = rec.status==='paid'?'pending':'paid';
      await sb.from('records').update({status:newStatus}).eq('id', rec.id);
      await renderAll();
    });
  });
  body.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(!confirm('删除这条记录？')) return;
      await sb.from('records').delete().eq('id', btn.getAttribute('data-del'));
      await renderAll();
    });
  });
}

// ---------------- Init ----------------
(async function(){
  await initLogin();
  await bootApp();
})();
