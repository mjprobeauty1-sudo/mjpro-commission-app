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

const PERSONAL_SALES_TYPES = ['invite','tattoo','review','care'];
const HANDS_ON_TYPES = ['facial','lash','icepoint','antiaging'];

function kpiTierAmount(person, pct){
  const p = Number(pct)||0;
  if(p>=95) return Number(person.kpiTier1)||0;
  if(p>=80) return Number(person.kpiTier2)||0;
  if(p>=70) return Number(person.kpiTier3)||0;
  return 0;
}
function kpiMaxAmount(person){
  return Number(person.kpiTier1)||0;
}

let currentProfile = null;
let people = [];
let records = [];
let antiAgingProducts = [];
let antiagingOpItems = [];
let settings = { reviewDefaultAmount:4 };
let currentType = 'invite';
let editingRecordId = null;
let editingTeacherRecordId = null;
let payrollMonthly = {};
let bonusItems = [];

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
  return { id:row.id, name:row.name, role:row.role, facialRate:row.facial_rate, lashRate:row.lash_rate, icepointRate:row.icepoint_rate, active: row.active!==false,
    baseSalary: Number(row.base_salary)||0, allowance: Number(row.allowance)||0,
    kpiTier1: Number(row.kpi_tier1)||0, kpiTier2: Number(row.kpi_tier2)||0, kpiTier3: Number(row.kpi_tier3)||0,
    targetBonusPool: row.target_bonus_pool==null ? 1500 : Number(row.target_bonus_pool),
    targetBonusThreshold: row.target_bonus_threshold==null ? 60000 : Number(row.target_bonus_threshold) };
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

async function loadPayrollForMonth(){
  const ym = document.getElementById('monthPicker').value;
  const [{data:kpiRows}, {data:bonusRows}] = await Promise.all([
    sb.from('payroll_monthly').select('*').eq('ym', ym),
    sb.from('bonus_items').select('*').eq('ym', ym)
  ]);
  payrollMonthly = {};
  (kpiRows||[]).forEach(r=>{ payrollMonthly[r.person_id] = { id:r.id, kpiPct: Number(r.kpi_pct)||0 }; });
  bonusItems = (bonusRows||[]).map(r=>({ id:r.id, personId:r.person_id, ym:r.ym, label:r.label, amount:Number(r.amount)||0 }));
}

function personTypeTotal(personId, typeList){
  const person = people.find(p=>p.id===personId);
  if(!person) return 0;
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });
  let total = 0;
  records.filter(r=>typeList.includes(r.type)).forEach(r=>{
    allocationsFor(r, adRateByPerson).forEach(a=>{
      if(a.who===person.name) total += a.amount;
    });
  });
  return total;
}

function computePayrollReport(personId){
  const person = people.find(p=>p.id===personId);
  if(!person) return null;
  const kpiPct = (payrollMonthly[personId] && payrollMonthly[personId].kpiPct) || 0;
  const kpiAmount = kpiTierAmount(person, kpiPct);
  const kpiMax = kpiMaxAmount(person);
  const personalSales = personTypeTotal(personId, PERSONAL_SALES_TYPES);
  const handsOn = personTypeTotal(personId, HANDS_ON_TYPES);
  const adTotals = personalAdTotals(records);
  const closedInviteTotal = adTotals[personId] || 0;
  const targetThreshold = Number(person.targetBonusThreshold)||0;
  const targetPool = Number(person.targetBonusPool)||0;
  const targetPct = targetThreshold>0 ? Math.min(1, closedInviteTotal/targetThreshold) : 0;
  const targetBonusAmount = Math.round(targetPool*targetPct*100)/100;
  const targetBonusGap = Math.max(0, targetPool - targetBonusAmount);
  const myBonusItems = bonusItems.filter(b=>b.personId===personId);
  const bonusTotal = myBonusItems.reduce((s,b)=>s+b.amount,0);
  const total = (person.baseSalary||0) + kpiAmount + (person.allowance||0) + personalSales + handsOn + bonusTotal + targetBonusAmount;
  const kpiGap = Math.max(0, kpiMax - kpiAmount);
  return { person, kpiPct, kpiAmount, kpiMax, personalSales, handsOn, bonusItems: myBonusItems, bonusTotal,
    closedInviteTotal, targetThreshold, targetPool, targetBonusAmount, targetBonusGap, total, kpiGap };
}

