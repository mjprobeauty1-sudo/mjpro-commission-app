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
  care:    { label:'润颜术VIP套餐',  groups:['client','amount'] },
  review:  { label:'客户Review点评',       groups:['client'] },
  tattoo:  { label:'纹绣服务',             groups:['source','client','amount'] },
  teacher_service: { label:'抗衰手工项目（老师）', groups:[] }
};
const ANTIAGING_OPFEE_VALUE_PREFIX = 'opfee:';
const ANTIAGING_PRODUCT_VALUE_PREFIX = 'product:';

const TEACHER_CATEGORIES = [
  { key:'qz', label:'液态祛皱(QZ)', items:[
    {name:'抬头纹', fee:60},
    {name:'川字纹', fee:60},
    {name:'眼下细纹', fee:60},
    {name:'鱼尾纹', fee:60},
    {name:'美人线', fee:60},
    {name:'上庭小拉皮', fee:60},
    {name:'眼综合（提眉/提眼角/提眼眶）', fee:60},
    {name:'全脸祛皱', fee:300}
  ]},
  { key:'xb', label:'细胞激活(XB)-X', items:[
    {name:'川字纹', fee:65},
    {name:'额头精雕', fee:150},
    {name:'法令纹激活', fee:90},
    {name:'太阳穴精雕', fee:150},
    {name:'脸颊精雕', fee:150},
    {name:'眼袋/泪沟修复', fee:90},
    {name:'印堂（命宫）', fee:90},
    {name:'印第安纹/苹果肌', fee:90},
    {name:'富贵耳', fee:90},
    {name:'鼻基底', fee:90},
    {name:'木偶纹', fee:90},
    {name:'全脸打造', fee:700}
  ]},
  { key:'jy', label:'胶原支架(JY)', items:[
    {name:'外轮廓固定', fee:50, perUnit:true, unitLabel:'支'}
  ]}
];
function teacherFindItem(catKey, itemName){
  const cat = TEACHER_CATEGORIES.find(c=>c.key===catKey);
  if(!cat) return null;
  const item = cat.items.find(i=>i.name===itemName);
  return item ? {cat, item} : null;
}
function teacherParseProductName(productNameVal){
  const parts = String(productNameVal||'').split('::');
  const catKey = parts[0];
  const itemName = parts[1];
  let discountType = 'pct', discountValue = 0, qty = 1;
  if(parts.length>=5){
    discountType = parts[2]==='rm' ? 'rm' : 'pct';
    discountValue = Number(parts[3])||0;
    qty = Number(parts[4])||1;
  } else if(parts.length===4){
    discountType = parts[2]==='rm' ? 'rm' : 'pct';
    discountValue = Number(parts[3])||0;
  } else if(parts.length===3){
    discountType = 'pct';
    discountValue = Number(parts[2])||0;
  }
  const found = teacherFindItem(catKey, itemName);
  return { found, catKey, itemName, discountType, discountValue, qty: Math.max(1, qty) };
}
function teacherDiscountAmount(baseAmount, discountType, discountValue){
  if(discountType==='rm') return Math.min(baseAmount, Math.max(0, discountValue));
  return baseAmount * Math.min(100, Math.max(0, discountValue)) / 100;
}
function teacherItemLabel(productNameVal){
  const { found, discountType, discountValue, qty } = teacherParseProductName(productNameVal);
  if(!found) return productNameVal||'—';
  let discountText = '';
  if(discountValue>0){
    discountText = discountType==='rm' ? `（减RM${discountValue}）` : `（打${(100-discountValue)/10}折）`;
  }
  const qtyText = (found.item.perUnit && qty>1) ? ` × ${qty}${found.item.unitLabel||'支'}` : '';
  return `${found.cat.label}-${found.item.name}${qtyText}${discountText}`;
}

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
let settings = { reviewDefaultAmount:4 };
let currentType = 'invite';

