const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const fmt = n => 'RM ' + Number(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = n => Number(n||0).toLocaleString('en-MY',{maximumFractionDigits:1}) + '%';
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2);}

const OP_TYPES = [
  {key:'facial',   field:'facialRate',   label:'Ê∂¶È¢úÊúØ', rateLabel:'Ê∂¶È¢úÊúØÊâãÂ∑•Ë¥π'},
  {key:'lash',     field:'lashRate',     label:'Áù´ÊØõ',   rateLabel:'Áù´ÊØõÊâãÂ∑•Ë¥π'},
  {key:'icepoint', field:'icepointRate', label:'ÂÜ∞ÁÇπ',   rateLabel:'ÂÜ∞ÁÇπÊâãÂ∑•Ë¥π'}
];
const OP_TYPE_KEYS = OP_TYPES.map(o=>o.key);

const TYPES = {
  invite:  { label:'ÈÇÄÁ∫¶',                 groups:['client','closed'] },
  ...Object.fromEntries(OP_TYPES.map(o=>[o.key, { label:o.label, groups:['client'] }])),
  antiaging:{ label:'ÊäóË°∞',                groups:['client','product','amount'] },
  care:    { label:'Ê∂¶È¢úÊúØVIPÂ•óÈ§ê',  groups:['client','amount'] },
  review:  { label:'ÂÆ¢Êà∑ReviewÁÇπËØÑ',       groups:['client'] },
  tattoo:  { label:'Á∫πÁª£ÊúçÂä°',             groups:['source','client','amount'] },
  referral:{ label:'ÂºïÊµÅÊúçÂä°',             groups:['client','referral','amount'] },
  other:   { label:'ÂÖ∂‰ªñ',                 groups:['client','amount'] },
  teacher_service: { label:'ÊäóË°∞ÊâãÂ∑•È°πÁõÆÔºàËÄÅÂ∏àÔºâ', groups:[] },
  // Áæé‰∏öËá™Áî±Âêà‰Ωú‰ºô‰º¥ËÆ°ÂàíÂà∂Â∫¶Ôºà2026 Âπ¥ÁâàÔºâ‚Äî only shown for people in PARTNER_NAMES
  p_lash:      { label:'ÁæéÁù´ÊâãÂ∑•Ë¥π',        groups:['client','pmenu'],          partner:true },
  p_facial:    { label:'ÁæéÂÆπÊâãÂ∑•Ë¥π',        groups:['client','pmenu'],          partner:true },
  p_product:   { label:'ÁöÆËÇ§ÁÆ°ÁêÜ‰∫ßÂìÅ 15%',  groups:['client','amount'],         partner:true },
  p_topup:     { label:'‰ºöÂëòÂç°ÂÖÖÂÄº 5%',     groups:['client','amount'],         partner:true },
  p_franchise: { label:'Ê£†ÁæéÂä†ÁõüÂ•ñÂä±',      groups:['client','pmenu'],          partner:true },
  p_freckle:   { label:'Á•õÊñëÈÇÄÁ∫¶Â•ñÂä±',      groups:['client','amount','prate'], partner:true },
  p_profit:    { label:'Ëá™ÂºÄÂèëÂÆ¢Êà∑ 5/5',    groups:['client','amount'],         partner:true }
};
const PARTNER_TYPE_KEYS = Object.keys(TYPES).filter(k=>TYPES[k].partner);
// Matched against the profile name, case-insensitive. Add another name here to put that person on the partner program.
const PARTNER_NAMES = ['minna'];
function isPartner(personId){
  const p = people.find(x=>x.id===personId);
  const name = String((p && p.name) || '').trim().toLowerCase();
  return !!name && PARTNER_NAMES.some(n=>name.includes(n));
}
// Fixed amounts from the partner program. The amount is saved on each record, so later changes here don't alter old records.
const PARTNER_MENUS = {
  p_lash: [
    {name:'ÂºïÊµÅÁù´ÊØõÊñ∞ÂÆ¢Êà∑', fee:40},
    {name:'RM128 Âü∫Á°ÄÊ¨æ', fee:50},
    {name:'RM208 È´òÁ∫ßÂÆöÂà∂Ê¨æ', fee:60},
    {name:'‰∏ãÁù´ÊØõ', fee:10},
    {name:'Âç∏Áù´ÊØõ', fee:10}
  ],
  p_facial: [
    {name:'ÂºïÊµÅÁæéÂÆπÊñ∞ÂÆ¢Êà∑', fee:40},
    {name:'RM128 Âü∫Á°ÄÊ∏ÖÊ¥Å', fee:50},
    {name:'RM198 Ê∑±Â±ÇÊ∏ÖÊ¥Å', fee:60},
    {name:'RM298 Medic Êä§ÁêÜ', fee:80}
  ],
  p_franchise: [
    {name:'RM6,868 ‰ª£È¢ú‰∫∫', fee:350},
    {name:'RM12,868 Âõ¢Èïø', fee:650},
    {name:'RM45,868 CEO', fee:2000},
    {name:'RM145,868 ‰∫ã‰∏öÈÉ®', fee:5000}
  ]
};
function partnerMenuFee(type, itemName){
  const item = (PARTNER_MENUS[type]||[]).find(i=>i.name===itemName);
  return item ? item.fee : 0;
}
// Á•õÊñëÈÇÄÁ∫¶: the whole amount uses one rate by band. Outside RM10,000‚Äì150,000 the company sets the rate by hand.
function freckleTierRate(amount){
  const a = Number(amount)||0;
  if(a>=10000 && a<=50000) return 5;
  if(a>50000 && a<=80000) return 8;
  if(a>80000 && a<=150000) return 10;
  return null;
}
const ANTIAGING_OPFEE_VALUE_PREFIX = 'opfee:';
const ANTIAGING_PRODUCT_VALUE_PREFIX = 'product:';

const TEACHER_CATEGORIES = [
  { key:'qz', label:'Ê∂≤ÊÄÅÁ•õÁö±(QZ)', items:[
    {name:'Êä¨Â§¥Á∫π', fee:60},
    {name:'Â∑ùÂ≠óÁ∫π', fee:60},
    {name:'Áúº‰∏ãÁªÜÁ∫π', fee:60},
    {name:'È±ºÂ∞æÁ∫π', fee:60},
    {name:'Áæé‰∫∫Á∫ø', fee:60},
    {name:'‰∏äÂ∫≠Â∞èÊãâÁöÆ', fee:60},
    {name:'ÁúºÁªºÂêàÔºàÊèêÁúâ/ÊèêÁúºËßí/ÊèêÁúºÁú∂Ôºâ', fee:60},
    {name:'ÂÖ®ËÑ∏Á•õÁö±', fee:300}
  ]},
  { key:'xb', label:'ÁªÜËÉûÊøÄÊ¥ª(XB)-X', items:[
    {name:'Â∑ùÂ≠óÁ∫π', fee:65},
    {name:'È¢ùÂ§¥Á≤æÈõï', fee:150},
    {name:'Ê≥ï‰ª§Á∫πÊøÄÊ¥ª', fee:90},
    {name:'Â§™Èò≥Á©¥Á≤æÈõï', fee:150},
    {name:'ËÑ∏È¢äÁ≤æÈõï', fee:150},
    {name:'ÁúºË¢ã/Ê≥™Ê≤ü‰øÆÂ§ç', fee:90},
    {name:'Âç∞Â†ÇÔºàÂëΩÂÆ´Ôºâ', fee:90},
    {name:'Âç∞Á¨¨ÂÆâÁ∫π/ËãπÊûúËÇå', fee:90},
    {name:'ÂØåË¥µËÄ≥', fee:90},
    {name:'ÈºªÂü∫Â∫ï', fee:90},
    {name:'Êú®ÂÅ∂Á∫π', fee:90},
    {name:'ÂÖ®ËÑ∏ÊâìÈÄ†', fee:700}
  ]},
  { key:'jy', label:'ËÉ∂ÂéüÊîØÊû∂(JY)', items:[
    {name:'Â§ñËΩÆÂªìÂõ∫ÂÆö', fee:50, perUnit:true, unitLabel:'ÊîØ'}
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
  if(!found) return productNameVal||'‚Äî';
  let discountText = '';
  if(discountValue>0){
    discountText = discountType==='rm' ? `ÔºàÂáèRM${discountValue}Ôºâ` : `ÔºàÊâì${(100-discountValue)/10}ÊäòÔºâ`;
  }
  const qtyText = (found.item.perUnit && qty>1) ? ` √ó ${qty}${found.item.unitLabel||'ÊîØ'}` : '';
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

const PERSONAL_SALES_TYPES = ['invite','tattoo','review','care','other','p_product','p_topup','p_franchise','p_freckle','p_profit'];
const HANDS_ON_TYPES = ['facial','lash','icepoint','antiaging','referral','p_lash','p_facial'];

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
let referralItems = [];
let settings = { reviewDefaultAmount:4 };
let currentType = 'invite';
let editingRecordId = null;
let editingTeacherRecordId = null;
let payrollMonthly = {};
let bonusItems = [];
let currentPayday = null;

function roleLabel(role){
  return role==='admin' ? 'ÁÆ°ÁêÜÂëò' : role==='teacher' ? 'ÊäÄÊúØËÄÅÂ∏à' : 'ÂëòÂ∑•';
}

const STATUS_LABELS = { pending:'ÂæÖÂÆ°Ê†∏', reviewed:'Â∑≤ÂÆ°Ê†∏', paid:'Â∑≤ÁªìÁÆó' };
function statusLabel(status){ return STATUS_LABELS[status] || STATUS_LABELS.pending; }
function statusClass(status){ return (status==='paid'||status==='reviewed') ? status : 'pending'; }

function personName(id){
  if(!id) return '‚Äî';
  const p = people.find(p=>p.id===id);
  return p ? p.name : 'Êú™Áü•';
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
      const allocs = [{who:personName(record.personId), role:'ÈÇÄÁ∫¶Ë¥π RM20', amount:20}];
      if(record.closed && amt>0){
        const rate = adRateByPerson[record.personId]||0;
        allocs.push({who:personName(record.personId), role:`Èù¢ËØäÊàê‰∫§ÊèêÊàê ${fmtPct(rate*100)}ÔºàÊúàÂ∫¶Èò∂Ê¢ØÔºâ`, amount: amt*rate});
      }
      return allocs;
    }
    case 'facial': case 'lash': case 'icepoint': {
      if(record.type==='lash' && Number(record.rate)===70){
        return [
          {who:personName(record.personId), role:'Áù´ÊØõÁâπÂà´ÂàÜÊàêÔºàÊú¨‰∫∫70%Ôºâ', amount: amt*0.7},
          {who:'ÂÖ¨Âè∏', role:'Áù´ÊØõÁâπÂà´ÂàÜÊàêÔºàÂÖ¨Âè∏30%Ôºâ', amount: amt*0.3}
        ];
      }
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
            {who:personName(record.personId), role:`ÊäóË°∞-${itemName}ÔºàÂØπÂçäÔºåÊú¨‰∫∫Ôºâ`, amount: amt/2},
            {who:'ÂÖ¨Âè∏', role:`ÊäóË°∞-${itemName}ÔºàÂØπÂçäÔºåÂÖ¨Âè∏Ôºâ`, amount: amt/2}
          ];
        }
        return [{who:personName(record.personId), role:`ÊäóË°∞-${itemName}ÔºàÊìç‰ΩúË¥πÔºâ`, amount: amt}];
      }
      const productName = val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX) ? val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length) : val;
      return [{who:personName(record.personId), role: productName ? `ÊäóË°∞-${productName} ÊèêÊàê` : 'ÊäóË°∞ÔºàÊú™ÈÄâÈ°πÁõÆÔºâ', amount: amt}];
    }
    case 'referral': {
      return [{who:personName(record.personId), role: record.productName ? `ÂºïÊµÅ-${record.productName} Êìç‰ΩúË¥π` : 'ÂºïÊµÅÊìç‰ΩúË¥π', amount: amt}];
    }
    case 'other': {
      return [{who:personName(record.personId), role: record.note ? `ÂÖ∂‰ªñ-${record.note}` : 'ÂÖ∂‰ªñÈ°πÁõÆ', amount: amt}];
    }
    case 'care': {
      const eligible = amt>=1000;
      return [{who:personName(record.personId), role: eligible?'Ê∂¶Êä§ÁêÜ/‰∫ßÂìÅÂ•óÁõíÊàê‰∫§Ë¥π 5%':'Ê∂¶Êä§ÁêÜ/‰∫ßÂìÅÂ•óÁõíÔºàÊú™Êª°RM1000Ôºå‰∏çËÆ°ÊèêÊàêÔºâ', amount: eligible? amt*0.05:0}];
    }
    case 'review': {
      return [{who:personName(record.personId), role:'ReviewÁÇπËØÑÂ•ñÂä±', amount: amt}];
    }
    case 'tattoo': {
      if(record.source==='self'){
        return [
          {who:personName(record.providerId), role:'Á∫πÁª£Ëá™Êãõ 90%', amount: amt*0.9},
          {who:'ÂÖ¨Âè∏', role:'ÂÖ¨Âè∏ÊäΩÊàê 10%', amount: amt*0.1}
        ];
      } else {
        return [
          {who:personName(record.referrerId), role:'Âêà‰ΩúÊé®ËçêË¥π 30%', amount: amt*0.3},
          {who:'ÂÖ¨Âè∏', role:'ÂÖ¨Âè∏ÊäΩÊàê 42%', amount: amt*0.42},
          {who:record.director||'ÊäÄÊúØÊÄªÁõë', role:'ÊäÄÊúØÊÄªÁõë / Director 28%', amount: amt*0.28}
        ];
      }
    }
    case 'teacher_service': {
      return [{who:personName(record.personId), role:teacherItemLabel(record.productName), amount: amt}];
    }
    case 'p_lash': case 'p_facial': {
      return [{who:personName(record.personId), role:`${TYPES[record.type].label}-${record.productName||'Êú™ÈÄâÈ°πÁõÆ'}`, amount: amt}];
    }
    case 'p_product': {
      return [{who:personName(record.personId), role:'ÁöÆËÇ§ÁÆ°ÁêÜ‰∫ßÂìÅÈîÄÂîÆÊèêÊàê 15%', amount: amt*0.15}];
    }
    case 'p_topup': {
      return [{who:personName(record.personId), role:'‰ºöÂëòÂç°ÂÖÖÂÄºÊàê‰∫§ÊèêÊàê 5%', amount: amt*0.05}];
    }
    case 'p_franchise': {
      return [{who:personName(record.personId), role:`Ê£†ÁæéÂä†ÁõüÂ•ñÂä±-${record.productName||'Êú™ÈÄâÈÖçÂ•ó'}`, amount: amt}];
    }
    case 'p_freckle': {
      const rate = Number(record.rate)||0;
      return [{who:personName(record.personId), role:`Á•õÊñëÈÇÄÁ∫¶Â•ñÂä± ${fmtPct(rate)}`, amount: amt*rate/100}];
    }
    case 'p_profit': {
      return [
        {who:personName(record.personId), role:'Ëá™ÂºÄÂèëÂÆ¢Êà∑ÂáÄÂà©Ê∂¶ÔºàÂêà‰Ωú‰ºô‰º¥ 50%Ôºâ', amount: amt*0.5},
        {who:'ÂÖ¨Âè∏', role:'Ëá™ÂºÄÂèëÂÆ¢Êà∑ÂáÄÂà©Ê∂¶ÔºàÂÖ¨Âè∏ 50%Ôºâ', amount: amt*0.5}
      ];
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
  if(r.type==='invite'){ parts.push(r.closed ? 'Â∑≤Êàê‰∫§' : 'Êú™Êàê‰∫§'); }
  if(r.type==='referral' && r.productName){ parts.push(r.productName); }
  if(r.type==='tattoo'){ parts.push(r.source==='self' ? 'Ëá™ÊãõÂÆ¢Êà∑' : 'ÂÖ¨Âè∏ÂÆ¢Ê∫ê'); }
  if(PARTNER_MENUS[r.type] && r.productName){ parts.push(r.productName); }
  if(r.type==='p_freckle'){ parts.push(`Â•ñÂä±ÊØî‰æã ${fmtPct(r.rate)}`); }
  if(r.note) parts.push(r.note);
  return parts.join(' ¬∑ ') || '‚Äî';
}