async function renderAll(){
  try{
    await loadRecordsForMonth();
    await loadPayrollForMonth();
    if(currentProfile.role==='teacher'){
      updateTeacherPreview();
      renderMyTeacherRecords();
    } else {
      updatePreview();
      renderMyRecords();
      renderPayrollReport();
    }
    if(currentProfile.role==='admin'){
      renderAdminSummary();
      renderAdminRecordsTable();
      renderPayrollAdminPanel();
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
      ${currentProfile.role==='admin' ? `<div class="field"><label for="f_owner">记录归属人（可以帮团队补登）</label><select id="f_owner"></select></div>` : ''}
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
      <div style="display:flex;gap:8px;">
        <button class="primary" id="addRecordBtn" style="width:100%;">记录入账</button>
        <button id="cancelEditBtn" style="display:none;white-space:nowrap;">取消编辑</button>
      </div>
      <p class="error-text" id="addRecordError"></p>
    </div>
  `;

  document.getElementById('f_date').value = new Date().toISOString().slice(0,10);
  renderTypeTabs();
  applyFieldVisibility();
  renderProductSelect();

  if(currentProfile.role==='admin'){
    const ownerSel = document.getElementById('f_owner');
    const eligible = people.filter(p=>p.active && p.role!=='teacher').slice().sort((a,b)=>a.name.localeCompare(b.name));
    ownerSel.innerHTML = eligible.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    ownerSel.value = currentProfile.id;
    ownerSel.addEventListener('change', ()=>{ prefillAntiagingAmount(); updatePreview(); });
  }

  document.getElementById('f_source').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_closed').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_product').addEventListener('change', ()=>{ prefillAntiagingAmount(); updatePreview(); });
  document.getElementById('f_amount').addEventListener('input', updatePreview);
  document.getElementById('addRecordBtn').addEventListener('click', submitRecord);
  document.getElementById('cancelEditBtn').addEventListener('click', ()=>{
    exitEditMode();
    document.getElementById('f_client').value='';
    document.getElementById('f_amount').value='';
    document.getElementById('f_note').value='';
    document.getElementById('f_closed').checked=false;
    document.getElementById('f_date').value = new Date().toISOString().slice(0,10);
    if(document.getElementById('f_owner')){ document.getElementById('f_owner').value = currentProfile.id; }
    applyFieldVisibility();
    updatePreview();
  });
}

function currentOwnerId(){
  const sel = document.getElementById('f_owner');
  return (sel && sel.value) ? sel.value : currentProfile.id;
}

function exitEditMode(){
  editingRecordId = null;
  document.getElementById('addRecordBtn').textContent = '记录入账';
  document.getElementById('cancelEditBtn').style.display = 'none';
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
    suggested = item && item.rates ? Number(item.rates[currentOwnerId()])||0 : 0;
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
      const ownerId = currentOwnerId();
      const ym = document.getElementById('monthPicker').value;
      const existing = records.filter(r=>r.type==='invite' && r.closed && r.personId===ownerId && r.date.slice(0,7)===ym)
        .reduce((s,r)=>s+(Number(r.amount)||0),0);
      const tRate = tierRate(existing+amt, PERSONAL_AD_TIERS);
      lines.push({label:`面诊成交提成 ${fmtPct(tRate*100)}（按本人当月累计业绩阶梯）`, val: amt*tRate});
    }
  } else if(OP_TYPE_KEYS.includes(currentType)){
    const op = OP_TYPES.find(o=>o.key===currentType);
    const ownerProfile = people.find(p=>p.id===currentOwnerId());
    const fee = Number(ownerProfile && ownerProfile[op.field])||0;
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

  const ownerId = currentOwnerId();
  const rec = { type:currentType, date, client, note };
  if(!editingRecordId){ rec.status = 'pending'; rec.created_by = currentProfile.id; }

  if(currentType==='invite'){
    rec.person_id = ownerId;
    rec.closed = document.getElementById('f_closed').checked;
    rec.amount = rec.closed ? (Number(document.getElementById('f_amount').value)||0) : 0;
    if(rec.closed && !rec.amount){ errEl.textContent = '已勾选「已成交」，请填写面诊成交业绩金额。'; return; }
  } else if(OP_TYPE_KEYS.includes(currentType)){
    rec.person_id = ownerId;
  } else if(currentType==='antiaging'){
    rec.person_id = ownerId;
    rec.product_name = document.getElementById('f_product').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.product_name || !rec.amount){ errEl.textContent = '请选择抗衰项目并填写金额。'; return; }
  } else if(currentType==='care'){
    rec.person_id = ownerId;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = '请填写订单金额。'; return; }
  } else if(currentType==='review'){
    rec.person_id = ownerId;
    rec.amount = settings.reviewDefaultAmount;
  } else if(currentType==='tattoo'){
    rec.source = document.getElementById('f_source').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = '请填写服务金额。'; return; }
    if(rec.source==='self'){ rec.provider_id = ownerId; }
    else { rec.referrer_id = ownerId; rec.director = document.getElementById('f_director').value.trim(); }
  }

  let error;
  if(editingRecordId){
    ({ error } = await sb.from('records').update(rec).eq('id', editingRecordId));
  } else {
    ({ error } = await sb.from('records').insert(rec));
  }
  if(error){ errEl.textContent = '保存失败：'+error.message; return; }

  const wasEditing = !!editingRecordId;
  exitEditMode();

  document.getElementById('f_client').value='';
  document.getElementById('f_amount').value='';
  document.getElementById('f_note').value='';
  document.getElementById('f_closed').checked=false;
  if(wasEditing && document.getElementById('f_owner')){ document.getElementById('f_owner').value = currentProfile.id; }
  const ym = date.slice(0,7);
  if(document.getElementById('monthPicker').value!==ym){ document.getElementById('monthPicker').value=ym; }
  await renderAll();
}

function startEditRecord(rec){
  currentType = rec.type;
  renderTypeTabs();
  applyFieldVisibility();

  document.getElementById('f_date').value = rec.date || '';
  document.getElementById('f_client').value = rec.client || '';
  document.getElementById('f_note').value = rec.note || '';
  if(document.getElementById('f_owner')){
    document.getElementById('f_owner').value = recordPrimaryPersonId(rec) || currentProfile.id;
  }

  if(rec.type==='invite'){
    document.getElementById('f_closed').checked = !!rec.closed;
    applyFieldVisibility();
    if(rec.closed){ document.getElementById('f_amount').value = rec.amount || ''; }
  } else if(rec.type==='antiaging'){
    renderProductSelect();
    document.getElementById('f_product').value = rec.productName || '';
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='care'){
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='tattoo'){
    document.getElementById('f_source').value = rec.source || 'self';
    applyFieldVisibility();
    if(rec.source==='company'){ document.getElementById('f_director').value = rec.director || ''; }
    document.getElementById('f_amount').value = rec.amount || '';
  }

  editingRecordId = rec.id;
  document.getElementById('addRecordBtn').textContent = '更新记录';
  document.getElementById('cancelEditBtn').style.display = '';
  updatePreview();
  document.getElementById('staffSection').scrollIntoView({behavior:'smooth', block:'start'});
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

// ---------------- Staff: monthly payroll report ----------------
function renderPayrollReport(){
  const report = computePayrollReport(currentProfile.id);
  if(!report) return;
  const el = document.getElementById('staffSection');
  let wrap = document.getElementById('payrollReportPanel');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'payrollReportPanel';
    wrap.className = 'panel';
    el.appendChild(wrap);
  }
  const bonusRows = report.bonusItems.map(b=>`<div class="row"><span>${escapeHtml(b.label||'Bonus')}</span><span class="num">${fmt(b.amount)}</span></div>`).join('')
    || '<div class="row"><span>本月还没有Bonus项目</span><span class="num">—</span></div>';
  wrap.innerHTML = `
    <h2>本月工资报告</h2>
    <div class="preview-commission">
      <div class="row"><span>底薪</span><span class="num">${fmt(report.person.baseSalary)}</span></div>
      <div class="row"><span>KPI奖金（达标率 ${report.kpiPct}%）</span><span class="num">${fmt(report.kpiAmount)}</span></div>
      <div class="row"><span>津贴</span><span class="num">${fmt(report.person.allowance)}</span></div>
      <div class="row"><span>个人提成合计（sales + 手工服务）</span><span class="num">${fmt(report.personalSales + report.handsOn)}</span></div>
      <div class="row"><span>达标bonus（邀约业绩 ${fmt(report.closedInviteTotal)} / ${fmt(report.targetThreshold)}）</span><span class="num">${fmt(report.targetBonusAmount)}</span></div>
      <div class="row"><span>Bonus合计</span><span class="num">${fmt(report.bonusTotal)}</span></div>
    </div>
    <div class="summary-strip"><div class="stat total"><p class="label">本月合计</p><p class="value num">${fmt(report.total)}</p></div></div>
    <p style="font-weight:600;font-size:13px;margin:0 0 8px;">Bonus 明细</p>
    <div class="preview-commission" style="margin-bottom:14px;">${bonusRows}</div>
    ${report.kpiGap>0 ? `<p class="hint" style="color:var(--warning);">KPI还差 ${fmt(report.kpiGap)} 就能拿满档（达到95%以上）。</p>` : ''}
    ${report.targetBonusGap>0 ? `<p class="hint" style="color:var(--warning);">邀约业绩还差 ${fmt(report.targetThreshold-report.closedInviteTotal)} 就能拿满 ${fmt(report.targetPool)} 的达标bonus。</p>` : ''}
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
      <h2>薪资设置（底薪 / 津贴 / KPI 三档）</h2>
      <p class="hint" style="margin:0 0 10px;">「本月达标率%」是每个月你自己打分输入的，系统会照下面三档金额自动换算成KPI奖金。</p>
      <div class="table-scroll"><table>
        <thead><tr><th>姓名</th><th class="num">底薪</th><th class="num">津贴</th><th class="num">KPI ≥95%</th><th class="num">KPI 80-94%</th><th class="num">KPI 70-79%</th><th class="num">本月达标率%</th><th class="num">达标bonus封顶</th><th class="num">达标业绩门槛</th></tr></thead>
        <tbody id="payrollSettingsBody"></tbody>
      </table></div>
      <p class="hint" style="margin-top:8px;">「达标bonus」是照这个人当月邀约已成交业绩，除以「达标业绩门槛」算完成率（封顶100%），再乘以「达标bonus封顶」自动算出来的，不用手动输入。</p>
    </div>
    <div class="panel">
      <h2>Bonus 明细管理</h2>
      <p class="hint" style="margin:0 0 10px;">专场业绩这些手动加进来，员工自己会在「本月工资报告」看到这个明细。</p>
      <div class="add-row">
        <select id="bonusPerson"></select>
        <input type="text" id="bonusLabel" placeholder="项目名称，例：8月祛斑专场" style="width:220px;" />
        <input type="number" id="bonusAmount" placeholder="金额 RM" style="width:110px;" />
        <button id="addBonusBtn">添加</button>
      </div>
      <p class="error-text" id="addBonusError"></p>
      <div id="bonusItemsWrap" style="margin-top:12px;"></div>
    </div>
    <div class="panel">
      <h2>老师手工费补登 / 编辑</h2>
      <div class="field"><label for="at_owner">老师</label><select id="at_owner"></select></div>
      <div class="field"><label for="at_date">日期</label><input type="date" id="at_date" /></div>
      <div class="field"><label for="at_category">项目类别</label><select id="at_category"></select></div>
      <div class="field"><label for="at_item">具体部位 / 项目</label><select id="at_item"></select></div>
      <div class="field" id="at_qty_field" style="display:none;">
        <label for="at_qty" id="at_qty_label">数量</label>
        <input type="number" id="at_qty" min="1" step="1" value="1" />
      </div>
      <div class="field"><label for="at_client">客户名称</label><input type="text" id="at_client" placeholder="选填" /></div>
      <div class="field">
        <label for="at_discount">给顾客的折扣（选填）</label>
        <div style="display:flex;gap:8px;">
          <select id="at_discount_type" style="max-width:130px;">
            <option value="pct">百分比 %</option>
            <option value="rm">金额 RM</option>
          </select>
          <input type="number" id="at_discount" min="0" step="0.01" placeholder="0" />
        </div>
      </div>
      <div class="preview-commission" id="atTeacherCommissionPreview"></div>
      <div class="field"><label for="at_note">备注</label><input type="text" id="at_note" placeholder="选填" /></div>
      <div style="display:flex;gap:8px;">
        <button class="primary" id="addAtTeacherRecordBtn" style="width:100%;">记录入账</button>
        <button id="cancelAtEditBtn" style="display:none;white-space:nowrap;">取消编辑</button>
      </div>
      <p class="error-text" id="addAtTeacherRecordError"></p>
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
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 style="margin:0;">本月全部明细</h2>
        <select id="adminRecordsPersonFilter" style="max-width:200px;"><option value="">全部人员</option></select>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>日期</th><th>类型</th><th>人员</th><th>客户</th><th class="num">分成明细</th><th>状态</th></tr></thead>
        <tbody id="adminRecordsBody"></tbody>
      </table></div>
    </div>
    <div class="panel">
      <h2>结算总结（复制发给团队）</h2>
      <p class="hint" style="margin:0 0 10px;">选一个人，会把TA当月已经标记「已结算」的记录整理成一段文字，复制后可以直接发到 WhatsApp。</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <select id="statementPerson"></select>
        <button id="genStatementBtn">生成结算讯息</button>
      </div>
      <textarea id="statementOutput" readonly style="min-height:180px;font-family:var(--font-num);font-size:12.5px;line-height:1.6;" placeholder="点「生成结算讯息」查看内容"></textarea>
      <div style="margin-top:10px;">
        <button class="primary" id="copyStatementBtn" style="width:auto;">复制文字</button>
      </div>
    </div>
  `;
  renderRoster();
  renderOpRates();
  renderAntiProducts();
  renderAntiOpItems();
  buildAdminTeacherPanel();
  renderPayrollAdminPanel();
  document.getElementById('reviewDefaultInput').value = settings.reviewDefaultAmount;

  document.getElementById('addPersonBtn').addEventListener('click', addPerson);
  document.getElementById('addProductBtn').addEventListener('click', addProduct);
  document.getElementById('addOpItemBtn').addEventListener('click', addOpItem);
  document.getElementById('addBonusBtn').addEventListener('click', addBonusItem);
  document.getElementById('adminRecordsPersonFilter').addEventListener('change', renderAdminRecordsTable);
  document.getElementById('reviewDefaultInput').addEventListener('input', async (e)=>{
    settings.reviewDefaultAmount = Number(e.target.value)||4;
    await sb.from('settings').update({review_default_amount:settings.reviewDefaultAmount}).eq('id',1);
  });
  document.getElementById('genStatementBtn').addEventListener('click', ()=>{
    const personId = document.getElementById('statementPerson').value;
    const out = document.getElementById('statementOutput');
    out.value = personId ? (buildStatementText(personId) || '') : '';
  });
  document.getElementById('copyStatementBtn').addEventListener('click', async ()=>{
    const out = document.getElementById('statementOutput');
    if(!out.value) return;
    const btn = document.getElementById('copyStatementBtn');
    try{ await navigator.clipboard.writeText(out.value); }
    catch(e){ out.removeAttribute('readonly'); out.select(); document.execCommand('copy'); out.setAttribute('readonly','readonly'); }
    const old = btn.textContent; btn.textContent = '已复制'; setTimeout(()=>{ btn.textContent = old; }, 1500);
  });
}

// ---------------- Admin: backfill/edit teacher records ----------------
function buildAdminTeacherPanel(){
  const ownerSel = document.getElementById('at_owner');
  const teachers = people.filter(p=>p.active && p.role==='teacher').slice().sort((a,b)=>a.name.localeCompare(b.name));
  ownerSel.innerHTML = teachers.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') || '<option value="">还没有老师</option>';

  document.getElementById('at_date').value = new Date().toISOString().slice(0,10);
  const catSel = document.getElementById('at_category');
  catSel.innerHTML = TEACHER_CATEGORIES.map(c=>`<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  renderAtTeacherItemSelect();
  updateAtTeacherPreview();

  catSel.addEventListener('change', ()=>{ renderAtTeacherItemSelect(); updateAtTeacherPreview(); });
  document.getElementById('at_item').addEventListener('change', ()=>{ updateAtTeacherQtyVisibility(); updateAtTeacherPreview(); });
  document.getElementById('at_qty').addEventListener('input', updateAtTeacherPreview);
  document.getElementById('at_discount').addEventListener('input', updateAtTeacherPreview);
  document.getElementById('at_discount_type').addEventListener('change', updateAtTeacherPreview);
  document.getElementById('addAtTeacherRecordBtn').addEventListener('click', submitAtTeacherRecord);
  document.getElementById('cancelAtEditBtn').addEventListener('click', ()=>{
    exitAtEditMode();
    document.getElementById('at_client').value='';
    document.getElementById('at_discount').value='';
    document.getElementById('at_qty').value='1';
    document.getElementById('at_note').value='';
    document.getElementById('at_date').value = new Date().toISOString().slice(0,10);
    updateAtTeacherPreview();
  });
}

function renderAtTeacherItemSelect(){
  const catKey = document.getElementById('at_category').value;
  const cat = TEACHER_CATEGORIES.find(c=>c.key===catKey);
  const sel = document.getElementById('at_item');
  sel.innerHTML = (cat?cat.items:[]).map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}（RM${i.fee}${i.perUnit?'/'+(i.unitLabel||'支'):''}）</option>`).join('');
  updateAtTeacherQtyVisibility();
}

function currentAtTeacherItem(){
  const catKey = document.getElementById('at_category').value;
  const itemName = document.getElementById('at_item').value;
  return teacherFindItem(catKey, itemName);
}

function updateAtTeacherQtyVisibility(){
  const found = currentAtTeacherItem();
  const qtyField = document.getElementById('at_qty_field');
  const show = !!(found && found.item.perUnit);
  qtyField.style.display = show ? '' : 'none';
  if(!show){ document.getElementById('at_qty').value = 1; }
  else{ document.getElementById('at_qty_label').textContent = `${found.item.unitLabel||'支'}数`; }
}

function currentAtTeacherQty(){
  const found = currentAtTeacherItem();
  if(!found || !found.item.perUnit) return 1;
  return Math.max(1, Number(document.getElementById('at_qty').value)||1);
}

function currentAtTeacherBaseAmount(){
  const found = currentAtTeacherItem();
  return found ? found.item.fee * currentAtTeacherQty() : 0;
}

function currentAtTeacherDiscountType(){
  const el = document.getElementById('at_discount_type');
  return el && el.value==='rm' ? 'rm' : 'pct';
}

function currentAtTeacherDiscountValue(){
  return Math.max(0, Number(document.getElementById('at_discount').value)||0);
}

function updateAtTeacherPreview(){
  const box = document.getElementById('atTeacherCommissionPreview');
  if(!box) return;
  const baseAmount = currentAtTeacherBaseAmount();
  const dType = currentAtTeacherDiscountType();
  const dValue = currentAtTeacherDiscountValue();
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

function exitAtEditMode(){
  editingTeacherRecordId = null;
  document.getElementById('addAtTeacherRecordBtn').textContent = '记录入账';
  document.getElementById('cancelAtEditBtn').style.display = 'none';
}

async function submitAtTeacherRecord(){
  const errEl = document.getElementById('addAtTeacherRecordError');
  errEl.textContent = '';
  const ownerId = document.getElementById('at_owner').value;
  const date = document.getElementById('at_date').value;
  const catKey = document.getElementById('at_category').value;
  const itemName = document.getElementById('at_item').value;
  const client = document.getElementById('at_client').value.trim();
  const dType = currentAtTeacherDiscountType();
  const dValue = currentAtTeacherDiscountValue();
  const qty = currentAtTeacherQty();
  const note = document.getElementById('at_note').value.trim();
  if(!ownerId){ errEl.textContent = '请先添加一位老师。'; return; }
  if(!date){ errEl.textContent = '请填写日期。'; return; }
  const found = teacherFindItem(catKey, itemName);
  if(!found){ errEl.textContent = '请选择项目类别和具体部位。'; return; }

  const baseAmount = found.item.fee * qty;
  const discountAmount = teacherDiscountAmount(baseAmount, dType, dValue);
  const finalFee = Math.round((baseAmount - discountAmount) * 100) / 100;
  const rec = {
    type:'teacher_service', date, client, note,
    person_id: ownerId,
    product_name: `${catKey}::${itemName}::${dType}::${dValue}::${qty}`, amount: finalFee
  };
  if(!editingTeacherRecordId){ rec.status = 'pending'; rec.created_by = currentProfile.id; }

  let error;
  if(editingTeacherRecordId){
    ({ error } = await sb.from('records').update(rec).eq('id', editingTeacherRecordId));
  } else {
    ({ error } = await sb.from('records').insert(rec));
  }
  if(error){ errEl.textContent = '保存失败：'+error.message; return; }

  const wasEditing = !!editingTeacherRecordId;
  exitAtEditMode();
  document.getElementById('at_client').value='';
  document.getElementById('at_discount').value='';
  document.getElementById('at_qty').value='1';
  document.getElementById('at_note').value='';
  const ym = date.slice(0,7);
  if(document.getElementById('monthPicker').value!==ym){ document.getElementById('monthPicker').value=ym; }
  await renderAll();
}

function startEditTeacherRecord(rec){
  const ownerSel = document.getElementById('at_owner');
  if(ownerSel){ ownerSel.value = rec.personId; }
  document.getElementById('at_date').value = rec.date || '';
  document.getElementById('at_client').value = rec.client || '';
  document.getElementById('at_note').value = rec.note || '';

  const parsed = teacherParseProductName(rec.productName);
  document.getElementById('at_category').value = parsed.catKey;
  renderAtTeacherItemSelect();
  document.getElementById('at_item').value = parsed.itemName;
  updateAtTeacherQtyVisibility();
  document.getElementById('at_qty').value = parsed.qty || 1;
  document.getElementById('at_discount_type').value = parsed.discountType;
  document.getElementById('at_discount').value = parsed.discountValue || '';

  editingTeacherRecordId = rec.id;
  document.getElementById('addAtTeacherRecordBtn').textContent = '更新记录';
  document.getElementById('cancelAtEditBtn').style.display = '';
  updateAtTeacherPreview();
  document.getElementById('adminSection').scrollIntoView({behavior:'smooth', block:'start'});
}

function buildStatementText(personId){
  const person = people.find(p=>p.id===personId);
  if(!person) return null;
  const ym = document.getElementById('monthPicker').value;
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });

  const mine = records.filter(r=> recordPrimaryPersonId(r)===personId && r.status==='paid')
    .slice().sort((a,b)=> a.date<b.date?-1:1);

  let total = 0;
  const lines = mine.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson).filter(a=>a.who===person.name);
    const sum = allocs.reduce((s,a)=>s+a.amount,0);
    total += sum;
    const detail = r.type==='teacher_service' ? teacherItemLabel(r.productName) : recordDetailText(r);
    const detailText = (detail && detail!=='—') ? `（${detail}）` : '';
    const clientPart = r.client ? ` ${r.client}` : '';
    return `- ${r.date} ${TYPES[r.type].label}${clientPart}${detailText}：${fmt(sum)}`;
  }).filter(Boolean);

  const [y,m] = ym.split('-');
  const header = `【MJPRO 提成结算】${person.name} · ${y}年${parseInt(m,10)}月`;
  if(lines.length===0){
    return `${header}\n\n本月还没有已结算的记录。`;
  }
  return [header, '', ...lines, '', `已结算合计：${fmt(total)}`].join('\n');
}

function renderStatementPersonSelect(){
  const sel = document.getElementById('statementPerson');
  if(!sel) return;
  const prevVal = sel.value;
  const sorted = people.filter(p=>p.active).slice().sort((a,b)=>a.name.localeCompare(b.name));
  sel.innerHTML = sorted.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if(sorted.some(p=>p.id===prevVal)) sel.value = prevVal;
}

// ---------------- Admin: payroll settings + bonus items ----------------
function renderPayrollAdminPanel(){
  const body = document.getElementById('payrollSettingsBody');
  if(!body) return;
  const eligible = people.filter(p=>p.active && p.role!=='teacher').slice().sort((a,b)=>a.name.localeCompare(b.name));
  body.innerHTML = eligible.map(p=>{
    const pct = (payrollMonthly[p.id] && payrollMonthly[p.id].kpiPct) || 0;
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.baseSalary||0}" data-payroll-field="base_salary" data-person="${p.id}" style="width:90px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.allowance||0}" data-payroll-field="allowance" data-person="${p.id}" style="width:80px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.kpiTier1||0}" data-payroll-field="kpi_tier1" data-person="${p.id}" style="width:80px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.kpiTier2||0}" data-payroll-field="kpi_tier2" data-person="${p.id}" style="width:80px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.kpiTier3||0}" data-payroll-field="kpi_tier3" data-person="${p.id}" style="width:80px;" /></td>
      <td class="num"><input type="number" class="num" min="0" max="100" step="1" value="${pct}" data-kpi-pct="${p.id}" style="width:70px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.targetBonusPool||0}" data-payroll-field="target_bonus_pool" data-person="${p.id}" style="width:90px;" /></td>
      <td class="num"><input type="number" class="num" min="0" step="1" value="${p.targetBonusThreshold||0}" data-payroll-field="target_bonus_threshold" data-person="${p.id}" style="width:100px;" /></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty">还没有人员</td></tr>';

  body.querySelectorAll('[data-payroll-field]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const personId = inp.getAttribute('data-person');
      const field = inp.getAttribute('data-payroll-field');
      const val = Number(inp.value)||0;
      const person = people.find(p=>p.id===personId);
      if(person){
        const camel = field.replace(/_([a-z])/g,(m,c)=>c.toUpperCase());
        person[camel] = val;
      }
      await sb.from('profiles').update({[field]: val}).eq('id', personId);
      renderPayrollReport();
    });
  });
  body.querySelectorAll('[data-kpi-pct]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      const personId = inp.getAttribute('data-kpi-pct');
      const ym = document.getElementById('monthPicker').value;
      const val = Math.min(100, Math.max(0, Number(inp.value)||0));
      await sb.from('payroll_monthly').upsert({ person_id:personId, ym, kpi_pct:val }, { onConflict:'person_id,ym' });
      payrollMonthly[personId] = { ...(payrollMonthly[personId]||{}), kpiPct: val };
      renderPayrollReport();
    });
  });

  const bonusSel = document.getElementById('bonusPerson');
  if(bonusSel){
    const prevVal = bonusSel.value;
    bonusSel.innerHTML = eligible.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if(eligible.some(p=>p.id===prevVal)) bonusSel.value = prevVal;
  }

  renderBonusItemsWrap();
}

function renderBonusItemsWrap(){
  const wrap = document.getElementById('bonusItemsWrap');
  if(!wrap) return;
  if(bonusItems.length===0){ wrap.innerHTML = '<p class="empty">本月还没有Bonus项目</p>'; return; }
  wrap.innerHTML = bonusItems.map(b=>{
    const person = people.find(p=>p.id===b.personId);
    return `<div class="roster-chip" style="margin-bottom:8px;">${escapeHtml(person?person.name:'未知')} · ${escapeHtml(b.label||'Bonus')} <b class="num" style="margin-left:4px;">${fmt(b.amount)}</b>
      <button class="del" data-del-bonus="${b.id}" aria-label="删除">✕</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-del-bonus]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sb.from('bonus_items').delete().eq('id', btn.getAttribute('data-del-bonus'));
      await loadPayrollForMonth();
      renderBonusItemsWrap();
      renderPayrollReport();
    });
  });
}