function roleLabel(role){
  return role==='admin' ? '管理员' : role==='teacher' ? '技术老师' : '员工';
}

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
    case 'teacher_service': {
      return [{who:personName(record.personId), role:teacherItemLabel(record.productName), amount: amt}];
    }
    default: return [];
  }
}

function recordDetailText(r){
  const parts = [];
  if(r.type==='antiaging' && r.productName){
    const val = r.productName;
    if(val.startsWith(ANTIAGING_OPFEE_VALUE_PREFIX)) parts.push(val.slice(ANTIAGING_OPFEE_VALUE_PREFIX.length));
    else if(val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX)) parts.push(val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length));
  }
  if(r.type==='invite'){ parts.push(r.closed ? '已成交' : '未成交'); }
  if(r.type==='tattoo'){ parts.push(r.source==='self' ? '自招客户' : '公司客源'); }
  if(r.note) parts.push(r.note);
  return parts.join(' · ') || '—';
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

document.getElementById('changePinBtn').addEventListener('click', async ()=>{
  const newPin = prompt('输入新的 6 位数字 PIN：');
  if(newPin===null) return;
  if(!/^\d{6}$/.test(newPin)){ alert('PIN 必须是 6 位数字。'); return; }
  const { error } = await sb.auth.updateUser({ password: newPin });
  if(error){ alert('修改失败：'+error.message); return; }
  alert('PIN 修改成功，下次登录请用这个新的 PIN。');
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
  document.getElementById('userChip').textContent = `${currentProfile.name}（${roleLabel(currentProfile.role)}）`;
  document.getElementById('pageTitle').textContent = currentProfile.role==='admin' ? '团队提成管理' : (currentProfile.role==='teacher' ? '老师手工费' : '我的提成');

  const now = new Date();
  document.getElementById('monthPicker').value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('monthPicker').addEventListener('change', renderAll);

  await loadAllData();
  if(currentProfile.role==='teacher'){
    buildTeacherSection();
  } else {
    buildStaffSection();
  }
  if(currentProfile.role==='admin'){
    document.getElementById('adminSection').style.display = '';
    buildAdminSection();
  }
  renderAll();
}

function mapProfile(row){
  return { id:row.id, name:row.name, role:row.role, facialRate:row.facial_rate, lashRate:row.lash_rate, icepointRate:row.icepoint_rate, active: row.active!==false };
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
    settings = { reviewDefaultAmount:Number(setRow.review_default_amount)||4 };
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
  try{
    await loadRecordsForMonth();
    if(currentProfile.role==='teacher'){
      updateTeacherPreview();
      renderMyTeacherRecords();
    } else {
      updatePreview();
      renderMyRecords();
    }
    if(currentProfile.role==='admin'){
      renderAdminSummary();
      renderAdminRecordsTable();
    }
  }catch(e){
    console.error('renderAll failed:', e);
    const errEl = document.getElementById(currentProfile.role==='teacher' ? 'addTeacherRecordError' : 'addRecordError');
    if(errEl) errEl.textContent = '画面刷新失败：'+e.message+'（记录可能已经存进去了，请刷新页面确认）';
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
  wrap.innerHTML = Object.keys(TYPES).filter(k=>k!=='teacher_service').map(k=>
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
  if(currentType==='antiaging'){
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
    lines.push({label:op.rateLabel, val: fee});
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
    lines.push({label:'点评奖励（后台设定金额）', val: settings.reviewDefaultAmount});
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
    rec.amount = settings.reviewDefaultAmount;
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

// ---------------- Teacher: new record form ----------------
function buildTeacherSection(){
  const el = document.getElementById('teacherSection');
  el.style.display = '';
  el.innerHTML = `
    <div class="panel">
      <h2>新增手工费记录</h2>
      <div class="field"><label for="t_date">日期</label><input type="date" id="t_date" /></div>
      <div class="field"><label for="t_category">项目类别</label><select id="t_category"></select></div>
      <div class="field"><label for="t_item">具体部位 / 项目</label><select id="t_item"></select></div>
      <div class="field" id="t_qty_field" style="display:none;">
        <label for="t_qty" id="t_qty_label">数量</label>
        <input type="number" id="t_qty" min="1" step="1" value="1" />
      </div>
      <div class="field"><label for="t_client">客户名称</label><input type="text" id="t_client" placeholder="选填" /></div>
      <div class="field">
        <label for="t_discount">给顾客的折扣（选填）</label>
        <div style="display:flex;gap:8px;">
          <select id="t_discount_type" style="max-width:130px;">
            <option value="pct">百分比 %</option>
            <option value="rm">金额 RM</option>
          </select>
          <input type="number" id="t_discount" min="0" step="0.01" placeholder="0" />
        </div>
        <p class="hint" id="t_discount_hint">例如打9折，选「百分比」填 10（代表让了10%）；如果是直接减免一个金额，选「金额 RM」填要扣掉的数目。手工费会跟着扣，没有折扣就留空或填0。</p>
      </div>
      <div class="preview-commission" id="teacherCommissionPreview"></div>
      <div class="field"><label for="t_note">备注</label><input type="text" id="t_note" placeholder="选填" /></div>
      <button class="primary" id="addTeacherRecordBtn">记录入账</button>
      <p class="error-text" id="addTeacherRecordError"></p>
    </div>
  `;

  document.getElementById('t_date').value = new Date().toISOString().slice(0,10);
  const catSel = document.getElementById('t_category');
  catSel.innerHTML = TEACHER_CATEGORIES.map(c=>`<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  renderTeacherItemSelect();
  updateTeacherPreview();

  catSel.addEventListener('change', ()=>{ renderTeacherItemSelect(); updateTeacherQtyVisibility(); updateTeacherPreview(); });
  document.getElementById('t_item').addEventListener('change', ()=>{ updateTeacherQtyVisibility(); updateTeacherPreview(); });
  document.getElementById('t_qty').addEventListener('input', updateTeacherPreview);
  document.getElementById('t_discount').addEventListener('input', updateTeacherPreview);
  document.getElementById('t_discount_type').addEventListener('change', updateTeacherPreview);
  document.getElementById('addTeacherRecordBtn').addEventListener('click', submitTeacherRecord);
}

function renderTeacherItemSelect(){
  const catKey = document.getElementById('t_category').value;
  const cat = TEACHER_CATEGORIES.find(c=>c.key===catKey);
  const sel = document.getElementById('t_item');
  sel.innerHTML = (cat?cat.items:[]).map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}（RM${i.fee}${i.perUnit?'/'+(i.unitLabel||'支'):''}）</option>`).join('');
  updateTeacherQtyVisibility();
}

function currentTeacherItem(){
  const catKey = document.getElementById('t_category').value;
  const itemName = document.getElementById('t_item').value;
  return teacherFindItem(catKey, itemName);
}

function updateTeacherQtyVisibility(){
  const found = currentTeacherItem();
  const qtyField = document.getElementById('t_qty_field');
  const show = !!(found && found.item.perUnit);
  qtyField.style.display = show ? '' : 'none';
  if(!show){ document.getElementById('t_qty').value = 1; }
  else{ document.getElementById('t_qty_label').textContent = `${found.item.unitLabel||'支'}数`; }
}

function currentTeacherQty(){
  const found = currentTeacherItem();
  if(!found || !found.item.perUnit) return 1;
  return Math.max(1, Number(document.getElementById('t_qty').value)||1);
}

function currentTeacherBaseAmount(){
  const found = currentTeacherItem();
  return found ? found.item.fee * currentTeacherQty() : 0;
}

function currentTeacherDiscountType(){
  const el = document.getElementById('t_discount_type');
  return el && el.value==='rm' ? 'rm' : 'pct';
}

function currentTeacherDiscountValue(){
  const val = Number(document.getElementById('t_discount').value)||0;
  return Math.max(0, val);
}

function updateTeacherPreview(){
  const box = document.getElementById('teacherCommissionPreview');
  if(!box) return;
  const baseAmount = currentTeacherBaseAmount();
  const dType = currentTeacherDiscountType();
  const dValue = currentTeacherDiscountValue();
  const discountAmount = teacherDiscountAmount(baseAmount, dType, dValue);
  const finalFee = baseAmount - discountAmount;
  if(dValue>0){
    const discountLabel = dType==='rm' ? `折扣 -RM${dValue}` : `折扣 ${dValue}%`;
    box.innerHTML = `<div class="row"><span>原价手工费</span><span class="num">${fmt(baseAmount)}</span></div>
      <div class="row"><span>${discountLabel}</span><span class="num">-${fmt(discountAmount)}</span></div>
      <div class="row"><span>实收手工费</span><span class="num">${fmt(finalFee)}</span></div>`;
  } else {
    box.innerHTML = `<div class="row"><span>手工费</span><span class="num">${fmt(baseAmount)}</span></div>`;
  }
}

async function submitTeacherRecord(){
  const errEl = document.getElementById('addTeacherRecordError');
  errEl.textContent = '';
  const date = document.getElementById('t_date').value;
  const catKey = document.getElementById('t_category').value;
  const itemName = document.getElementById('t_item').value;
  const client = document.getElementById('t_client').value.trim();
  const dType = currentTeacherDiscountType();
  const dValue = currentTeacherDiscountValue();
  const qty = currentTeacherQty();
  const note = document.getElementById('t_note').value.trim();
  if(!date){ errEl.textContent = '请填写日期。'; return; }
  const found = teacherFindItem(catKey, itemName);
  if(!found){ errEl.textContent = '请选择项目类别和具体部位。'; return; }

  const baseAmount = found.item.fee * qty;
  const discountAmount = teacherDiscountAmount(baseAmount, dType, dValue);
  const finalFee = Math.round((baseAmount - discountAmount) * 100) / 100;
  const rec = {
    type:'teacher_service', date, client, note, status:'pending',
    created_by: currentProfile.id, person_id: currentProfile.id,
    product_name: `${catKey}::${itemName}::${dType}::${dValue}::${qty}`, amount: finalFee
  };

  const { error } = await sb.from('records').insert(rec);
  if(error){ errEl.textContent = '保存失败：'+error.message; return; }

  document.getElementById('t_client').value='';
  document.getElementById('t_discount').value='';
  document.getElementById('t_qty').value='1';
  document.getElementById('t_note').value='';
  const ym = date.slice(0,7);
  if(document.getElementById('monthPicker').value!==ym){ document.getElementById('monthPicker').value=ym; }
  await renderAll();
}

function renderMyTeacherRecords(){
  const mine = records.filter(r=>r.type==='teacher_service' && r.personId===currentProfile.id);
  let total = 0;
  const rows = mine.map(r=>{
    const amt = Number(r.amount)||0;
    total += amt;
    return `<tr>
      <td>${r.date}</td>
      <td>${escapeHtml(teacherItemLabel(r.productName))}</td>
      <td>${escapeHtml(r.client||'—')}</td>
      <td>${escapeHtml(r.note||'—')}</td>
      <td class="num" style="font-weight:600;">${fmt(amt)}</td>
      <td><span class="pill ${r.status==='paid'?'paid':'pending'}">${r.status==='paid'?'已结算':'待结算'}</span></td>
    </tr>`;
  }).join('');

  const el = document.getElementById('teacherSection');
  let listWrap = document.getElementById('myTeacherRecordsPanel');
  if(!listWrap){
    listWrap = document.createElement('div');
    listWrap.id = 'myTeacherRecordsPanel';
    listWrap.className = 'panel';
    el.appendChild(listWrap);
  }
  listWrap.innerHTML = `
    <h2>我本月的记录</h2>
    <div class="summary-strip"><div class="stat total"><p class="label">本月合计</p><p class="value num">${fmt(total)}</p></div></div>
    <div class="table-scroll">
      <table><thead><tr><th>日期</th><th>项目</th><th>客户</th><th>折扣/备注</th><th class="num">金额</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">本月还没有记录</td></tr>'}</tbody></table>
    </div>
  `;
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
      <td>${r.date}</td>
      <td>${TYPES[r.type].label}</td>
      <td>${escapeHtml(r.client||'—')}</td>
      <td>${escapeHtml(recordDetailText(r))}</td>
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
      <table><thead><tr><th>日期</th><th>类型</th><th>客户</th><th>项目 / 备注</th><th class="num">金额</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">本月还没有记录</td></tr>'}</tbody></table>
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
        <select id="newPersonRole"><option value="staff">员工</option><option value="teacher">技术老师</option><option value="admin">管理员</option></select>
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
  const active = people.filter(p=>p.active);
  const inactive = people.filter(p=>!p.active);
  wrap.innerHTML = active.map(p=>`
    <span class="roster-chip">${escapeHtml(p.name)} <span class="hint">(${roleLabel(p.role)})</span>
      ${p.id===currentProfile.id ? '' : `<button data-remove-person="${p.id}" style="margin-left:6px;">移除</button>`}
    </span>`).join('') || '<p class="empty">还没有人员</p>';

  wrap.querySelectorAll('[data-remove-person]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const p = people.find(x=>x.id===btn.getAttribute('data-remove-person'));
      if(!confirm(`确定要移除「${p.name}」吗？移除后TA不能再登录，但TA之前的记录都会保留。`)) return;
      await sb.from('profiles').update({active:false}).eq('id', p.id);
      await loadAllData();
      renderRoster(); renderOpRates(); renderAntiOpItems();
    });
  });

  let inactiveWrap = document.getElementById('inactiveRosterChips');
  if(!inactiveWrap){
    inactiveWrap = document.createElement('div');
    inactiveWrap.id = 'inactiveRosterChips';
    inactiveWrap.style.marginTop = '10px';
    wrap.parentNode.insertBefore(inactiveWrap, wrap.nextSibling);
  }
  if(inactive.length===0){ inactiveWrap.innerHTML = ''; return; }
  inactiveWrap.innerHTML = `<p class="hint" style="margin-bottom:6px;">已移除：</p>` + inactive.map(p=>`
    <span class="roster-chip" style="opacity:0.6;">${escapeHtml(p.name)}
      <button data-restore-person="${p.id}" style="margin-left:6px;">恢复</button>
    </span>`).join('');
  inactiveWrap.querySelectorAll('[data-restore-person]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sb.from('profiles').update({active:true}).eq('id', btn.getAttribute('data-restore-person'));
      await loadAllData();
      renderRoster(); renderOpRates(); renderAntiOpItems();
    });
  });
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
  const { data: adminSessionData } = await sb.auth.getSession();
  const adminSession = adminSessionData.session;
  const { data: signData, error: signErr } = await sb.auth.signUp({ email, password: pin });
  if(signErr || !signData.user){ errEl.textContent = '创建登录账号失败：'+(signErr?signErr.message:'未知错误'); return; }
  if(adminSession){
    await sb.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token });
  }
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
      </div>
      <div class="roster-chips">
        ${people.filter(p=>p.active && p.role!=='teacher').map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${p[op.field]||0}" data-op-rate="${p.id}" data-op-field="${op.field}" /></span>`).join('') || '<span class="empty">先添加人员</span>'}
      </div>
    </div>
  `).join('');

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
        ${people.filter(p=>p.active && p.role!=='teacher').map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${(item.rates&&item.rates[p.id])||0}" data-opitem="${item.id}" data-opperson="${p.id}" /></span>`).join('') || '<span class="empty">先添加人员</span>'}
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