// ---------------- Login ----------------
async function initLogin(){
  const { data, error } = await sb.rpc('list_login_names');
  const sel = document.getElementById('loginName');
  if(error){ document.getElementById('loginError').textContent = 'ËØªÂèñ‰∫∫ÂëòÂêçÂçïÂ§±Ë¥•Ôºö'+error.message; return; }
  sel.innerHTML = (data||[]).map(p=>`<option value="${p.id}" data-email="${escapeHtml(p.email)}">${escapeHtml(p.name)}</option>`).join('');
}

document.getElementById('loginBtn').addEventListener('click', async ()=>{
  const sel = document.getElementById('loginName');
  const opt = sel.options[sel.selectedIndex];
  const pin = document.getElementById('loginPin').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if(!opt || !pin){ errEl.textContent = 'ËØ∑ÈÄâÊã©ÂßìÂêçÂπ∂ËæìÂÖ• PIN„ÄÇ'; return; }
  const email = opt.getAttribute('data-email');
  const { error } = await sb.auth.signInWithPassword({ email, password: pin });
  if(error){ errEl.textContent = 'PIN ‰∏çÂØπÔºåËØ∑ÂÜçËØï‰∏ÄÊ¨°„ÄÇ'; return; }
  await bootApp();
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  location.reload();
});

document.getElementById('changePinBtn').addEventListener('click', async ()=>{
  const newPin = prompt('ËæìÂÖ•Êñ∞ÁöÑ 6 ‰ΩçÊï∞Â≠ó PINÔºö');
  if(newPin===null) return;
  if(!/^\d{6}$/.test(newPin)){ alert('PIN ÂøÖÈ°ªÊòØ 6 ‰ΩçÊï∞Â≠ó„ÄÇ'); return; }
  const { error } = await sb.auth.updateUser({ password: newPin });
  if(error){ alert('‰øÆÊîπÂ§±Ë¥•Ôºö'+error.message); return; }
  alert('PIN ‰øÆÊîπÊàêÂäüÔºå‰∏ãÊ¨°ÁôªÂΩïËØ∑Áî®Ëøô‰∏™Êñ∞ÁöÑ PIN„ÄÇ');
});

// ---------------- Boot ----------------
async function bootApp(){
  const { data: sess } = await sb.auth.getSession();
  if(!sess.session){ return; }
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', sess.session.user.id).single();
  if(error || !profile){ document.getElementById('loginError').textContent = 'Êâæ‰∏çÂà∞‰Ω†ÁöÑËµÑÊñôÔºåËÅîÁ≥ªÁÆ°ÁêÜÂëò„ÄÇ'; return; }
  currentProfile = mapProfile(profile);

  document.getElementById('loginView').style.display = 'none';
  document.getElementById('appView').style.display = '';
  document.getElementById('userChip').textContent = `${currentProfile.name}Ôºà${roleLabel(currentProfile.role)}Ôºâ`;
  document.getElementById('pageTitle').textContent = currentProfile.role==='admin' ? 'Âõ¢ÈòüÊèêÊàêÁÆ°ÁêÜ' : (currentProfile.role==='teacher' ? 'ËÄÅÂ∏àÊâãÂ∑•Ë¥π' : 'ÊàëÁöÑÊèêÊàê');

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
  const [{data:profRows}, {data:prodRows}, {data:opRows}, {data:setRow}, {data:referralRows}] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('antiaging_products').select('*'),
    sb.from('antiaging_op_items').select('*'),
    sb.from('settings').select('*').eq('id',1).single(),
    sb.from('referral_items').select('*')
  ]);
  people = (profRows||[]).map(mapProfile);
  antiAgingProducts = (prodRows||[]).map(r=>({name:r.name, commission:r.commission, id:r.id}));
  antiagingOpItems = (opRows||[]).map(r=>({name:r.name, split:r.split, rates:r.rates||{}, id:r.id}));
  referralItems = (referralRows||[]).map(r=>({name:r.name, amount:Number(r.amount)||0, inviteFee:Number(r.invite_fee)||0, id:r.id}));
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
  const [{data:kpiRows}, {data:bonusRows}, {data:paydayRow}] = await Promise.all([
    sb.from('payroll_monthly').select('*').eq('ym', ym),
    sb.from('bonus_items').select('*').eq('ym', ym),
    sb.from('payday_settings').select('*').eq('ym', ym).maybeSingle()
  ]);
  payrollMonthly = {};
  (kpiRows||[]).forEach(r=>{ payrollMonthly[r.person_id] = { id:r.id, kpiPct: Number(r.kpi_pct)||0 }; });
  bonusItems = (bonusRows||[]).map(r=>({ id:r.id, personId:r.person_id, ym:r.ym, label:r.label, amount:Number(r.amount)||0 }));
  currentPayday = (paydayRow && paydayRow.payday_date) || null;
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
  const targetMet = targetThreshold>0 && closedInviteTotal>=targetThreshold;
  const targetBonusAmount = targetMet ? targetPool : 0;
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
    if(errEl) errEl.textContent = 'ÁîªÈù¢Âà∑Êñ∞Â§±Ë¥•Ôºö'+e.message+'ÔºàËÆ∞ÂΩïÂèØËÉΩÂ∑≤ÁªèÂ≠òËøõÂéª‰∫ÜÔºåËØ∑Âà∑Êñ∞È°µÈù¢Á°ÆËÆ§Ôºâ';
  }
}