async function addBonusItem(){
  const errEl = document.getElementById('addBonusError');
  errEl.textContent = '';
  const personId = document.getElementById('bonusPerson').value;
  const label = document.getElementById('bonusLabel').value.trim();
  const amount = Number(document.getElementById('bonusAmount').value)||0;
  const ym = document.getElementById('monthPicker').value;
  if(!personId){ errEl.textContent = '请选择人员。'; return; }
  if(!label || !amount){ errEl.textContent = '请填写项目名称和金额。'; return; }
  const { error } = await sb.from('bonus_items').insert({ person_id:personId, ym, label, amount });
  if(error){ errEl.textContent = '保存失败：'+error.message; return; }
  document.getElementById('bonusLabel').value = '';
  document.getElementById('bonusAmount').value = '';
  await loadPayrollForMonth();
  renderBonusItemsWrap();
  renderPayrollReport();
}

function renderRoster(){
  renderStatementPersonSelect();
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

function recordPrimaryPersonId(r){
  return r.type==='tattoo' ? (r.source==='self'?r.providerId:r.referrerId) : r.personId;
}

function renderAdminRecordsTable(){
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });

  const filterSel = document.getElementById('adminRecordsPersonFilter');
  let filterId = '';
  if(filterSel){
    const prevVal = filterSel.value;
    const sorted = [...people].sort((a,b)=>a.name.localeCompare(b.name));
    filterSel.innerHTML = '<option value="">全部人员</option>' + sorted.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if(sorted.some(p=>p.id===prevVal)) filterSel.value = prevVal;
    filterId = filterSel.value;
  }
  const filteredRecords = filterId ? records.filter(r=>recordPrimaryPersonId(r)===filterId) : records;

  const body = document.getElementById('adminRecordsBody');
  body.innerHTML = filteredRecords.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson);
    const total = allocs.reduce((s,a)=>s+a.amount,0);
    const who = personName(recordPrimaryPersonId(r));
    const allocText = allocs.map(a=>`${escapeHtml(a.who)} · ${escapeHtml(a.role)}：<b class="num">${fmt(a.amount)}</b>`).join('<br/>');
    return `<tr>
      <td class="num">${r.date}</td>
      <td>${TYPES[r.type].label}</td>
      <td>${escapeHtml(who)}</td>
      <td>${escapeHtml(r.client||'—')}</td>
      <td class="num">${allocText}<div style="margin-top:4px;font-weight:600;">合计 ${fmt(total)}</div></td>
      <td><button class="pill ${r.status==='paid'?'paid':'pending'}" data-toggle="${r.id}">${r.status==='paid'?'已结算':'待结算'}</button>
          ${r.type==='teacher_service' ? `<button data-edit-teacher="${r.id}" style="margin-left:4px;">编辑</button>` : `<button data-edit="${r.id}" style="margin-left:4px;">编辑</button>`}
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
  body.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const rec = records.find(r=>r.id===btn.getAttribute('data-edit'));
      if(rec) startEditRecord(rec);
    });
  });
  body.querySelectorAll('[data-edit-teacher]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const rec = records.find(r=>r.id===btn.getAttribute('data-edit-teacher'));
      if(rec) startEditTeacherRecord(rec);
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