// ---------------- Staff: new record form ----------------
function buildStaffSection(){
  const el = document.getElementById('staffSection');
  el.innerHTML = `
    <div class="panel">
      <h2>Êñ∞Â¢ûËÆ∞ÂΩï</h2>
      ${currentProfile.role==='admin' ? `<div class="field"><label for="f_owner">ËÆ∞ÂΩïÂΩíÂ±û‰∫∫ÔºàÂèØ‰ª•Â∏ÆÂõ¢ÈòüË°•ÁôªÔºâ</label><select id="f_owner"></select></div>` : ''}
      <div class="type-tabs" id="typeTabs"></div>
      <div class="field"><label for="f_date">Êó•Êúü</label><input type="date" id="f_date" /></div>

      <div data-group="source" style="display:none;">
        <div class="field"><label for="f_source">ÂÆ¢Êà∑Êù•Ê∫ê</label>
          <select id="f_source">
            <option value="self">Ëá™ÊãõÂÆ¢Êà∑ÔºàÊúçÂä°Â∏à 90% / ÂÖ¨Âè∏ 10%Ôºâ</option>
            <option value="company">ÂÖ¨Âè∏ÂÆ¢Ê∫ê / ÂπøÂëä / Êé®ËçêÔºàÊé®Ëçê‰∫∫ 30% / ÂÖ¨Âè∏ 42% / ÊäÄÊúØÊÄªÁõë 28%Ôºâ</option>
          </select>
        </div>
        <div class="field" id="directorField" style="display:none;">
          <label for="f_director">ÊäÄÊúØÊÄªÁõë / Director</label>
          <input type="text" id="f_director" placeholder="ÂßìÂêç" />
        </div>
      </div>

      <div data-group="client" style="display:none;">
        <div class="field"><label for="f_client">ÂÆ¢Êà∑ÂêçÁß∞</label><input type="text" id="f_client" placeholder="ÈÄâÂ°´" /></div>
      </div>

      <div data-group="lash_special" style="display:none;">
        <div class="field" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" id="f_lash_special" style="width:auto;" />
          <label for="f_lash_special" style="margin:0;">ÁâπÂà´ÂàÜÊàêÔºà70%Êú¨‰∫∫ / 30%ÂÖ¨Âè∏ÔºåËá™Â∑±Â°´ÈáëÈ¢ùÔºåÂ§áÊ≥®ÂÜôÊ∏ÖÊ•öÂéüÂõ†Ôºâ</label>
        </div>
      </div>

      <div data-group="closed" style="display:none;">
        <div class="field" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" id="f_closed" style="width:auto;" />
          <label for="f_closed" style="margin:0;">Â∑≤Êàê‰∫§ÔºàÊàêÂäüÈÇÄÁ∫¶Ëá≥ÊÄªÈÉ®Áî±ËÄÅÂ∏àÈù¢ËØäÊàê‰∫§Ôºâ</label>
        </div>
      </div>

      <div data-group="product" style="display:none;">
        <div class="field"><label for="f_product">ÊäóË°∞È°πÁõÆ</label><select id="f_product"></select></div>
      </div>

      <div data-group="referral" style="display:none;">
        <div class="field"><label for="f_referral">ÂºïÊµÅÊúçÂä°È°πÁõÆ</label><select id="f_referral"></select></div>
        <div class="field" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" id="f_referral_served" style="width:auto;" checked />
          <label for="f_referral_served" style="margin:0;">Êú¨Ê¨°ÊúâÊúçÂä°ÂÆ¢‰∫∫ÔºàÁÆóÊäÄÊúØÊúçÂä°Ë¥πÔºâ</label>
        </div>
        <div class="field" id="f_referral_qty_field">
          <label for="f_referral_qty">ÊúçÂä°‰∫∫Êï∞</label>
          <input type="number" id="f_referral_qty" min="1" step="1" value="1" style="max-width:100px;" />
        </div>
        <div class="field" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" id="f_referral_invite" style="width:auto;" />
          <label for="f_referral_invite" style="margin:0;">ÈÇÄÁ∫¶‰∫∫ÔºàÈÇÄÁ∫¶Ë¥πÔºâ</label>
        </div>
      </div>

      <div data-group="pmenu" style="display:none;">
        <div class="field"><label id="f_pmenu_label" for="f_pmenu">È°πÁõÆ</label><select id="f_pmenu"></select></div>
      </div>

      <div data-group="amount" style="display:none;">
        <div class="field"><label id="f_amount_label" for="f_amount">ÈáëÈ¢ù (RM)</label><input type="number" id="f_amount" min="0" step="0.01" placeholder="0.00" /></div>
      </div>

      <div data-group="prate" style="display:none;">
        <div class="field"><label for="f_prate">Â•ñÂä±ÊØî‰æã (%)</label><input type="number" id="f_prate" min="0" max="100" step="0.5" style="max-width:120px;" />
          <p class="hint" id="f_prate_hint"></p>
        </div>
      </div>

      <div class="preview-commission" id="commissionPreview"></div>

      <div class="field"><label for="f_note">Â§áÊ≥®</label><input type="text" id="f_note" placeholder="ÈÄâÂ°´" /></div>
      <div style="display:flex;gap:8px;">
        <button class="primary" id="addRecordBtn" style="width:100%;">ËÆ∞ÂΩïÂÖ•Ë¥¶</button>
        <button id="cancelEditBtn" style="display:none;white-space:nowrap;">ÂèñÊ∂àÁºñËæë</button>
      </div>
      <p class="error-text" id="addRecordError"></p>
    </div>
  `;

  document.getElementById('f_date').value = new Date().toISOString().slice(0,10);
  renderTypeTabs();
  applyFieldVisibility();
  renderProductSelect();
  renderReferralSelect();
  updateReferralQtyVisibility();

  if(currentProfile.role==='admin'){
    const ownerSel = document.getElementById('f_owner');
    const eligible = people.filter(p=>p.active && p.role!=='teacher').slice().sort((a,b)=>a.name.localeCompare(b.name));
    ownerSel.innerHTML = eligible.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    ownerSel.value = currentProfile.id;
    ownerSel.addEventListener('change', ()=>{ renderTypeTabs(); applyFieldVisibility(); renderPmenuSelect(); prefillAntiagingAmount(); updatePreview(); });
  }
  renderTypeTabs();
  applyFieldVisibility();
  renderPmenuSelect();

  document.getElementById('f_pmenu').addEventListener('change', updatePreview);
  document.getElementById('f_prate').addEventListener('input', updatePreview);
  document.getElementById('f_amount').addEventListener('input', ()=>{
    if(currentType==='p_freckle'){ prefillFreckleRate(); }
  });

  document.getElementById('f_source').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_closed').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_product').addEventListener('change', ()=>{ prefillAntiagingAmount(); updatePreview(); });
  document.getElementById('f_referral').addEventListener('change', ()=>{ prefillReferralAmount(); updatePreview(); });
  document.getElementById('f_referral_served').addEventListener('change', ()=>{ updateReferralQtyVisibility(); prefillReferralAmount(); updatePreview(); });
  document.getElementById('f_referral_qty').addEventListener('input', ()=>{ prefillReferralAmount(); updatePreview(); });
  document.getElementById('f_referral_invite').addEventListener('change', ()=>{ prefillReferralAmount(); updatePreview(); });
  document.getElementById('f_lash_special').addEventListener('change', ()=>{ applyFieldVisibility(); updatePreview(); });
  document.getElementById('f_amount').addEventListener('input', updatePreview);
  document.getElementById('addRecordBtn').addEventListener('click', submitRecord);
  document.getElementById('cancelEditBtn').addEventListener('click', ()=>{
    exitEditMode();
    document.getElementById('f_client').value='';
    document.getElementById('f_amount').value='';
    document.getElementById('f_note').value='';
    document.getElementById('f_closed').checked=false;
    document.getElementById('f_referral_served').checked=true;
    document.getElementById('f_referral_qty').value='1';
    document.getElementById('f_referral_invite').checked=false;
    updateReferralQtyVisibility();
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
  document.getElementById('addRecordBtn').textContent = 'ËÆ∞ÂΩïÂÖ•Ë¥¶';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

// Partners (see PARTNER_NAMES) get the partner program types plus ÂÖ∂‰ªñ; everyone else keeps the usual types.
function visibleTypeKeys(){
  const partner = isPartner(currentOwnerId());
  if(partner) return [...PARTNER_TYPE_KEYS, 'other'];
  return Object.keys(TYPES).filter(k=>k!=='teacher_service' && !TYPES[k].partner);
}

function renderTypeTabs(){
  const wrap = document.getElementById('typeTabs');
  const keys = visibleTypeKeys();
  if(!keys.includes(currentType) && !editingRecordId){ currentType = keys[0]; }
  wrap.innerHTML = keys.map(k=>
    `<button type="button" data-type="${k}" class="${k===currentType?'active':''}">${TYPES[k].label}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentType = btn.getAttribute('data-type');
      renderTypeTabs(); applyFieldVisibility();
      if(currentType==='antiaging'){ prefillAntiagingAmount(); }
      if(currentType==='referral'){ prefillReferralAmount(); }
      renderPmenuSelect();
      if(currentType==='p_freckle'){ prefillFreckleRate(); }
      updatePreview();
    });
  });
}

function renderPmenuSelect(){
  const sel = document.getElementById('f_pmenu');
  if(!sel) return;
  const items = PARTNER_MENUS[currentType] || [];
  const prev = sel.value;
  sel.innerHTML = items.map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}ÔºàRM${i.fee}Ôºâ</option>`).join('');
  if(items.some(i=>i.name===prev)) sel.value = prev;
  document.getElementById('f_pmenu_label').textContent =
    currentType==='p_lash' ? 'ÁæéÁù´ÊúçÂä°È°πÁõÆ' : currentType==='p_facial' ? 'ÁæéÂÆπÊúçÂä°È°πÁõÆ' : currentType==='p_franchise' ? 'Âä†ÁõüÈÖçÂ•ó' : 'È°πÁõÆ';
}

function prefillFreckleRate(){
  const rate = freckleTierRate(document.getElementById('f_amount').value);
  const hint = document.getElementById('f_prate_hint');
  if(rate===null){
    document.getElementById('f_prate').value = '';
    hint.textContent = 'ÈáëÈ¢ù‰∏çÂú® RM10,000‚ÄìRM150,000 ‰πãÈó¥ÔºåÊàñÂ§ö‰∫∫ÈÇÄÁ∫¶/ÂÖ±ÂêåÊàê‰∫§Êó∂ÔºåÊØî‰æãÈúÄÂÖ¨Âè∏‰π¶Èù¢Á°ÆËÆ§ÂêéÊâãÂä®Â°´ÂÜô„ÄÇ';
  } else {
    document.getElementById('f_prate').value = rate;
    hint.textContent = 'RM10,000‚Äì50,000Ôºö5%„ÄÄ|„ÄÄ50,000 ‰ª•‰∏ä‚Äì80,000Ôºö8%„ÄÄ|„ÄÄ80,000 ‰ª•‰∏ä‚Äì150,000Ôºö10%ÔºàÂÖ®È¢ùÊåâÂêå‰∏ÄÊØî‰æãÔºâ';
  }
  updatePreview();
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

function updateReferralQtyVisibility(){
  const served = document.getElementById('f_referral_served').checked;
  document.getElementById('f_referral_qty_field').style.display = served ? '' : 'none';
}

function referralAmountBreakdown(){
  const name = document.getElementById('f_referral').value;
  const item = referralItems.find(i=>i.name===name);
  const served = document.getElementById('f_referral_served').checked;
  const qty = Math.max(1, Number(document.getElementById('f_referral_qty').value)||1);
  const invite = document.getElementById('f_referral_invite').checked;
  const perPerson = (item && item.amount) || 0;
  const inviteFee = (item && item.inviteFee) || 0;
  const serviceFee = served ? perPerson * qty : 0;
  const inviteAmount = invite ? inviteFee : 0;
  return { itemName: name, served, qty, invite, serviceFee, inviteAmount, total: serviceFee + inviteAmount };
}

function prefillReferralAmount(){
  const { total } = referralAmountBreakdown();
  document.getElementById('f_amount').value = total || '';
}

function applyFieldVisibility(){
  const cfg = TYPES[currentType];
  const allGroups = ['source','client','closed','product','referral','lash_special','amount','pmenu','prate'];
  const lashSpecialOn = currentType==='lash' && document.getElementById('f_lash_special').checked;
  allGroups.forEach(g=>{
    const el = document.querySelector(`[data-group="${g}"]`);
    if(!el) return;
    let show = cfg.groups.includes(g);
    if(currentType==='invite' && g==='amount'){ show = document.getElementById('f_closed').checked; }
    if(g==='lash_special'){ show = currentType==='lash'; }
    if(currentType==='lash' && g==='amount'){ show = lashSpecialOn; }
    el.style.display = show ? '' : 'none';
  });
  document.getElementById('directorField').style.display = (currentType==='tattoo' && document.getElementById('f_source').value==='company') ? '' : 'none';

  const amountInput = document.getElementById('f_amount');
  const label = document.getElementById('f_amount_label');
  amountInput.readOnly = (currentType==='referral');
  if(currentType==='antiaging'){
    label.textContent = 'Êú¨Ê¨°ÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='referral'){
    label.textContent = 'ÂêàËÆ°ÈáëÈ¢ù (RMÔºåÂõ∫ÂÆöÈáëÈ¢ùÔºåËá™Âä®Â∏¶Âá∫)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='lash' && lashSpecialOn){
    label.textContent = 'Êìç‰ΩúË¥π (RMÔºå70/30ÂàÜ)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='other'){
    label.textContent = 'ÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='care'){
    label.textContent = 'ËÆ¢ÂçïÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='tattoo'){
    label.textContent = 'ÊúçÂä°ÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='invite'){
    label.textContent = 'Êú¨Ê¨°Èù¢ËØäÊàê‰∫§‰∏öÁª© (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='p_product'){
    label.textContent = '‰∫ßÂìÅÂÆûÈôÖÊî∂Ê¨æÈáëÈ¢ù (RMÔºåÊäòÂêéÂÆûÊî∂)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='p_topup'){
    label.textContent = 'ÂÆûÈôÖÂÖÖÂÄºÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='p_freckle'){
    label.textContent = 'È°πÁõÆÂÆûÈôÖÊàê‰∫§ÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else if(currentType==='p_profit'){
    label.textContent = 'ÂèØÂàÜÈÖçÂáÄÂà©Ê∂¶ (RMÔºåÂÆûÊî∂Êâ£Èô§‰∫ãÂÖàÁ°ÆËÆ§ÁöÑÁõ¥Êé•ÊàêÊú¨)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  } else {
    label.textContent = 'ÈáëÈ¢ù (RM)'; amountInput.min=0; amountInput.removeAttribute('max'); amountInput.step=0.01;
  }
}

function renderProductSelect(){
  const sel = document.getElementById('f_product');
  const opOpts = antiagingOpItems.map(i=>`<option value="${ANTIAGING_OPFEE_VALUE_PREFIX}${escapeHtml(i.name)}">${escapeHtml(i.name)}ÔºàÊìç‰ΩúË¥πÔºâ</option>`).join('');
  const productOpts = antiAgingProducts.map(p=>`<option value="${ANTIAGING_PRODUCT_VALUE_PREFIX}${escapeHtml(p.name)}">${escapeHtml(p.name)}ÔºàRM${p.commission} ÊèêÊàêÔºâ</option>`).join('');
  sel.innerHTML = opOpts + productOpts || '<option value="">ÂÖàËØ∑ÁÆ°ÁêÜÂëòÊ∑ªÂä†ÊäóË°∞È°πÁõÆ</option>';
}

function renderReferralSelect(){
  const sel = document.getElementById('f_referral');
  sel.innerHTML = referralItems.map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}</option>`).join('')
    || '<option value="">ÂÖàËØ∑ÁÆ°ÁêÜÂëòÊ∑ªÂä†ÂºïÊµÅÊúçÂä°È°πÁõÆ</option>';
}

function updatePreview(){
  const box = document.getElementById('commissionPreview');
  const amt = Number(document.getElementById('f_amount').value)||0;
  let lines = [];
  if(currentType==='invite'){
    lines.push({label:'ÈÇÄÁ∫¶Ë¥πÔºà‰∏çËÆ∫ÊòØÂê¶Êàê‰∫§Ôºâ', val:20});
    if(document.getElementById('f_closed').checked){
      const ownerId = currentOwnerId();
      const ym = document.getElementById('monthPicker').value;
      const existing = records.filter(r=>r.type==='invite' && r.closed && r.personId===ownerId && r.date.slice(0,7)===ym)
        .reduce((s,r)=>s+(Number(r.amount)||0),0);
      const tRate = tierRate(existing+amt, PERSONAL_AD_TIERS);
      lines.push({label:`Èù¢ËØäÊàê‰∫§ÊèêÊàê ${fmtPct(tRate*100)}ÔºàÊåâÊú¨‰∫∫ÂΩìÊúàÁ¥ØËÆ°‰∏öÁª©Èò∂Ê¢ØÔºâ`, val: amt*tRate});
    }
  } else if(currentType==='lash' && document.getElementById('f_lash_special').checked){
    lines.push({label:'ÁâπÂà´ÂàÜÊàêÔºàÊú¨‰∫∫ 70%Ôºâ', val: amt*0.7});
    lines.push({label:'ÁâπÂà´ÂàÜÊàêÔºàÂÖ¨Âè∏ 30%Ôºâ', val: amt*0.3});
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
        lines.push({label:`${itemName}ÔºàÂØπÂçäÔºåÊú¨‰∫∫Ôºâ`, val: amt/2});
        lines.push({label:`${itemName}ÔºàÂØπÂçäÔºåÂÖ¨Âè∏Ôºâ`, val: amt/2});
      } else {
        lines.push({label:`${itemName} Êìç‰ΩúË¥π`, val: amt});
      }
    } else {
      const productName = val.startsWith(ANTIAGING_PRODUCT_VALUE_PREFIX) ? val.slice(ANTIAGING_PRODUCT_VALUE_PREFIX.length) : val;
      lines.push({label: productName?`${productName} ÊèêÊàê`:'ÊäóË°∞ÊèêÊàê', val: amt});
    }
  } else if(currentType==='referral'){
    const b = referralAmountBreakdown();
    if(b.served) lines.push({label: `${b.itemName||'ÂºïÊµÅ'} ÊäÄÊúØÊúçÂä°Ë¥π${b.qty>1?`√ó${b.qty}‰∫∫`:''}`, val: b.serviceFee});
    if(b.invite) lines.push({label: `${b.itemName||'ÂºïÊµÅ'} ÈÇÄÁ∫¶Ë¥π`, val: b.inviteAmount});
    if(!b.served && !b.invite) lines.push({label:'ËØ∑ÂãæÈÄâÊúçÂä°ÂÆ¢‰∫∫ÊàñÈÇÄÁ∫¶‰∫∫ÂÖ∂‰∏≠‰∏ÄÈ°π', val:0});
  } else if(currentType==='other'){
    lines.push({label:'ÂÖ∂‰ªñÈ°πÁõÆÈáëÈ¢ùÔºàÂ§áÊ≥®ÂÜôÊ∏ÖÊ•öÔºåÊñπ‰æøÁÆ°ÁêÜÂëòÂ§ÑÁêÜÔºâ', val: amt});
  } else if(currentType==='care'){
    const eligible = amt>=1000;
    lines.push({label: eligible?'Êàê‰∫§Ë¥π 5%':'Êú™Êª° RM1000Ôºå‰∏çËÆ°ÊèêÊàê', val: eligible?amt*0.05:0});
  } else if(currentType==='review'){
    lines.push({label:'ÁÇπËØÑÂ•ñÂä±ÔºàÂêéÂè∞ËÆæÂÆöÈáëÈ¢ùÔºâ', val: settings.reviewDefaultAmount});
  } else if(currentType==='tattoo'){
    const src = document.getElementById('f_source').value;
    if(src==='self'){
      lines.push({label:'ÊúçÂä°Â∏à 90%', val: amt*0.9});
      lines.push({label:'ÂÖ¨Âè∏ÊäΩÊàê 10%', val: amt*0.1});
    } else {
      lines.push({label:'Êé®Ëçê‰∫∫ 30%', val: amt*0.3});
      lines.push({label:'ÂÖ¨Âè∏ÊäΩÊàê 42%', val: amt*0.42});
      lines.push({label:'ÊäÄÊúØÊÄªÁõë 28%', val: amt*0.28});
    }
  } else if(PARTNER_MENUS[currentType]){
    const item = document.getElementById('f_pmenu').value;
    lines.push({label:`${TYPES[currentType].label}Ôºö${item||'ËØ∑ÈÄâÊã©È°πÁõÆ'}`, val: partnerMenuFee(currentType, item)});
  } else if(currentType==='p_product'){
    lines.push({label:'ÈîÄÂîÆÊèêÊàê 15%', val: amt*0.15});
  } else if(currentType==='p_topup'){
    lines.push({label:'ÂÖÖÂÄºÊàê‰∫§ÊèêÊàê 5%', val: amt*0.05});
  } else if(currentType==='p_freckle'){
    const rate = Number(document.getElementById('f_prate').value)||0;
    lines.push({label:`ÈÇÄÁ∫¶Â•ñÂä± ${fmtPct(rate)}`, val: amt*rate/100});
  } else if(currentType==='p_profit'){
    lines.push({label:'Âêà‰Ωú‰ºô‰º¥ 50%', val: amt*0.5});
    lines.push({label:'ÂÖ¨Âè∏ 50%', val: amt*0.5});
  }
  box.innerHTML = lines.map(l=>`<div class="row"><span>${l.label}</span><span class="num">${fmt(l.val)}</span></div>`).join('');
}

async function submitRecord(){
  const errEl = document.getElementById('addRecordError');
  errEl.textContent = '';
  const date = document.getElementById('f_date').value;
  const client = document.getElementById('f_client').value.trim();
  const note = document.getElementById('f_note').value.trim();
  if(!date){ errEl.textContent = 'ËØ∑Â°´ÂÜôÊó•Êúü„ÄÇ'; return; }

  const ownerId = currentOwnerId();
  const rec = { type:currentType, date, client, note };
  if(!editingRecordId){ rec.status = 'pending'; rec.created_by = currentProfile.id; }

  if(currentType==='invite'){
    rec.person_id = ownerId;
    rec.closed = document.getElementById('f_closed').checked;
    rec.amount = rec.closed ? (Number(document.getElementById('f_amount').value)||0) : 0;
    if(rec.closed && !rec.amount){ errEl.textContent = 'Â∑≤ÂãæÈÄâ„ÄåÂ∑≤Êàê‰∫§„ÄçÔºåËØ∑Â°´ÂÜôÈù¢ËØäÊàê‰∫§‰∏öÁª©ÈáëÈ¢ù„ÄÇ'; return; }
  } else if(currentType==='lash' && document.getElementById('f_lash_special').checked){
    rec.person_id = ownerId;
    rec.rate = 70;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÊìç‰ΩúË¥πÈáëÈ¢ù„ÄÇ'; return; }
    if(!rec.note){ errEl.textContent = 'ÁâπÂà´ÂàÜÊàêÈúÄË¶ÅÂú®Â§áÊ≥®ÂÜôÊ∏ÖÊ•öÂéüÂõ†„ÄÇ'; return; }
  } else if(OP_TYPE_KEYS.includes(currentType)){
    rec.person_id = ownerId;
  } else if(currentType==='antiaging'){
    rec.person_id = ownerId;
    rec.product_name = document.getElementById('f_product').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.product_name || !rec.amount){ errEl.textContent = 'ËØ∑ÈÄâÊã©ÊäóË°∞È°πÁõÆÂπ∂Â°´ÂÜôÈáëÈ¢ù„ÄÇ'; return; }
  } else if(currentType==='referral'){
    rec.person_id = ownerId;
    rec.product_name = document.getElementById('f_referral').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.product_name){ errEl.textContent = 'ËØ∑ÈÄâÊã©ÂºïÊµÅÊúçÂä°È°πÁõÆ„ÄÇ'; return; }
    if(!rec.amount){ errEl.textContent = 'ÈáëÈ¢ùÊòØ0ÔºåËØ∑ÂãæÈÄâ„ÄåÊúçÂä°ÂÆ¢‰∫∫„ÄçÊàñ„ÄåÈÇÄÁ∫¶‰∫∫„ÄçÂÖ∂‰∏≠‰∏ÄÈ°π„ÄÇ'; return; }
  } else if(currentType==='other'){
    rec.person_id = ownerId;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.note){ errEl.textContent = 'ËØ∑Âú®Â§áÊ≥®ÂÜôÊ∏ÖÊ•öËøôÊòØ‰ªÄ‰πàÈ°πÁõÆÔºåÊñπ‰æøÁÆ°ÁêÜÂëòÂ§ÑÁêÜ„ÄÇ'; return; }
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÈáëÈ¢ù„ÄÇ'; return; }
  } else if(currentType==='care'){
    rec.person_id = ownerId;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôËÆ¢ÂçïÈáëÈ¢ù„ÄÇ'; return; }
  } else if(currentType==='review'){
    rec.person_id = ownerId;
    rec.amount = settings.reviewDefaultAmount;
  } else if(currentType==='tattoo'){
    rec.source = document.getElementById('f_source').value;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÊúçÂä°ÈáëÈ¢ù„ÄÇ'; return; }
    if(rec.source==='self'){ rec.provider_id = ownerId; }
    else { rec.referrer_id = ownerId; rec.director = document.getElementById('f_director').value.trim(); }
  } else if(PARTNER_MENUS[currentType]){
    rec.person_id = ownerId;
    rec.product_name = document.getElementById('f_pmenu').value;
    rec.amount = partnerMenuFee(currentType, rec.product_name);
    if(!rec.product_name || !rec.amount){ errEl.textContent = 'ËØ∑ÈÄâÊã©È°πÁõÆ„ÄÇ'; return; }
  } else if(['p_product','p_topup','p_profit'].includes(currentType)){
    rec.person_id = ownerId;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÈáëÈ¢ù„ÄÇ'; return; }
  } else if(currentType==='p_freckle'){
    rec.person_id = ownerId;
    rec.amount = Number(document.getElementById('f_amount').value)||0;
    rec.rate = Number(document.getElementById('f_prate').value)||0;
    if(!rec.amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÈ°πÁõÆÂÆûÈôÖÊàê‰∫§ÈáëÈ¢ù„ÄÇ'; return; }
    if(!rec.rate){ errEl.textContent = 'ËØ∑Â°´ÂÜôÂ•ñÂä±ÊØî‰æãÔºàË∂ÖÂá∫ RM10,000‚Äì150,000 Êó∂ÈúÄÂÖ¨Âè∏Á°ÆËÆ§Ôºâ„ÄÇ'; return; }
  }

  let error;
  if(editingRecordId){
    ({ error } = await sb.from('records').update(rec).eq('id', editingRecordId));
  } else {
    ({ error } = await sb.from('records').insert(rec));
  }
  if(error){ errEl.textContent = '‰øùÂ≠òÂ§±Ë¥•Ôºö'+error.message; return; }

  const wasEditing = !!editingRecordId;
  exitEditMode();

  document.getElementById('f_client').value='';
  document.getElementById('f_amount').value='';
  document.getElementById('f_note').value='';
  document.getElementById('f_closed').checked=false;
  document.getElementById('f_referral_served').checked=true;
  document.getElementById('f_referral_qty').value='1';
  document.getElementById('f_referral_invite').checked=false;
  updateReferralQtyVisibility();
  if(wasEditing && document.getElementById('f_owner')){ document.getElementById('f_owner').value = currentProfile.id; }
  const ym = date.slice(0,7);
  if(document.getElementById('monthPicker').value!==ym){ document.getElementById('monthPicker').value=ym; }
  await renderAll();
}

function startEditRecord(rec){
  // Set the owner first: the visible type tabs depend on whether the owner is a partner.
  if(document.getElementById('f_owner')){
    document.getElementById('f_owner').value = recordPrimaryPersonId(rec) || currentProfile.id;
  }
  currentType = rec.type;
  document.getElementById('f_lash_special').checked = !!(rec.type==='lash' && Number(rec.rate)===70);
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
  } else if(rec.type==='lash' && Number(rec.rate)===70){
    document.getElementById('f_lash_special').checked = true;
    applyFieldVisibility();
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='antiaging'){
    renderProductSelect();
    document.getElementById('f_product').value = rec.productName || '';
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='referral'){
    renderReferralSelect();
    document.getElementById('f_referral').value = rec.productName || '';
    document.getElementById('f_referral_served').checked = true;
    document.getElementById('f_referral_qty').value = '1';
    document.getElementById('f_referral_invite').checked = false;
    updateReferralQtyVisibility();
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='other'){
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='care'){
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='tattoo'){
    document.getElementById('f_source').value = rec.source || 'self';
    applyFieldVisibility();
    if(rec.source==='company'){ document.getElementById('f_director').value = rec.director || ''; }
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(PARTNER_MENUS[rec.type]){
    renderPmenuSelect();
    document.getElementById('f_pmenu').value = rec.productName || '';
  } else if(['p_product','p_topup','p_profit'].includes(rec.type)){
    document.getElementById('f_amount').value = rec.amount || '';
  } else if(rec.type==='p_freckle'){
    document.getElementById('f_amount').value = rec.amount || '';
    document.getElementById('f_prate').value = rec.rate || '';
  }

  editingRecordId = rec.id;
  document.getElementById('addRecordBtn').textContent = 'Êõ¥Êñ∞ËÆ∞ÂΩï';
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
      <h2>Êñ∞Â¢ûÊâãÂ∑•Ë¥πËÆ∞ÂΩï</h2>
      <div class="field"><label for="t_date">Êó•Êúü</label><input type="date" id="t_date" /></div>
      <div class="field"><label for="t_category">È°πÁõÆÁ±ªÂà´</label><select id="t_category"></select></div>
      <div class="field"><label for="t_item">ÂÖ∑‰ΩìÈÉ®‰Ωç / È°πÁõÆ</label><select id="t_item"></select></div>
      <div class="field" id="t_qty_field" style="display:none;">
        <label for="t_qty" id="t_qty_label">Êï∞Èáè</label>
        <input type="number" id="t_qty" min="1" step="1" value="1" />
      </div>
      <div class="field"><label for="t_client">ÂÆ¢Êà∑ÂêçÁß∞</label><input type="text" id="t_client" placeholder="ÈÄâÂ°´" /></div>
      <div class="field">
        <label for="t_discount">ÁªôÈ°æÂÆ¢ÁöÑÊäòÊâ£ÔºàÈÄâÂ°´Ôºâ</label>
        <div style="display:flex;gap:8px;">
          <select id="t_discount_type" style="max-width:130px;">
            <option value="pct">ÁôæÂàÜÊØî %</option>
            <option value="rm">ÈáëÈ¢ù RM</option>
          </select>
          <input type="number" id="t_discount" min="0" step="0.01" placeholder="0" />
        </div>
        <p class="hint" id="t_discount_hint">‰æãÂ¶ÇÊâì9ÊäòÔºåÈÄâ„ÄåÁôæÂàÜÊØî„ÄçÂ°´ 10Ôºà‰ª£Ë°®ËÆ©‰∫Ü10%ÔºâÔºõÂ¶ÇÊûúÊòØÁõ¥Êé•ÂáèÂÖç‰∏Ä‰∏™ÈáëÈ¢ùÔºåÈÄâ„ÄåÈáëÈ¢ù RM„ÄçÂ°´Ë¶ÅÊâ£ÊéâÁöÑÊï∞ÁõÆ„ÄÇÊâãÂ∑•Ë¥π‰ºöË∑üÁùÄÊâ£ÔºåÊ≤°ÊúâÊäòÊâ£Â∞±ÁïôÁ©∫ÊàñÂ°´0„ÄÇ</p>
      </div>
      <div class="preview-commission" id="teacherCommissionPreview"></div>
      <div class="field"><label for="t_note">Â§áÊ≥®</label><input type="text" id="t_note" placeholder="ÈÄâÂ°´" /></div>
      <button class="primary" id="addTeacherRecordBtn">ËÆ∞ÂΩïÂÖ•Ë¥¶</button>
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
  sel.innerHTML = (cat?cat.items:[]).map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}ÔºàRM${i.fee}${i.perUnit?'/'+(i.unitLabel||'ÊîØ'):''}Ôºâ</option>`).join('');
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
  else{ document.getElementById('t_qty_label').textContent = `${found.item.unitLabel||'ÊîØ'}Êï∞`; }
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
    const discountLabel = dType==='rm' ? `ÊäòÊâ£ -RM${dValue}` : `ÊäòÊâ£ ${dValue}%`;
    box.innerHTML = `<div class="row"><span>Âéü‰ª∑ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(baseAmount)}</span></div>
      <div class="row"><span>${discountLabel}</span><span class="num">-${fmt(discountAmount)}</span></div>
      <div class="row"><span>ÂÆûÊî∂ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(finalFee)}</span></div>`;
  } else {
    box.innerHTML = `<div class="row"><span>ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(baseAmount)}</span></div>`;
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
  if(!date){ errEl.textContent = 'ËØ∑Â°´ÂÜôÊó•Êúü„ÄÇ'; return; }
  const found = teacherFindItem(catKey, itemName);
  if(!found){ errEl.textContent = 'ËØ∑ÈÄâÊã©È°πÁõÆÁ±ªÂà´ÂíåÂÖ∑‰ΩìÈÉ®‰Ωç„ÄÇ'; return; }

  const baseAmount = found.item.fee * qty;
  const discountAmount = teacherDiscountAmount(baseAmount, dType, dValue);
  const finalFee = Math.round((baseAmount - discountAmount) * 100) / 100;
  const rec = {
    type:'teacher_service', date, client, note, status:'pending',
    created_by: currentProfile.id, person_id: currentProfile.id,
    product_name: `${catKey}::${itemName}::${dType}::${dValue}::${qty}`, amount: finalFee
  };

  const { error } = await sb.from('records').insert(rec);
  if(error){ errEl.textContent = '‰øùÂ≠òÂ§±Ë¥•Ôºö'+error.message; return; }

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
      <td>${escapeHtml(r.client||'‚Äî')}</td>
      <td>${escapeHtml(r.note||'‚Äî')}</td>
      <td class="num" style="font-weight:600;">${fmt(amt)}</td>
      <td><span class="pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
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
    <h2>ÊàëÊú¨ÊúàÁöÑËÆ∞ÂΩï</h2>
    <div class="summary-strip"><div class="stat total"><p class="label">Êú¨ÊúàÂêàËÆ°</p><p class="value num">${fmt(total)}</p></div></div>
    <div class="table-scroll">
      <table><thead><tr><th>Êó•Êúü</th><th>È°πÁõÆ</th><th>ÂÆ¢Êà∑</th><th>ÊäòÊâ£/Â§áÊ≥®</th><th class="num">ÈáëÈ¢ù</th><th>Áä∂ÊÄÅ</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Êú¨ÊúàËøòÊ≤°ÊúâËÆ∞ÂΩï</td></tr>'}</tbody></table>
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
      <td>${escapeHtml(r.client||'‚Äî')}</td>
      <td>${escapeHtml(recordDetailText(r))}</td>
      <td class="num" style="font-weight:600;">${fmt(sum)}</td>
      <td><span class="pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
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
    <h2>ÊàëÊú¨ÊúàÁöÑËÆ∞ÂΩï</h2>
    <div class="summary-strip"><div class="stat total"><p class="label">Êú¨ÊúàÂêàËÆ°</p><p class="value num">${fmt(total)}</p></div></div>
    <div class="table-scroll">
      <table><thead><tr><th>Êó•Êúü</th><th>Á±ªÂûã</th><th>ÂÆ¢Êà∑</th><th>È°πÁõÆ / Â§áÊ≥®</th><th class="num">ÈáëÈ¢ù</th><th>Áä∂ÊÄÅ</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Êú¨ÊúàËøòÊ≤°ÊúâËÆ∞ÂΩï</td></tr>'}</tbody></table>
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
  const sectionLabel = text => `<p style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);font-weight:600;margin:0 0 10px;padding-left:10px;border-left:3px solid var(--accent);">${text}</p>`;
  const plainCard = rows => `<div style="background:var(--paper-raised);border:1px solid var(--line);border-radius:10px;padding:4px 14px;margin-bottom:24px;">${rows}</div>`;
  const row = (label, val) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);gap:12px;"><span style="font-size:13px;">${label}</span><span class="num" style="font-weight:600;">${fmt(val)}</span></div>`;
  const rowNoBorder = (label, val) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;gap:12px;"><span style="font-size:13px;">${label}</span><span class="num" style="font-weight:600;">${fmt(val)}</span></div>`;
  const bonusRowsList = report.bonusItems.length
    ? report.bonusItems.map((b,i)=> i<report.bonusItems.length-1 ? row(escapeHtml(b.label||'Bonus'), b.amount) : rowNoBorder(escapeHtml(b.label||'Bonus'), b.amount)).join('')
    : `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;gap:12px;"><span style="font-size:13px;">Êú¨ÊúàËøòÊ≤°ÊúâBonusÈ°πÁõÆ</span><span class="num" style="font-weight:600;">‚Äî</span></div>`;

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
      <h2 style="margin:0;">Êú¨ÊúàÂ∑•ËµÑÊä•Âëä</h2>
      ${currentPayday ? `<span class="pill paid">ÂèëËñ™Êó•Êúü ${currentPayday}</span>` : ''}
    </div>

    ${sectionLabel('Âõ∫ÂÆöÈ°πÁõÆ')}
    ${plainCard(row('Â∫ïËñ™', report.person.baseSalary) + rowNoBorder('Ê¥•Ë¥¥', report.person.allowance))}

    ${sectionLabel('Áª©Êïà‰∏éÊèêÊàê')}
    ${plainCard(
      row(`KPIÂ•ñÈáëÔºàËææÊ†áÁéá ${report.kpiPct}%Ôºâ`, report.kpiAmount) +
      row('‰∏™‰∫∫ÊèêÊàêÂêàËÆ°Ôºàsales + ÊâãÂ∑•ÊúçÂä° + ÂÖ∂‰ªñÔºâ', report.personalSales + report.handsOn) +
      row(`ËææÊ†ábonusÔºàÈÇÄÁ∫¶‰∏öÁª© ${fmt(report.closedInviteTotal)} / ${fmt(report.targetThreshold)}Ôºâ`, report.targetBonusAmount) +
      rowNoBorder('Group Sales Bonus ÂêàËÆ°', report.bonusTotal)
    )}

    <div class="summary-strip" style="margin-bottom:20px;"><div class="stat total"><p class="label">Êú¨ÊúàÂêàËÆ°</p><p class="value num">${fmt(report.total)}</p></div></div>

    ${report.kpiGap>0 || report.targetBonusGap>0 ? `<div style="border-left:3px solid var(--warning);background:var(--warning-soft);border-radius:0 10px 10px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="font-size:12px;color:var(--warning);font-weight:600;margin:0 0 6px;">‚ö†Ô∏è ËøòÂ∑Æ‰∏ÄÁÇπÂ∞±ËÉΩÊãøÊª°</p>
      ${report.kpiGap>0 ? `<p style="font-size:13px;color:var(--warning);margin:0 0 4px;">KPIËøòÂ∑Æ <b class="num">${fmt(report.kpiGap)}</b> Â∞±ËÉΩÊãøÊª°Ê°£ÔºàËææÂà∞95%‰ª•‰∏äÔºâ</p>` : ''}
      ${report.targetBonusGap>0 ? `<p style="font-size:13px;color:var(--warning);margin:0;">ÈÇÄÁ∫¶‰∏öÁª©ËøòÂ∑Æ <b class="num">${fmt(report.targetThreshold-report.closedInviteTotal)}</b> ËææÊ†áÔºåÂ∞±ËÉΩÊãøÂà∞ ${fmt(report.targetPool)} ÁöÑËææÊ†ábonusÔºàÁõÆÂâçÊú™ËææÊ†áÔºåÊ≤°ÊúâËøôÁ¨îÔºâ</p>` : ''}
    </div>` : ''}

    ${sectionLabel('Group Sales Bonus ÊòéÁªÜ')}
    ${plainCard(bonusRowsList)}
  `;
}

// ---------------- Admin ----------------
function buildAdminSection(){
  const el = document.getElementById('adminSection');
  el.innerHTML = `
    <div class="panel">
      <h2>Êú¨ÊúàÂõ¢ÈòüÊ±áÊÄª</h2>
      <div class="summary-strip" id="adminSummaryStrip"></div>
    </div>
    <div class="panel">
      <h2>Âõ¢Èòü‰∫∫Âëò</h2>
      <div class="roster-chips" id="rosterChips"></div>
      <div class="add-row">
        <input type="text" id="newPersonName" placeholder="ÂßìÂêç" />
        <input type="text" id="newPersonPin" placeholder="ÂàùÂßãPINÔºà6‰ΩçÊï∞Â≠óÔºâ" maxlength="6" />
        <select id="newPersonRole"><option value="staff">ÂëòÂ∑•</option><option value="teacher">ÊäÄÊúØËÄÅÂ∏à</option><option value="admin">ÁÆ°ÁêÜÂëò</option></select>
        <button id="addPersonBtn">Ê∑ªÂä†‰∫∫Âëò</button>
      </div>
      <p class="hint">Êñ∞‰∫∫Á¨¨‰∏ÄÊ¨°ÁôªÂΩïÁî®Ëøô‰∏™ÂàùÂßãPINÔºå‰πãÂêéÂèØ‰ª•Ëá™Â∑±Êîπ„ÄÇ</p>
      <p class="error-text" id="addPersonError"></p>
    </div>
    <div class="panel">
      <h2>Ëñ™ËµÑËÆæÁΩÆÔºàÂ∫ïËñ™ / Ê¥•Ë¥¥ / KPI ‰∏âÊ°£Ôºâ</h2>
      <div class="field" style="max-width:220px;">
        <label for="paydayInput">Êú¨ÊúàÂèëËñ™Êó•Êúü</label>
        <input type="date" id="paydayInput" />
      </div>
      <p class="hint" style="margin:0 0 10px;">„ÄåÊú¨ÊúàËææÊ†áÁéá%„ÄçÊòØÊØè‰∏™Êúà‰Ω†Ëá™Â∑±ÊâìÂàÜËæìÂÖ•ÁöÑÔºåÁ≥ªÁªü‰ºöÁÖß‰∏ãÈù¢‰∏âÊ°£ÈáëÈ¢ùËá™Âä®Êç¢ÁÆóÊàêKPIÂ•ñÈáë„ÄÇ</p>
      <div class="table-scroll"><table>
        <thead><tr><th>ÂßìÂêç</th><th class="num">Â∫ïËñ™</th><th class="num">Ê¥•Ë¥¥</th><th class="num">KPI ‚â•95%</th><th class="num">KPI 80-94%</th><th class="num">KPI 70-79%</th><th class="num">Êú¨ÊúàËææÊ†áÁéá%</th><th class="num">ËææÊ†ábonusÂ∞ÅÈ°∂</th><th class="num">ËææÊ†á‰∏öÁª©Èó®Êßõ</th></tr></thead>
        <tbody id="payrollSettingsBody"></tbody>
      </table></div>
      <p class="hint" style="margin-top:8px;">„ÄåËææÊ†ábonus„ÄçÊòØÁúãËøô‰∏™‰∫∫ÂΩìÊúàÈÇÄÁ∫¶Â∑≤Êàê‰∫§‰∏öÁª©ÔºöËææÂà∞„ÄåËææÊ†á‰∏öÁª©Èó®Êßõ„ÄçÊâçÂèëÊï¥Á¨î„ÄåËææÊ†ábonusÂ∞ÅÈ°∂„ÄçÁöÑÈáëÈ¢ùÔºåÊ≤°ËææÂà∞Â∞±ÊòØ RM0ÔºåÁ≥ªÁªüËá™Âä®Âà§Êñ≠Ôºå‰∏çÁî®ÊâãÂä®ËæìÂÖ•„ÄÇ</p>
    </div>
    <div class="panel">
      <h2>Group Sales Bonus ÁÆ°ÁêÜ</h2>
      <p class="hint" style="margin:0 0 10px;">‰∏ìÂú∫‰∏öÁª©Ëøô‰∫õÊâãÂä®Âä†ËøõÊù•ÔºåÂëòÂ∑•Ëá™Â∑±‰ºöÂú®„ÄåÊú¨ÊúàÂ∑•ËµÑÊä•Âëä„ÄçÁúãÂà∞Ëøô‰∏™ÊòéÁªÜ„ÄÇ</p>
      <div class="add-row">
        <select id="bonusPerson"></select>
        <input type="text" id="bonusLabel" placeholder="È°πÁõÆÂêçÁß∞Ôºå‰æãÔºö8ÊúàÁ•õÊñë‰∏ìÂú∫" style="width:220px;" />
        <input type="number" id="bonusAmount" placeholder="ÈáëÈ¢ù RM" style="width:110px;" />
        <button id="addBonusBtn">Ê∑ªÂä†</button>
      </div>
      <p class="error-text" id="addBonusError"></p>
      <div id="bonusItemsWrap" style="margin-top:12px;"></div>
    </div>
    <div class="panel">
      <h2>ËÄÅÂ∏àÊâãÂ∑•Ë¥πË°•Áôª / ÁºñËæë</h2>
      <div class="field"><label for="at_owner">ËÄÅÂ∏à</label><select id="at_owner"></select></div>
      <div class="field"><label for="at_date">Êó•Êúü</label><input type="date" id="at_date" /></div>
      <div class="field"><label for="at_category">È°πÁõÆÁ±ªÂà´</label><select id="at_category"></select></div>
      <div class="field"><label for="at_item">ÂÖ∑‰ΩìÈÉ®‰Ωç / È°πÁõÆ</label><select id="at_item"></select></div>
      <div class="field" id="at_qty_field" style="display:none;">
        <label for="at_qty" id="at_qty_label">Êï∞Èáè</label>
        <input type="number" id="at_qty" min="1" step="1" value="1" />
      </div>
      <div class="field"><label for="at_client">ÂÆ¢Êà∑ÂêçÁß∞</label><input type="text" id="at_client" placeholder="ÈÄâÂ°´" /></div>
      <div class="field">
        <label for="at_discount">ÁªôÈ°æÂÆ¢ÁöÑÊäòÊâ£ÔºàÈÄâÂ°´Ôºâ</label>
        <div style="display:flex;gap:8px;">
          <select id="at_discount_type" style="max-width:130px;">
            <option value="pct">ÁôæÂàÜÊØî %</option>
            <option value="rm">ÈáëÈ¢ù RM</option>
          </select>
          <input type="number" id="at_discount" min="0" step="0.01" placeholder="0" />
        </div>
      </div>
      <div class="preview-commission" id="atTeacherCommissionPreview"></div>
      <div class="field"><label for="at_note">Â§áÊ≥®</label><input type="text" id="at_note" placeholder="ÈÄâÂ°´" /></div>
      <div style="display:flex;gap:8px;">
        <button class="primary" id="addAtTeacherRecordBtn" style="width:100%;">ËÆ∞ÂΩïÂÖ•Ë¥¶</button>
        <button id="cancelAtEditBtn" style="display:none;white-space:nowrap;">ÂèñÊ∂àÁºñËæë</button>
      </div>
      <p class="error-text" id="addAtTeacherRecordError"></p>
    </div>
    <div class="panel">
      <h2>Ê∂¶È¢úÊúØ / Áù´ÊØõ / ÂÜ∞ÁÇπ ÊâãÂ∑•Ë¥π</h2>
      <div id="opRatesWrap"></div>
    </div>
    <div class="panel">
      <h2>ÊäóË°∞‰∫ßÂìÅÊèêÊàê</h2>
      <div class="roster-chips" id="antiProductChips"></div>
      <div class="add-row">
        <input type="text" id="newProductName" placeholder="È°πÁõÆÂêçÁß∞Ôºå‰æãÔºö298ÁàÜÂç°" />
        <input type="number" id="newProductCommission" placeholder="ÊèêÊàê RM" style="width:110px;" />
        <button id="addProductBtn">Ê∑ªÂä†È°πÁõÆ</button>
      </div>
    </div>
    <div class="panel">
      <h2>ÂºïÊµÅÊúçÂä°È°πÁõÆ</h2>
      <div class="roster-chips" id="referralItemChips"></div>
      <div class="add-row">
        <input type="text" id="newReferralName" placeholder="È°πÁõÆÂêçÁß∞Ôºå‰æãÔºöFacial" />
        <input type="number" id="newReferralAmount" placeholder="ÊäÄÊúØÊúçÂä°Ë¥π/‰∫∫ RM" style="width:130px;" />
        <input type="number" id="newReferralInviteFee" placeholder="ÈÇÄÁ∫¶Ë¥π/ÁªÑ RM" style="width:120px;" />
        <button id="addReferralBtn">Ê∑ªÂä†È°πÁõÆ</button>
      </div>
      <p class="hint">ÊäÄÊúØÊúçÂä°Ë¥πÊòØÊØèÊúçÂä°‰∏Ä‰ΩçÂÆ¢‰∫∫ÁöÑÈáëÈ¢ùÔºà‰ºöËá™Âä®‰πò‰ª•ÊúçÂä°‰∫∫Êï∞ÔºâÔºõÈÇÄÁ∫¶Ë¥πÊòØÊï¥ÁªÑÂõ∫ÂÆö‰∏ÄÁ¨îÔºåÂè™ÊúâÂãæ‰∫Ü„ÄåÊú¨Ê¨°‰πüÊòØÈÇÄÁ∫¶‰∫∫„ÄçÊâç‰ºöÂä†‰∏ä„ÄÇ‰∏§‰∏™ÈáëÈ¢ùÈÉΩÊòØÂõ∫ÂÆöÁöÑÔºåÂëòÂ∑•‰∏çËÉΩËá™Â∑±Êîπ„ÄÇ</p>
    </div>
    <div class="panel">
      <h2>ÊäóË°∞Êìç‰ΩúË¥πÈ°πÁõÆ</h2>
      <div id="antiOpItemsWrap"></div>
      <div class="add-row">
        <input type="text" id="newOpItemName" placeholder="È°πÁõÆÂêçÁß∞Ôºå‰æãÔºöÈªÑÈáëÁÇÆ" />
        <button id="addOpItemBtn">Ê∑ªÂä†È°πÁõÆ</button>
      </div>
    </div>
    <div class="panel">
      <h2>ÂÖ∂‰ªñËÆæÁΩÆ</h2>
      <div class="field" style="max-width:220px;">
        <label for="reviewDefaultInput">ReviewÁÇπËØÑÈªòËÆ§Â•ñÂä±ÈáëÈ¢ù (RM)</label>
        <input type="number" id="reviewDefaultInput" min="3" max="5" step="0.5" />
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <h2 style="margin:0;">Êú¨ÊúàÂÖ®ÈÉ®ÊòéÁªÜ</h2>
        <select id="adminRecordsPersonFilter" style="max-width:200px;"><option value="">ÂÖ®ÈÉ®‰∫∫Âëò</option></select>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Êó•Êúü</th><th>Á±ªÂûã</th><th>‰∫∫Âëò</th><th>ÂÆ¢Êà∑</th><th class="num">ÂàÜÊàêÊòéÁªÜ</th><th>Áä∂ÊÄÅ</th></tr></thead>
        <tbody id="adminRecordsBody"></tbody>
      </table></div>
    </div>
    <div class="panel">
      <h2>ÁªìÁÆóÊÄªÁªìÔºàÂ§çÂà∂ÂèëÁªôÂõ¢ÈòüÔºâ</h2>
      <p class="hint" style="margin:0 0 10px;">ÈÄâ‰∏Ä‰∏™‰∫∫Ôºå‰ºöÊääTAÂΩìÊúà„ÄåÂ∑≤ÂÆ°Ê†∏ÔºàÂæÖÁªìÁÆóÔºâ„ÄçÂíå„ÄåÂ∑≤ÁªìÁÆó„ÄçÁöÑËÆ∞ÂΩïÂàÜÂºÄÂàóÂá∫Êù•ÔºåÊï¥ÁêÜÊàê‰∏ÄÊÆµÊñáÂ≠óÔºåÂ§çÂà∂ÂêéÂèØ‰ª•Áõ¥Êé•ÂèëÂà∞ WhatsApp„ÄÇ</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <select id="statementPerson"></select>
        <button id="genStatementBtn">ÁîüÊàêÁªìÁÆóËÆØÊÅØ</button>
      </div>
      <textarea id="statementOutput" readonly style="min-height:180px;font-family:var(--font-num);font-size:12.5px;line-height:1.6;" placeholder="ÁÇπ„ÄåÁîüÊàêÁªìÁÆóËÆØÊÅØ„ÄçÊü•ÁúãÂÜÖÂÆπ"></textarea>
      <div style="margin-top:10px;">
        <button class="primary" id="copyStatementBtn" style="width:auto;">Â§çÂà∂ÊñáÂ≠ó</button>
      </div>
    </div>
  `;
  renderRoster();
  renderOpRates();
  renderAntiProducts();
  renderReferralItems();
  renderAntiOpItems();
  buildAdminTeacherPanel();
  renderPayrollAdminPanel();
  document.getElementById('reviewDefaultInput').value = settings.reviewDefaultAmount;

  document.getElementById('addPersonBtn').addEventListener('click', addPerson);
  document.getElementById('addProductBtn').addEventListener('click', addProduct);
  document.getElementById('addReferralBtn').addEventListener('click', addReferralItem);
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
    const old = btn.textContent; btn.textContent = 'Â∑≤Â§çÂà∂'; setTimeout(()=>{ btn.textContent = old; }, 1500);
  });
}

// ---------------- Admin: backfill/edit teacher records ----------------
function buildAdminTeacherPanel(){
  const ownerSel = document.getElementById('at_owner');
  const teachers = people.filter(p=>p.active && p.role==='teacher').slice().sort((a,b)=>a.name.localeCompare(b.name));
  ownerSel.innerHTML = teachers.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') || '<option value="">ËøòÊ≤°ÊúâËÄÅÂ∏à</option>';

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
  sel.innerHTML = (cat?cat.items:[]).map(i=>`<option value="${escapeHtml(i.name)}">${escapeHtml(i.name)}ÔºàRM${i.fee}${i.perUnit?'/'+(i.unitLabel||'ÊîØ'):''}Ôºâ</option>`).join('');
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
  else{ document.getElementById('at_qty_label').textContent = `${found.item.unitLabel||'ÊîØ'}Êï∞`; }
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
    const discountLabel = dType==='rm' ? `ÊäòÊâ£ -RM${dValue}` : `ÊäòÊâ£ ${dValue}%`;
    box.innerHTML = `<div class="row"><span>Âéü‰ª∑ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(baseAmount)}</span></div>
      <div class="row"><span>${discountLabel}</span><span class="num">-${fmt(discountAmount)}</span></div>
      <div class="row"><span>ÂÆûÊî∂ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(finalFee)}</span></div>`;
  } else {
    box.innerHTML = `<div class="row"><span>ÊâãÂ∑•Ë¥π</span><span class="num">${fmt(baseAmount)}</span></div>`;
  }
}

function exitAtEditMode(){
  editingTeacherRecordId = null;
  document.getElementById('addAtTeacherRecordBtn').textContent = 'ËÆ∞ÂΩïÂÖ•Ë¥¶';
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
  if(!ownerId){ errEl.textContent = 'ËØ∑ÂÖàÊ∑ªÂä†‰∏Ä‰ΩçËÄÅÂ∏à„ÄÇ'; return; }
  if(!date){ errEl.textContent = 'ËØ∑Â°´ÂÜôÊó•Êúü„ÄÇ'; return; }
  const found = teacherFindItem(catKey, itemName);
  if(!found){ errEl.textContent = 'ËØ∑ÈÄâÊã©È°πÁõÆÁ±ªÂà´ÂíåÂÖ∑‰ΩìÈÉ®‰Ωç„ÄÇ'; return; }

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
  if(error){ errEl.textContent = '‰øùÂ≠òÂ§±Ë¥•Ôºö'+error.message; return; }

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
  document.getElementById('addAtTeacherRecordBtn').textContent = 'Êõ¥Êñ∞ËÆ∞ÂΩï';
  document.getElementById('cancelAtEditBtn').style.display = '';
  updateAtTeacherPreview();
  document.getElementById('adminSection').scrollIntoView({behavior:'smooth', block:'start'});
}

function buildStatementLines(recs, person, adRateByPerson){
  let total = 0;
  const lines = recs.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson).filter(a=>a.who===person.name);
    const sum = allocs.reduce((s,a)=>s+a.amount,0);
    total += sum;
    const detail = r.type==='teacher_service' ? teacherItemLabel(r.productName) : recordDetailText(r);
    const detailText = (detail && detail!=='‚Äî') ? `Ôºà${detail}Ôºâ` : '';
    const clientPart = r.client ? ` ${r.client}` : '';
    return `- ${r.date} ${TYPES[r.type].label}${clientPart}${detailText}Ôºö${fmt(sum)}`;
  }).filter(Boolean);
  return { lines, total };
}

function buildStatementText(personId){
  const person = people.find(p=>p.id===personId);
  if(!person) return null;
  const ym = document.getElementById('monthPicker').value;
  const adRatesRaw = personalAdTotals(records);
  const adRateByPerson = {};
  Object.keys(adRatesRaw).forEach(id=>{ adRateByPerson[id] = tierRate(adRatesRaw[id], PERSONAL_AD_TIERS); });

  const mineOf = status => records.filter(r=> recordPrimaryPersonId(r)===personId && r.status===status)
    .slice().sort((a,b)=> a.date<b.date?-1:1);

  const reviewed = buildStatementLines(mineOf('reviewed'), person, adRateByPerson);
  const paid = buildStatementLines(mineOf('paid'), person, adRateByPerson);

  const [y,m] = ym.split('-');
  const header = `„ÄêMJPRO ÊèêÊàêÁªìÁÆó„Äë${person.name} ¬∑ ${y}Âπ¥${parseInt(m,10)}Êúà`;

  const sections = [header, ''];
  sections.push('Â∑≤ÂÆ°Ê†∏ÔºàÂæÖÁªìÁÆóÔºâÔºö');
  sections.push(...(reviewed.lines.length ? reviewed.lines : ['Êú¨ÊúàËøòÊ≤°ÊúâÂ∑≤ÂÆ°Ê†∏ÂæÖÁªìÁÆóÁöÑËÆ∞ÂΩï„ÄÇ']));
  sections.push(`Â∑≤ÂÆ°Ê†∏ÂêàËÆ°Ôºö${fmt(reviewed.total)}`, '');
  sections.push('Â∑≤ÁªìÁÆóÔºö');
  sections.push(...(paid.lines.length ? paid.lines : ['Êú¨ÊúàËøòÊ≤°ÊúâÂ∑≤ÁªìÁÆóÁöÑËÆ∞ÂΩï„ÄÇ']));
  sections.push(`Â∑≤ÁªìÁÆóÂêàËÆ°Ôºö${fmt(paid.total)}`);

  return sections.join('\n');
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

  const paydayInput = document.getElementById('paydayInput');
  if(paydayInput){
    paydayInput.value = currentPayday || '';
    paydayInput.onchange = async ()=>{
      const ym = document.getElementById('monthPicker').value;
      await sb.from('payday_settings').upsert({ ym, payday_date: paydayInput.value || null }, { onConflict:'ym' });
      currentPayday = paydayInput.value || null;
      renderPayrollReport();
    };
  }
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
  }).join('') || '<tr><td colspan="9" class="empty">ËøòÊ≤°Êúâ‰∫∫Âëò</td></tr>';

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
  if(bonusItems.length===0){ wrap.innerHTML = '<p class="empty">Êú¨ÊúàËøòÊ≤°ÊúâBonusÈ°πÁõÆ</p>'; return; }
  wrap.innerHTML = bonusItems.map(b=>{
    const person = people.find(p=>p.id===b.personId);
    return `<div class="roster-chip" style="margin-bottom:8px;">${escapeHtml(person?person.name:'Êú™Áü•')} ¬∑ ${escapeHtml(b.label||'Bonus')} <b class="num" style="margin-left:4px;">${fmt(b.amount)}</b>
      <button class="del" data-del-bonus="${b.id}" aria-label="Âà†Èô§">‚úï</button>
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
  if(!personId){ errEl.textContent = 'ËØ∑ÈÄâÊã©‰∫∫Âëò„ÄÇ'; return; }
  if(!label || !amount){ errEl.textContent = 'ËØ∑Â°´ÂÜôÈ°πÁõÆÂêçÁß∞ÂíåÈáëÈ¢ù„ÄÇ'; return; }
  const { error } = await sb.from('bonus_items').insert({ person_id:personId, ym, label, amount });
  if(error){ errEl.textContent = '‰øùÂ≠òÂ§±Ë¥•Ôºö'+error.message; return; }
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
      ${p.id===currentProfile.id ? '' : `<button data-remove-person="${p.id}" style="margin-left:6px;">ÁßªÈô§</button>`}
    </span>`).join('') || '<p class="empty">ËøòÊ≤°Êúâ‰∫∫Âëò</p>';

  wrap.querySelectorAll('[data-remove-person]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const p = people.find(x=>x.id===btn.getAttribute('data-remove-person'));
      if(!confirm(`Á°ÆÂÆöË¶ÅÁßªÈô§„Äå${p.name}„ÄçÂêóÔºüÁßªÈô§ÂêéTA‰∏çËÉΩÂÜçÁôªÂΩïÔºå‰ΩÜTA‰πãÂâçÁöÑËÆ∞ÂΩïÈÉΩ‰ºö‰øùÁïô„ÄÇ`)) return;
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
  inactiveWrap.innerHTML = `<p class="hint" style="margin-bottom:6px;">Â∑≤ÁßªÈô§Ôºö</p>` + inactive.map(p=>`
    <span class="roster-chip" style="opacity:0.6;">${escapeHtml(p.name)}
      <button data-restore-person="${p.id}" style="margin-left:6px;">ÊÅ¢Â§ç</button>
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
  if(!name || !/^\d{6}$/.test(pin)){ errEl.textContent = 'ËØ∑Â°´ÂÜôÂßìÂêçÔºåPIN ÈúÄË¶ÅÊòØ6‰ΩçÊï∞Â≠ó„ÄÇ'; return; }
  const email = `u-${uid()}@mjpro.internal`;
  const { data: adminSessionData } = await sb.auth.getSession();
  const adminSession = adminSessionData.session;
  const { data: signData, error: signErr } = await sb.auth.signUp({ email, password: pin });
  if(signErr || !signData.user){ errEl.textContent = 'ÂàõÂª∫ÁôªÂΩïË¥¶Âè∑Â§±Ë¥•Ôºö'+(signErr?signErr.message:'Êú™Áü•ÈîôËØØ'); return; }
  if(adminSession){
    await sb.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token });
  }
  const { error: profErr } = await sb.from('profiles').insert({ id:signData.user.id, name, email, role:roleSel.value });
  if(profErr){ errEl.textContent = 'ÂàõÂª∫‰∫∫ÂëòËµÑÊñôÂ§±Ë¥•Ôºö'+profErr.message; return; }
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
        ${people.filter(p=>p.active && p.role!=='teacher').map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${p[op.field]||0}" data-op-rate="${p.id}" data-op-field="${op.field}" /></span>`).join('') || '<span class="empty">ÂÖàÊ∑ªÂä†‰∫∫Âëò</span>'}
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
      <button class="del" data-del-product="${p.id}">‚úï</button>
    </span>`).join('') || '<p class="empty">ËøòÊ≤°ÊúâÊ∑ªÂä†ÊäóË°∞È°πÁõÆ</p>';
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

function renderReferralItems(){
  const wrap = document.getElementById('referralItemChips');
  if(!wrap) return;
  wrap.innerHTML = referralItems.map(i=>`
    <span class="roster-chip">${escapeHtml(i.name)}
      <span class="hint" style="margin-left:4px;">ÊäÄÊúØË¥π/‰∫∫</span>
      <input type="number" class="num" min="0" step="1" value="${i.amount}" data-referral-rate="${i.id}" style="width:70px;" />
      <span class="hint">ÈÇÄÁ∫¶Ë¥π/ÁªÑ</span>
      <input type="number" class="num" min="0" step="1" value="${i.inviteFee}" data-referral-invite="${i.id}" style="width:70px;" />
      <button class="del" data-del-referral="${i.id}">‚úï</button>
    </span>`).join('') || '<p class="empty">ËøòÊ≤°ÊúâÊ∑ªÂä†ÂºïÊµÅÊúçÂä°È°πÁõÆ</p>';
  wrap.querySelectorAll('[data-referral-rate]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      await sb.from('referral_items').update({amount:Number(inp.value)||0}).eq('id', inp.getAttribute('data-referral-rate'));
      await loadAllData(); renderReferralItems(); renderReferralSelect(); await renderAll();
    });
  });
  wrap.querySelectorAll('[data-referral-invite]').forEach(inp=>{
    inp.addEventListener('change', async ()=>{
      await sb.from('referral_items').update({invite_fee:Number(inp.value)||0}).eq('id', inp.getAttribute('data-referral-invite'));
      await loadAllData(); renderReferralItems(); renderReferralSelect(); await renderAll();
    });
  });
  wrap.querySelectorAll('[data-del-referral]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      await sb.from('referral_items').delete().eq('id', btn.getAttribute('data-del-referral'));
      await loadAllData(); renderReferralItems(); renderReferralSelect(); await renderAll();
    });
  });
}

async function addReferralItem(){
  const nameInput = document.getElementById('newReferralName');
  const amtInput = document.getElementById('newReferralAmount');
  const inviteInput = document.getElementById('newReferralInviteFee');
  const name = nameInput.value.trim();
  if(!name) return;
  await sb.from('referral_items').insert({name, amount:Number(amtInput.value)||0, invite_fee:Number(inviteInput.value)||0});
  nameInput.value=''; amtInput.value=''; inviteInput.value='';
  await loadAllData(); renderReferralItems(); renderReferralSelect(); await renderAll();
}

function renderAntiOpItems(){
  const wrap = document.getElementById('antiOpItemsWrap');
  wrap.innerHTML = antiagingOpItems.map(item=>`
    <div class="op-item-card">
      <div class="op-item-header">
        <span>${escapeHtml(item.name)}</span>
        <span style="display:flex;align-items:center;gap:12px;">
          <label><input type="checkbox" data-split-opitem="${item.id}" ${item.split?'checked':''} /> ‰∏éÂÖ¨Âè∏Âπ≥ÂàÜÔºà50%Ôºâ</label>
          <button class="del" data-del-opitem="${item.id}">‚úï</button>
        </span>
      </div>
      <div class="roster-chips" style="margin-bottom:0;">
        ${people.filter(p=>p.active && p.role!=='teacher').map(p=>`<span class="roster-chip">${escapeHtml(p.name)} <input type="number" class="num" min="0" step="1" value="${(item.rates&&item.rates[p.id])||0}" data-opitem="${item.id}" data-opperson="${p.id}" /></span>`).join('') || '<span class="empty">ÂÖàÊ∑ªÂä†‰∫∫Âëò</span>'}
      </div>
    </div>
  `).join('') || '<p class="empty">ËøòÊ≤°ÊúâÊìç‰ΩúË¥πÈ°πÁõÆ</p>';

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
      if(a.who==='ÂÖ¨Âè∏'){ companyTotal += a.amount; }
      else { personTotals[a.who] = (personTotals[a.who]||0)+a.amount; payoutTotal += a.amount; }
    });
  });
  const strip = document.getElementById('adminSummaryStrip');
  const personCards = Object.keys(personTotals).map(name=>`<div class="stat"><p class="label">${escapeHtml(name)}</p><p class="value num">${fmt(personTotals[name])}</p></div>`).join('');
  strip.innerHTML = `
    <div class="stat total"><p class="label">‰∏™‰∫∫ÊèêÊàêÂêàËÆ°</p><p class="value num">${fmt(payoutTotal)}</p></div>
    <div class="stat"><p class="label">ÂÖ¨Âè∏ÊäΩÊàêÂêàËÆ°</p><p class="value num">${fmt(companyTotal)}</p></div>
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
    filterSel.innerHTML = '<option value="">ÂÖ®ÈÉ®‰∫∫Âëò</option>' + sorted.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if(sorted.some(p=>p.id===prevVal)) filterSel.value = prevVal;
    filterId = filterSel.value;
  }
  const filteredRecords = filterId ? records.filter(r=>recordPrimaryPersonId(r)===filterId) : records;

  const body = document.getElementById('adminRecordsBody');
  body.innerHTML = filteredRecords.map(r=>{
    const allocs = allocationsFor(r, adRateByPerson);
    const total = allocs.reduce((s,a)=>s+a.amount,0);
    const who = personName(recordPrimaryPersonId(r));
    const allocText = allocs.map(a=>`${escapeHtml(a.who)} ¬∑ ${escapeHtml(a.role)}Ôºö<b class="num">${fmt(a.amount)}</b>`).join('<br/>');
    return `<tr>
      <td class="num">${r.date}</td>
      <td>${TYPES[r.type].label}</td>
      <td>${escapeHtml(who)}</td>
      <td>${escapeHtml(r.client||'‚Äî')}</td>
      <td class="num">${allocText}<div style="margin-top:4px;font-weight:600;">ÂêàËÆ° ${fmt(total)}</div></td>
      <td>
          <select data-status="${r.id}" class="pill ${statusClass(r.status)}" style="border:none;">
            <option value="pending" ${r.status==='pending'||!r.status?'selected':''}>ÂæÖÂÆ°Ê†∏</option>
            <option value="reviewed" ${r.status==='reviewed'?'selected':''}>Â∑≤ÂÆ°Ê†∏</option>
            <option value="paid" ${r.status==='paid'?'selected':''}>Â∑≤ÁªìÁÆó</option>
          </select>
          ${r.type==='teacher_service' ? `<button data-edit-teacher="${r.id}" style="margin-left:4px;">ÁºñËæë</button>` : `<button data-edit="${r.id}" style="margin-left:4px;">ÁºñËæë</button>`}
          <button data-del="${r.id}" style="margin-left:4px;">Âà†Èô§</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">Êú¨ÊúàËøòÊ≤°ÊúâËÆ∞ÂΩï</td></tr>';

  body.querySelectorAll('[data-status]').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const newStatus = sel.value;
      await sb.from('records').update({status:newStatus}).eq('id', sel.getAttribute('data-status'));
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
      if(!confirm('Âà†Èô§ËøôÊù°ËÆ∞ÂΩïÔºü')) return;
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
