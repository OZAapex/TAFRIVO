/* TAFRIVO: static GitHub Pages UI + Supabase Auth, RLS-protected data API and Storage.
   Security decisions are enforced by database policies, NEVER by this browser code. */
(() => {
  'use strict';
  const root = document.getElementById('app');
  if (!window.supabase || !window.TAFRIVO_CONFIG) {
    root.innerHTML = '<main class="wrap section"><div class="banner error">تعذر تحميل مكتبة Supabase. تحقق من اتصال الإنترنت أو إعدادات الموقع.</div></main>';
    return;
  }
  const sb = window.supabase.createClient(window.TAFRIVO_CONFIG.SUPABASE_URL, window.TAFRIVO_CONFIG.SUPABASE_PUBLISHABLE_KEY);
  const state = { user:null, role:'owner', restaurant:null, restaurants:[], applications:[], categories:[], items:[], tab:'items', lang:'ar', cart:{}, notice:null, itemEdit:null, menu:null, billingSubscriptions:[], billingPlans:[], billingPayments:[], contactMessages:[], registrationOpen:false, catEdit:null };
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url = v => /^https:\/\//i.test(v || '') ? e(v) : '';
  const money = v => `${Number(v || 0).toLocaleString('he-IL',{minimumFractionDigits:0,maximumFractionDigits:2})} ₪`;
  const cls = s => ['approved','pending','rejected','suspended'].includes(s)?s:'pending';
  const status = s => ({pending:'قيد المراجعة',approved:'موافق عليه',rejected:'مرفوض',suspended:'موقوف'})[s] || s;
  const brand = () => `<a class="logo" href="#"><img src="assets/logo.webp" alt="TAFRIVO"><span>TAFRIVO</span></a>`;
  const nav = (right='') => `<header class="topbar"><div class="topin wrap">${brand()}<div class="navlinks"><a href="#">الرئيسية</a><a href="#features">المميزات</a><a href="#app">لوحة التحكم</a><a href="contact.html">تواصل معنا</a></div><div class="actions">${right}</div></div></header>`;
  const footer = () => `<footer class="footer"><div class="wrap"><span>© TAFRIVO · Digital Menus, Beautifully Simple</span><span><a href="privacy.html">الخصوصية</a> · <a href="terms.html">الشروط</a> · <a href="contact.html">تواصل معنا</a></span></div></footer>`;
  const errBox = () => state.notice ? `<div class="banner ${state.notice.type || ''}" role="status">${e(state.notice.text)}</div>`:'';
  function flash(text,type='') {state.notice={text,type}; const el=document.getElementById('message'); if(el){el.innerHTML=errBox();el.scrollIntoView({block:'nearest',behavior:'smooth'});} }
  function clearNotice(){state.notice=null;}
  function loading(){root.innerHTML=`${nav()}<div class="center-loader"><span class="spin"></span><p>جاري تحميل البيانات من Supabase…</p></div>`;}
  function errText(err){return err?.message || String(err || 'حدث خطأ، حاول مرة ثانية.');}
  function need(result){if(result?.error) throw result.error;return result.data;}
  const go=hash=>{if(location.hash===hash) route(); else location.hash=hash;};
  const userId=()=>state.user?.id||'';
  async function refreshPublicSettings(){
    const res=await sb.from('site_settings').select('registration_open').eq('id',1).maybeSingle();
    if(res.error){console.warn('site settings unavailable');state.registrationOpen=false;return;}
    state.registrationOpen=Boolean(res.data?.registration_open);
  }
  function closedSignupPage(){
    document.title='TAFRIVO | الانضمام التجريبي';
    root.innerHTML=`${nav('<a class="btn outline" href="#">الرئيسية</a>')}<main class="wrap section" style="max-width:660px"><section class="panel empty-panel"><div class="pending-icon">✉️</div><h2>التسجيل التجريبي بالموافقة</h2><p class="muted">عم نستقبل طلبات المطاعم عبر التواصل حاليًا حتى تكتمل إعدادات البريد وتأكيد الحساب.</p><a href="contact.html" class="btn gold">اطلب الانضمام</a> <a href="#login" class="btn outline">عندي حساب</a></section></main>${footer()}`;
  }
  function recoveryPage(kind){
    const reset=kind==='reset-password';
    document.title='TAFRIVO | '+(reset?'تغيير كلمة المرور':'استعادة كلمة المرور');
    root.innerHTML=`${nav('<a class="btn outline" href="#login">تسجيل الدخول</a>')}<main class="wrap section" style="max-width:550px"><section class="panel"><h2>${reset?'اختيار كلمة مرور جديدة':'استعادة كلمة المرور'}</h2><p class="muted">${reset?'اختار كلمة مرور قوية جديدة لحسابك.':'بنرسل رابط إعادة تعيين كلمة المرور إلى إيميلك.'}</p><div id="message">${errBox()}</div><form data-form="${reset?'reset-password':'forgot-password'}"><div class="field"><label>${reset?'كلمة المرور الجديدة':'البريد الإلكتروني'}</label><input name="${reset?'password':'email'}" type="${reset?'password':'email'}" ${reset?'minlength="12" autocomplete="new-password"':'autocomplete="email"'} required></div><button class="btn gold block">${reset?'حفظ كلمة المرور':'إرسال رابط الاستعادة'}</button></form><p class="small muted" style="margin-top:17px">تحتاج رسائل الاستعادة إلى تفعيل SMTP الخاص بالمنصة.</p></section></main>${footer()}`;
  }
  function heroPhone(){return `<div class="demo-phone"><div class="phone-cover"></div><div class="phone-title">منيو مطعمك ✨</div><div class="food-pills"><span>الأكثر طلبًا</span><span>المقبلات</span><span>الوجبات</span></div><div class="food-row"><b>وجبة مشاوي مشكلة</b><em>79 ₪</em></div><div class="food-row"><b>برغر كلاسيك</b><em>49 ₪</em></div><div class="food-row"><b>بيتزا مارغريتا</b><em>59 ₪</em></div><div class="food-row"><b>ليمون نعناع</b><em>17 ₪</em></div><div class="banner" style="margin:12px 0 0;text-align:center;font-size:11px">منيو حي يتحدث مع الأسعار فورًا</div></div>`;}
  function home(){document.title='TAFRIVO | منيو إلكتروني يليق بمطعمك';root.innerHTML=`${nav(`<a class="btn outline" href="#login">دخول</a><a class="btn gold" href="${state.registrationOpen?'#signup':'contact.html'}">${state.registrationOpen?'سجّل مطعمك':'اطلب الانضمام'}</a>`)}<main><section class="hero"><div class="wrap hero-inner"><div><div class="eyebrow">✦ منصة رقمية للمطاعم والمقاهي</div><h1>منيو مطعمك <strong>أفخم، أسرع، وأذكى.</strong></h1><p>اعرض أكلاتك بصور وأسعار احترافية، وامنح زبائنك منيو مباشر عبر QR. إنت بتدير التفاصيل، وإحنا نهتم بالتجربة.</p><div class="actions"><a class="btn gold" href="${state.registrationOpen?'#signup':'contact.html'}">${state.registrationOpen?'ابدأ تسجيل مطعمك ←':'سجّل اهتمام مطعمك ←'}</a><a class="btn outline" href="#login">عندي حساب</a></div><div style="color:#9abaaa;font-size:12px;margin-top:20px">${state.registrationOpen?'التسجيل يحتاج موافقة إدارة TAFRIVO قبل النشر':'الانضمام التجريبي عبر نموذج التواصل · التسجيل المباشر قريبًا'}</div></div>${heroPhone()}</div></section><section class="section" id="features"><div class="wrap"><div class="section-title"><h2>كل اللي يحتاجه منيو مطعمك</h2><p>لوحة بسيطة، صور واضحة، وتجربة مريحة على الموبايل</p></div><div class="features"><article class="feature"><div class="emoji">📱</div><h3>منيو متجاوب</h3><p>قائمة أكلات مرتبة لكل الأجهزة مع صور، وصف وأسعار.</p></article><article class="feature"><div class="emoji">🔐</div><h3>حساب خاص وآمن</h3><p>كل صاحب مطعم يعدّل بيانات مطعمه فقط، بعد الموافقة.</p></article><article class="feature"><div class="emoji">📷</div><h3>رمز QR ثابت</h3><p>شارك رابط منيو مطعمك واطبعه على الطاولات.</p></article></div></div></section><section class="dark-cta"><div class="wrap"><div><h2>جاهز تطلع منيو مطعمك للعالم؟</h2><p style="color:#b8d2c5;margin:0">ابعث بيانات التواصل لمطعمك وإدارة TAFRIVO بتتابع معك.</p></div><a href="${state.registrationOpen?'#signup':'contact.html'}" class="btn gold">${state.registrationOpen?'سجّل مطعمك الآن':'تواصل معنا للانضمام'}</a></div></section></main>${footer()}`;}
  function authPage(kind){const signup=kind==='signup';document.title=`TAFRIVO | ${signup?'تسجيل حساب':'تسجيل الدخول'}`;root.innerHTML=`${nav(`<a class="btn outline" href="#">الرئيسية</a>`)}<div class="wrap"><section class="authwrap panel"><div class="auth-top">${brand()}<h2>${signup?'إنشاء حساب جديد':'أهلًا برجعتك'}</h2><p class="muted">${signup?'بعد تسجيل الحساب بتقدم طلب مطعمك للمراجعة':'ادخل بحسابك لإدارة مطعمك أو المنصة'}</p></div><div id="message">${errBox()}</div><form data-form="${signup?'signup':'login'}"><div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required autocomplete="email" placeholder="name@example.com"></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" minlength="${signup?12:8}" required autocomplete="${signup?'new-password':'current-password'}" placeholder="${signup?'12 حرفًا أو أكثر':'كلمة المرور'}"></div>${signup?`<label class="small consent"><input type="checkbox" required name="privacy_ok"> أوافق على <a href="terms.html" target="_blank" rel="noopener">شروط الاستخدام</a> واطلعت على <a href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>.</label>`:""}<button class="btn gold block" type="submit">${signup?'إنشاء الحساب':'تسجيل الدخول'}</button></form><p style="text-align:center;margin-top:22px" class="small">${signup?'عندك حساب؟ <a href="#login"><b>سجل دخول</b></a>':'أول مرة؟ <a href="' + (state.registrationOpen?'#signup':'contact.html') + '"><b>'+(state.registrationOpen?'أنشئ حساب':'اطلب الانضمام التجريبي')+'</b></a>'}</p></section></div>${footer()}`;}
  async function authUser(){const {data,error}=await sb.auth.getUser();if(error && !/Auth session missing/i.test(error.message))console.warn('getUser',error.message);return data?.user||null;}
  async function route(){
    const hash=decodeURIComponent(location.hash.replace(/^#/,''));
    if(hash.startsWith('menu/')){loading(); await openMenu(hash.slice(5));return;}
    if(hash==='forgot-password'||hash==='reset-password'){clearNotice();recoveryPage(hash);return;}
    if(hash==='login'||hash==='signup'){clearNotice();if(hash==='signup'&&!state.registrationOpen)closedSignupPage();else authPage(hash);return;}
    if(hash.startsWith('manage/')){
      loading();
      try{
        state.user=await authUser();if(!state.user){go('#login');return;}
        const profile=need(await sb.from('account_profiles').select('role').eq('user_id',userId()).maybeSingle());
        state.role=profile?.role||'owner';
        if(state.role!=='super_admin'){go('#app');return;}
        const id=hash.slice('manage/'.length);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){go('#app');return;}
        state.restaurant={id};state.tab='items';state.itemEdit=null;
        await loadAdminRestaurant();
      }catch(err){root.innerHTML=`${nav()}<main class="wrap section"><div class="banner error">تعذر فتح المنيو: ${e(errText(err))}</div><a class="btn outline" href="#app">عودة للمدير</a></main>`;}
      return;
    }
    if(hash==='app'){
      loading();try{state.user=await authUser();if(!state.user){go('#login');return;} const profiles=need(await sb.from('account_profiles').select('role').eq('user_id',userId()).maybeSingle());state.role=profiles?.role||'owner'; if(state.role==='super_admin'){state.restaurant=null;await loadAdmin();}else{await loadOwner();}}catch(err){root.innerHTML=`${nav()}<div class="wrap section"><div class="banner error">تعذر تحميل حسابك: ${e(errText(err))}</div><a class="btn" href="#app">أعد المحاولة</a></div>`;}return;
    }
    home();
  }
  function shell(title,subtitle,actions=''){return `${nav(`<a class="btn outline" href="#app">لوحة التحكم</a><button class="btn gold" data-act="signout">خروج</button>`)}<div class="pagehead"><div class="wrap"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions}</div></div>`;}
  function jerusalemBillingMonth(){
 const fields=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'numeric'}).formatToParts(new Date());
 const y=Number(fields.find(x=>x.type==='year').value), m=Number(fields.find(x=>x.type==='month').value);
 return {year:y,month:m,firstISO:new Date(Date.UTC(y,m-1,1)-2*86400000).toISOString(),endISO:new Date(Date.UTC(y,m,1)+2*86400000).toISOString(),label:new Intl.DateTimeFormat('ar-IL',{month:'long',year:'numeric',timeZone:'Asia/Jerusalem'}).format(new Date())};
}
  async function loadAdmin(){
 const mon=jerusalemBillingMonth();
 const [r,a,subs,plans,payments,contacts,site]=await Promise.all([
  sb.from('restaurants').select('*').order('created_at',{ascending:false}),
  sb.from('restaurant_applications').select('*'),
  sb.from('restaurant_subscriptions').select('id,restaurant_id,plan_code,status,current_period_start,current_period_end,grace_until,last_paid_at,next_payment_at,cancel_at_period_end').order('created_at',{ascending:false}),
  sb.from('billing_plans').select('code,name_ar,amount_ils,status,sort_order').order('sort_order'),
  sb.from('billing_payments').select('restaurant_id,amount_ils,paid_at,status').eq('status','paid').gte('paid_at',mon.firstISO).lt('paid_at',mon.endISO),
  sb.from('contact_messages').select('id,sender_name,sender_email,topic,body,status,created_at').order('created_at',{ascending:false}).limit(40),
  sb.from('site_settings').select('registration_open').eq('id',1).single()
 ]);
 state.restaurants=need(r)||[];
 state.applications=need(a)||[];
 state.billingSubscriptions=need(subs)||[];
 state.billingPlans=need(plans)||[];
 state.billingPayments=need(payments)||[];
 state.contactMessages=need(contacts)||[];
 state.registrationOpen=Boolean(need(site)?.registration_open);
 renderAdmin();
}
  function renderAdminBilling(){
 const mon=jerusalemBillingMonth();
 const formatMonth=d=>{const ps=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',year:'numeric',month:'numeric'}).formatToParts(new Date(d));return [Number(ps.find(x=>x.type==='year').value),Number(ps.find(x=>x.type==='month').value)];};
 const payments=state.billingPayments.filter(p=>p.status==='paid'&&p.paid_at&&(()=>{const [y,m]=formatMonth(p.paid_at);return y===mon.year&&m===mon.month;})());
 const revenue=payments.reduce((sum,p)=>sum+Number(p.amount_ils||0),0);
 const sub=state.billingSubscriptions,planByCode=new Map(state.billingPlans.map(p=>[p.code,p]));
 const active=sub.filter(s=>s.status==='active');
 const recurring=active.reduce((sum,s)=>sum+Number(planByCode.get(s.plan_code)?.amount_ils||0),0);
 const label=s=>({pending:'بانتظار الدفع',trialing:'تجربة',active:'فعّال',past_due:'دفعة متأخرة',paused:'موقوف',canceled:'ملغي',expired:'منتهي'})[s]||s;
 const date=v=>v?new Intl.DateTimeFormat('ar-IL',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'—';
 const statusTag=s=>s==='active'?'approved':s==='past_due'?'suspended':'pending';
 const paidList=sub.length?`<div class="tablewrap"><table class="table"><thead><tr><th>المطعم</th><th>الباقة</th><th>حالة الاشتراك</th><th>قيمة الباقة الشهرية</th><th>التجديد القادم</th><th>آخر دفع مؤكد</th></tr></thead><tbody>${sub.map(s=>{const r=state.restaurants.find(x=>x.id===s.restaurant_id),p=planByCode.get(s.plan_code);return `<tr><td><b>${e(r?.name||'مطعم غير متاح')}</b></td><td>${e(p?.name_ar||s.plan_code)}</td><td><span class="tag ${statusTag(s.status)}">${e(label(s.status))}</span></td><td>${p?money(p.amount_ils):'—'}</td><td>${date(s.next_payment_at||s.current_period_end)}</td><td>${date(s.last_paid_at)}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">لا توجد اشتراكات مدفوعة مسجّلة حتى الآن.</div>';
 const drafts=state.billingPlans.filter(p=>p.status==='draft').map(p=>`${e(p.name_ar)} (${money(p.amount_ils)})`).join(' · ');
 return `<section class="panel" id="billing-overview" style="margin-top:22px"><div class="flexbetween"><h2>الاشتراكات والإيرادات</h2><span class="tag pending">بوابة الدفع قيد الربط</span></div><p class="muted small">إيرادات ${e(mon.label)} محسوبة من الدفعات المؤكدة المسجلة في Supabase فقط. موافقة المطعم أو نشر المنيو لا تعني أنه اشترك أو دفع.</p><div class="stats"><div class="stat"><strong>${active.length}</strong><span>اشتراكات فعّالة</span></div><div class="stat"><strong>${money(revenue)}</strong><span>المحصّل هذا الشهر</span></div><div class="stat"><strong>${money(recurring)}</strong><span>قيمة الاشتراكات النشطة شهريًا (متوقعة)</span></div><div class="stat"><strong>${sub.filter(x=>x.status==='past_due').length}</strong><span>اشتراكات بدفعات متأخرة</span></div></div><h3>المطاعم المشتركة</h3>${paidList}<p class="muted small" style="margin-top:18px">التجديد الآلي غير مُفعّل بعد. لا تُدخل أي أرقام بطاقات أو مفاتيح SUMIT في ملفات GitHub.${drafts?' الباقات المقترحة (مسودات غير منشورة): '+drafts:''}</p></section>`;
}
  function renderAdminContacts(){
 const list=state.contactMessages||[],unread=list.filter(x=>x.status==='new');
 const topics={general:'استفسار عام',restaurant:'طلب انضمام مطعم',technical:'مساعدة تقنية',privacy:'خصوصية وبيانات'};
 const messages=list.length?list.map(m=>{
   const email=encodeURIComponent(m.sender_email);
   return `<article class="support-message"><div class="flexbetween"><div><b>${e(m.sender_name)}</b> · <a href="mailto:${email}" class="support-email">${e(m.sender_email)}</a><div class="small muted">${e(topics[m.topic]||m.topic)} · ${e(new Date(m.created_at).toLocaleString('ar-IL',{timeZone:'Asia/Jerusalem'}))}</div></div><span class="tag ${m.status==='new'?'pending':'approved'}">${m.status==='new'?'جديدة':'تمت المتابعة'}</span></div><p class="support-body">${e(m.body)}</p><div class="actions"><a class="btn soft small" href="mailto:${email}?subject=${encodeURIComponent('TAFRIVO — متابعة رسالتك')}">رد عبر الإيميل</a>${m.status==='new'?`<button class="btn outline small" data-act="contact-handled" data-id="${e(m.id)}">تمت المتابعة</button>`:''}</div></article>`;
 }).join(''):'<div class="empty">ما وصلتنا رسائل تواصل لسه.</div>';
 return `<section class="panel" id="contact-inbox" style="margin-top:22px"><div class="flexbetween"><h2>رسائل التواصل (${unread.length} جديدة)</h2><span class="small muted">آخر 40 رسالة</span></div>${messages}</section>`;
}
  function renderSignupControl(){return `<section class="panel" style="margin-bottom:22px"><div class="flexbetween"><h2>فتح التسجيل للمطاعم</h2><span class="tag ${state.registrationOpen?'approved':'pending'}">${state.registrationOpen?'التسجيل مفتوح':'التسجيل مغلق مؤقتًا'}</span></div><p class="muted small">لما تكون مغلقة، المطاعم بتتواصل معنا عبر نموذج التواصل. فعّل التسجيل بعد ضبط SMTP والتحقق من رسالة التأكيد وتجربة حساب مستقل. لا يشمل هذا الخيار الدفع.</p><button class="btn ${state.registrationOpen?'outline':'gold'}" data-act="toggle-registration">${state.registrationOpen?'إيقاف التسجيل المباشر':'فتح التسجيل المباشر'}</button></section>`;}
  function renderAdmin(){const rests=state.restaurants, apps=state.applications;
    const count=s=>rests.filter(r=>r.status===s).length;
    root.innerHTML=`${shell('لوحة المدير العام','Super Admin · أنت تدير كل المطاعم والطلبات')}<main class="wrap dash"><div id="message">${errBox()}</div><div class="stats"><div class="stat"><strong>${rests.length}</strong><span>كل المطاعم</span></div><div class="stat"><strong>${count('pending')}</strong><span>طلبات قيد المراجعة</span></div><div class="stat"><strong>${count('approved')}</strong><span>مطاعم موافق عليها</span></div><div class="stat"><strong>${count('suspended')}</strong><span>حسابات موقوفة</span></div></div>${renderSignupControl()}<div class="actions" style="margin:16px 0 22px"><button class="btn gold" data-act="billingjump">💳 الاشتراكات والإيرادات</button><button class="btn outline" data-act="contactjump">✉️ رسائل التواصل</button></div><section class="panel"><div class="flexbetween"><h2>طلبات المطاعم وإدارتها</h2><button data-act="reload" class="btn outline small">تحديث</button></div>${rests.length?`<div class="tablewrap"><table class="table"><thead><tr><th>المطعم</th><th>مقدم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${rests.map(r=>{const a=apps.find(x=>x.restaurant_id===r.id);return `<tr><td><b>${e(r.name)}</b><div class="small muted">${e(r.city||'—')} · ${e(r.slug)}</div></td><td>${e(a?.contact_name||'—')}<div class="small muted">${e(a?.contact_email||'')}</div></td><td>${e(new Date(r.created_at).toLocaleDateString('ar'))}</td><td><span class="tag ${cls(r.status)}">${status(r.status)}</span></td><td><div class="actions">${r.status==='approved'?`<a class="btn soft small" href="#manage/${e(r.id)}">إدارة المنيو</a>`:''}${r.status!=='approved'?`<button class="btn soft small" data-act="approve" data-id="${e(r.id)}">موافقة</button>`:''}${r.status!=='rejected'?`<button class="btn danger small" data-act="reject" data-id="${e(r.id)}">رفض</button>`:''}${r.status==='approved'?`<button class="btn outline small" data-act="suspend" data-id="${e(r.id)}">إيقاف</button>`:''}</div></td></tr>`}).join('')}</tbody></table></div>`:`<div class="empty">ما في طلبات تسجيل مطاعم حتى الآن.</div>`}</section>${renderAdminBilling()}${renderAdminContacts()}<div class="panel" style="margin-top:22px"><h3>صلاحيات الإدارة</h3><p class="muted small">هذه اللوحة مخصصة لمدير TAFRIVO. عمليات الموافقة تُنفَّذ على قاعدة البيانات المحمية، مش مجرد إخفاء أزرار.</p><div class="small">User ID: <code class="display-url">${e(userId())}</code></div></div></main>${footer()}`;
  }
  async function changeStatus(id,newStatus){
    const r=state.restaurants.find(x=>x.id===id);if(!r)return;
    if(!confirm(`تأكيد تغيير حالة ${r.name} إلى «${status(newStatus)}»؟`))return;
    const values={status:newStatus};if(newStatus!=='approved')values.is_published=false;
    try{need(await sb.from('restaurants').update(values).eq('id',id).select('id').single());const app=state.applications.find(x=>x.restaurant_id===id);if(app){const note=newStatus==='approved'?'تمت الموافقة':newStatus==='rejected'?'تم الرفض':'تم إيقاف الحساب';need(await sb.from('restaurant_applications').update({reviewed_at:new Date().toISOString(),reviewer_notes:note}).eq('id',app.id));}flash(`تم تغيير حالة المطعم: ${status(newStatus)}`);await loadAdmin();}catch(err){flash(errText(err),'error');}
  }
  async function loadAdminRestaurant(){
    const id=state.restaurant?.id;
    const r=need(await sb.from('restaurants').select('*').eq('id',id).single());
    if(r.status!=='approved'){go('#app');return;}
    state.restaurant=r;
    const [c,i]=await Promise.all([
      sb.from('menu_categories').select('*').eq('restaurant_id',id).order('sort_order',{ascending:true}),
      sb.from('menu_items').select('*').eq('restaurant_id',id).order('sort_order',{ascending:true})
    ]);
    state.categories=need(c)||[];state.items=need(i)||[];renderOwner();
  }
  async function loadOwner(){if(state.role==='super_admin' && state.restaurant?.id){await loadAdminRestaurant();return;}state.restaurants=need(await sb.from('restaurants').select('*').eq('owner_id',userId()).order('created_at',{ascending:false}))||[];
    if(!state.restaurants.length){renderOnboarding();return;}
    if(!state.restaurant || !state.restaurants.some(x=>x.id===state.restaurant.id))state.restaurant=state.restaurants[0];
    state.restaurant=state.restaurants.find(x=>x.id===state.restaurant.id) || state.restaurants[0];
    if(state.restaurant.status!=='approved'){renderPending();return;}
    const [c,i]=await Promise.all([sb.from('menu_categories').select('*').eq('restaurant_id',state.restaurant.id).order('sort_order',{ascending:true}),sb.from('menu_items').select('*').eq('restaurant_id',state.restaurant.id).order('sort_order',{ascending:true})]);
    state.categories=need(c)||[];state.items=need(i)||[];renderOwner();
  }
  function renderOnboarding(){root.innerHTML=`${shell('تسجيل مطعمك','قدّم الطلب، وإدارة TAFRIVO بتراجعه قبل التفعيل')}<main class="wrap dash"><div id="message">${errBox()}</div><div class="two"><section class="panel"><h2>بيانات المطعم</h2><form data-form="restaurant-register"><div class="field"><label>اسم المطعم *</label><input name="name" required maxlength="160" placeholder="مثل: مطعم الزيتون"></div><div class="formgrid"><div class="field"><label>رابط المنيو (بالإنجليزية) *</label><input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" minlength="3" maxlength="60" required placeholder="al-zaytoon"></div><div class="field"><label>المدينة</label><input name="city" placeholder="عرابة"></div><div class="field"><label>اسم المسؤول *</label><input name="contact_name" required placeholder="الاسم الكامل"></div><div class="field"><label>رقم هاتف المسؤول *</label><input name="contact_phone" required type="tel" placeholder="05xxxxxxxx"></div><div class="field span2"><label>رقم واتساب للطلبات (اختياري)</label><input name="public_phone" type="tel" placeholder="9725xxxxxxxx"></div></div><button class="btn gold block">إرسال طلب التسجيل</button></form></section><aside class="panel"><div class="pending-icon">🛡️</div><h3>الاشتراك بموافقة المدير</h3><p class="muted">بعد تقديم طلبك، بتشوف حالته هون. ما بتقدر تعدّل المنيو أو تنشره قبل موافقة الإدارة.</p><hr style="border:0;border-top:1px solid var(--border);margin:20px 0"><h3>إعداد حساب Super Admin</h3><p class="small muted">إذا هذا حساب مالك المنصة، انسخ معرّف المستخدم وأرسله لإدارة إعداد المشروع لمنحه الصلاحية من قاعدة البيانات. التسجيل العادي لا يعطي هذه الصلاحية.</p><button class="btn outline small" data-act="copy" data-value="${e(userId())}">نسخ معرّف الحساب</button><p class="small display-url muted">${e(userId())}</p></aside></div></main>${footer()}`;}
  function renderPending(){const r=state.restaurant;root.innerHTML=`${shell('حساب مطعمك','حالة طلب التسجيل')}<main class="wrap dash"><div id="message">${errBox()}</div><section class="panel empty-panel" style="max-width:650px;margin:auto"><div class="pending-icon">${r.status==='pending'?'⏳':r.status==='rejected'?'📝':'⛔'}</div><h2>${e(r.name)}</h2><span class="tag ${cls(r.status)}">${status(r.status)}</span><p style="margin-top:20px" class="muted">${r.status==='pending'?'طلبك وصل وبانتظار مراجعة الإدارة.':r.status==='rejected'?'تم رفض الطلب. تواصل مع إدارة TAFRIVO لمزيد من التفاصيل.':'الحساب موقوف مؤقتًا، تواصل مع إدارة المنصة.'}</p><button data-act="reload" class="btn outline">تحديث الحالة</button><div class="small muted display-url" style="margin-top:19px">User ID: ${e(userId())}</div></section></main>${footer()}`;}
  function tabs(){return `<div class="page-tabs">${[['items','الأكلات والأسعار'],['categories','أقسام المنيو'],['settings','إعدادات المطعم'],['qr','الرابط و QR']].map(([id,label])=>`<button data-act="tab" data-id="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</div>`;}
  function ownerItems(){const r=state.restaurant,its=state.items,cat=state.categories;const editing=its.find(x=>x.id===state.itemEdit);
    return `<div class="two"><section class="panel"><h2>${editing?'تعديل أكلة':'أضف أكلة جديدة'}</h2><form data-form="item-save"><div class="formgrid"><div class="field"><label>الاسم بالعربي *</label><input name="name_ar" value="${e(editing?.name_ar||'')}" required></div><div class="field"><label>الاسم بالعبري</label><input name="name_he" value="${e(editing?.name_he||'')}"></div><div class="field"><label>الاسم بالإنجليزي</label><input name="name_en" value="${e(editing?.name_en||'')}"></div><div class="field"><label>القسم *</label><select name="category_id" required><option value="">اختار القسم</option>${cat.map(c=>`<option value="${e(c.id)}" ${editing?.category_id===c.id?'selected':''}>${e(c.name_ar||c.name_he||c.name_en)}</option>`).join('')}</select></div><div class="field"><label>السعر (₪) *</label><input name="price_ils" type="number" min="0" step="0.01" required value="${e(editing?.price_ils??'')}"></div><div class="field"><label>صورة الأكلة ${editing?'(اختياري للتغيير)':''}</label><input class="upload" type="file" name="image_file" accept="image/jpeg,image/png,image/webp"></div><div class="field span2"><label>وصف بالعربي</label><textarea name="description_ar">${e(editing?.description_ar||'')}</textarea></div><div class="field span2"><label>وصف بالعبري</label><textarea name="description_he">${e(editing?.description_he||'')}</textarea></div><div class="field span2"><label>وصف بالإنجليزي</label><textarea name="description_en">${e(editing?.description_en||'')}</textarea></div><div class="field"><label><input name="is_available" type="checkbox" ${!editing||editing.is_available?'checked':''}> متوفرة</label></div><div class="field"><label><input name="is_visible" type="checkbox" ${!editing||editing.is_visible?'checked':''}> ظاهرة بالمنيو</label></div></div><button class="btn gold" ${cat.length?'':'disabled'}>${editing?'حفظ التغييرات':'إضافة الأكلة'}</button>${editing?` <button type="button" class="btn outline" data-act="cancel-edit">إلغاء</button>`:''}</form>${!cat.length?'<div class="banner warn">أضف قسم من تبويب الأقسام أولًا.</div>':''}</section><section class="panel"><h2>الأكلات (${its.length})</h2>${its.length?`<div class="listcards">${its.map(it=>`<div class="listcard"><div style="display:flex;gap:12px;align-items:center">${url(it.image_url)?`<img src="${url(it.image_url)}" alt="" style="width:65px;height:65px;border-radius:11px;object-fit:cover">`:''}<div><h3>${e(it.name_ar||it.name_he||it.name_en)}</h3><p>${money(it.price_ils)} · ${it.is_available?'متوفرة':'نفدت'} · ${it.is_visible?'ظاهرة':'مخفية'}</p></div></div><div class="actions"><button class="btn outline small" data-act="edit-item" data-id="${e(it.id)}">تعديل</button><button class="btn danger small" data-act="delete-item" data-id="${e(it.id)}">حذف</button></div></div>`).join('')}</div>`:'<div class="empty">لسه ما أضفت أكلات.</div>'}</section></div>`;}
  function ownerCategories(){return `<div class="two"><section class="panel"><h2>إضافة قسم جديد</h2><form data-form="category-create"><div class="field"><label>اسم القسم بالعربي *</label><input name="name_ar" required placeholder="مثل: مشاوي"></div><div class="field"><label>اسم القسم بالعبري</label><input name="name_he" placeholder="גריל"></div><div class="field"><label>اسم القسم بالإنجليزي</label><input name="name_en" placeholder="Grill"></div><button class="btn gold">إضافة القسم</button></form></section><section class="panel"><h2>الأقسام (${state.categories.length})</h2>${state.categories.length?`<div class="listcards">${state.categories.map(c=>`<div class="listcard"><div><h3>${e(c.name_ar||c.name_he||c.name_en)}</h3><p>${e(c.name_he||'')} ${c.name_en? ' · '+e(c.name_en):''}</p></div><span class="tag">${state.items.filter(it=>it.category_id===c.id).length} أكلات</span></div>`).join('')}</div>`:'<div class="empty">لا توجد أقسام بعد.</div>'}</section></div>`;}
  function ownerSettings(){const r=state.restaurant;return `<section class="panel" style="max-width:720px"><h2>إعدادات المطعم</h2><form data-form="restaurant-settings"><div class="field"><label>الاسم</label><input name="name" value="${e(r.name)}" required></div><div class="field"><label>المدينة</label><input name="city" value="${e(r.city||'')}"></div><div class="field"><label>الوصف</label><textarea name="description">${e(r.description||'')}</textarea></div><div class="field"><label>رقم واتساب للطلبات</label><input name="public_phone" value="${e(r.public_phone||'')}"></div><div class="field"><label><input type="checkbox" name="is_published" ${r.is_published?'checked':''}> نشر المنيو للزبائن</label></div><button class="btn gold">حفظ إعدادات المطعم</button></form></section>`;}
  function ownerQR(){const r=state.restaurant,link=`${location.origin}${location.pathname}#menu/${encodeURIComponent(r.slug)}`;return `<section class="panel"><h2>رابط المنيو ورمز QR</h2><p class="muted">هذا الرابط ثابت. أي تغيير على المنيو بيظهر على نفس الرابط.</p><div class="qrbox"><div><div id="qr-target"></div></div><div style="flex:1;min-width:220px"><div class="banner ${r.is_published?'':'warn'}">${r.is_published?'المنيو منشور للزبائن':'المنيو غير منشور. فعّله من الإعدادات حتى يفتح للزبائن.'}</div><p class="display-url">${e(link)}</p><div class="actions"><button class="btn soft" data-act="copy" data-value="${e(link)}">نسخ الرابط</button><a class="btn outline" href="#menu/${encodeURIComponent(r.slug)}" target="_blank" rel="noopener">معاينة المنيو</a><button class="btn outline" data-act="download-qr">تنزيل QR</button></div></div></div></section>`;}
  function renderOwner(){const r=state.restaurant;root.innerHTML=`${shell(state.role==='super_admin'?'إدارة منيو المطعم':'لوحة مطعمك',`أهلًا في ${e(r.name)} · حسابك مُفعّل`,r.is_published?'<span class="tag approved">المنيو منشور</span>':'<span class="tag pending">المنيو غير منشور</span>')}${state.role==='super_admin'?'<div class="wrap" style="padding-top:18px"><a class="btn outline small" href="#app">← العودة للوحة المدير</a></div>':''}<main class="wrap dash"><div id="message">${errBox()}</div><div class="stats"><div class="stat"><strong>${state.categories.length}</strong><span>الأقسام</span></div><div class="stat"><strong>${state.items.length}</strong><span>الأكلات</span></div><div class="stat"><strong>${state.items.filter(x=>x.is_available).length}</strong><span>الأكلات المتوفرة</span></div><div class="stat"><strong>${r.is_published?'✓':'—'}</strong><span>حالة النشر</span></div></div>${tabs()}${state.tab==='categories'?ownerCategories():state.tab==='settings'?ownerSettings():state.tab==='qr'?ownerQR():ownerItems()}</main>${footer()}`;
    if(state.tab==='qr')drawQR();
  }
  function drawQR(){const target=document.getElementById('qr-target');if(!target)return;const r=state.restaurant,link=`${location.origin}${location.pathname}#menu/${encodeURIComponent(r.slug)}`;if(window.QRCode?.toCanvas){const canvas=document.createElement('canvas');target.append(canvas);window.QRCode.toCanvas(canvas,link,{width:218,margin:2,color:{dark:'#103c2c',light:'#ffffff'}}).catch(()=>{target.textContent='تعذر رسم QR';});}else target.innerHTML='<div class="banner warn">مكتبة QR غير متاحة. انسخ الرابط لحين تشغيلها.</div>';}
  function foodLang(obj,key){const lang=state.lang;return obj[`${key}_${lang}`]||obj[`${key}_ar`]||obj[`${key}_he`]||obj[`${key}_en`]||'';}
  const textLang = (ar,he,en)=>state.lang==='he'?he:state.lang==='en'?en:ar;
  async function openMenu(slug){if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){menuUnavailable();return;}
    try{const r=need(await sb.from('restaurants').select('id,name,description,slug,public_phone,logo_url,cover_url').eq('slug',slug).eq('status','approved').eq('is_published',true).maybeSingle());if(!r){menuUnavailable();return;}const [c,i]=await Promise.all([sb.from('menu_categories').select('*').eq('restaurant_id',r.id).eq('is_visible',true).order('sort_order'),sb.from('menu_items').select('*').eq('restaurant_id',r.id).eq('is_visible',true).order('sort_order')]);state.menu={restaurant:r,cats:need(c)||[],items:need(i)||[]};renderMenu();}catch(err){root.innerHTML=`${nav()}<main class="wrap section"><div class="banner error">تعذر تحميل المنيو: ${e(errText(err))}</div></main>`;}
  }
  function menuUnavailable(){root.innerHTML=`${nav()}<section class="wrap section"><div class="panel empty-panel"><h2>المنيو غير متاح حاليًا</h2><p class="muted">قد يكون المطعم بانتظار الموافقة أو لم ينشر المنيو بعد.</p><a class="btn" href="#">الصفحة الرئيسية</a></div></section>${footer()}`;}
  function renderMenu(){const d=state.menu;if(!d)return;const r=d.restaurant,lang=state.lang;document.title=`${r.name} | TAFRIVO`;
    root.innerHTML=`<div class="menu-page" dir="${lang==='en'?'ltr':'rtl'}"><div class="menu-hero"><div class="wrap"><div class="menu-nav">${brand()}<div class="lang-switch">${['ar','he','en'].map(x=>`<button data-act="lang" data-id="${x}" class="${lang===x?'active':''}">${x.toUpperCase()}</button>`).join('')}</div></div><h1>${e(r.name)}</h1><p>${e(r.description||textLang('تصفح القائمة واختر ما تحب','בחרו מנות מהתפריט','Browse the menu and choose your favorites'))}</p></div></div><div class="menu-sticky"><div class="wrap">${d.cats.map(c=>`<a href="#cat-${e(c.id)}" data-act="scrollcat" data-id="${e(c.id)}">${e(foodLang(c,'name'))}</a>`).join('')}</div></div><main class="menu-main">${d.cats.map(c=>{const its=d.items.filter(i=>i.category_id===c.id);return `<section id="cat-${e(c.id)}"><h2 class="menu-cat">${e(foodLang(c,'name'))}</h2>${its.length?its.map(it=>`<article class="itemcard"><div class="item-right">${url(it.image_url)?`<img src="${url(it.image_url)}" alt="">`:''}<div><h3>${e(foodLang(it,'name'))}</h3><p>${e(foodLang(it,'description'))}</p><div class="item-price">${money(it.price_ils)}</div></div></div><div><button class="btn ${it.is_available?'gold':'outline'} small" ${it.is_available?'':'disabled'} data-act="cartadd" data-id="${e(it.id)}">${it.is_available?textLang('إضافة','הוסף','Add'):textLang('نفدت','אזל','Sold out')}</button></div></article>`).join(''):`<p class="muted">${textLang('لا توجد أصناف بهذا القسم','אין מנות בקטגוריה','No items in this category')}</p>`}</section>`}).join('')}${!d.cats.length?`<div class="empty">${textLang('المنيو لسه ما فيه أكلات','התפריט עדיין ריק','Menu is empty for now')}</div>`:''}<div style="text-align:center;margin-top:40px;color:var(--muted);font-size:11px">Powered by TAFRIVO</div></main>${cartView()}</div>`;
  }
  function cartView(){if(!state.menu)return '';const items=state.menu.items,orders=Object.entries(state.cart).filter(([_,qty])=>qty>0).map(([id,qty])=>({item:items.find(x=>x.id===id),qty})).filter(x=>x.item);if(!orders.length)return '';
    const total=orders.reduce((s,x)=>s+Number(x.item.price_ils)*x.qty,0);
    return `<div class="cartbar"><div><b>${textLang('طلبك','ההזמנה שלך','Your order')} (${orders.reduce((s,x)=>s+x.qty,0)})</b><div class="small">${money(total)}</div></div><div class="actions"><button data-act="cartview">${textLang('مراجعة الطلب','צפה בהזמנה','Review')}</button></div></div>`;
  }
  function renderCart(){const d=state.menu,entries=Object.entries(state.cart).filter(([_,q])=>q>0).map(([id,q])=>({item:d.items.find(i=>i.id===id),q})).filter(x=>x.item),total=entries.reduce((s,x)=>s+x.item.price_ils*x.q,0);
    root.innerHTML=`${nav(`<button class="btn outline" data-act="backtomenu">رجوع للمنيو</button>`)}<main class="wrap section" style="max-width:760px"><section class="panel"><h2>${textLang('مراجعة الطلب','סיכום הזמנה','Order summary')}</h2>${entries.length?entries.map(x=>`<div class="listcard"><div><h3>${e(foodLang(x.item,'name'))}</h3><p>${money(x.item.price_ils)} × ${x.q}</p></div><div class="actions"><button class="btn outline small" data-act="cartminus" data-id="${e(x.item.id)}">−</button><b>${x.q}</b><button class="btn outline small" data-act="cartplus" data-id="${e(x.item.id)}">+</button></div></div>`).join(''):'<div class="empty">السلة فارغة</div>'}<h2 style="margin-top:20px">${textLang('المجموع','סה״כ','Total')}: ${money(total)}</h2><div class="field"><label>${textLang('رقم الطاولة أو ملاحظة (اختياري)','מספר שולחן או הערה','Table number / note')}</label><input id="cart-note" placeholder="مثل: طاولة 4"></div><button ${entries.length?'':'disabled'} data-act="sendorder" class="btn gold block">${textLang('إرسال الطلب عبر واتساب','שלח הזמנה בוואטסאפ','Send via WhatsApp')}</button><p class="hint" style="margin-top:13px">${textLang('هذه نسخة طلب عبر واتساب، وليست نظام دفع أو إرسال مباشر للمطبخ.','ההזמנה נשלחת דרך וואטסאפ.','Orders are prepared for WhatsApp, not automatically sent to the kitchen.')}</p></section></main>${footer()}`;
  }
  function safePhone(v){let p=String(v||'').replace(/[^\d]/g,'');if(p.startsWith('00'))p=p.slice(2);if(p.startsWith('0'))p='972'+p.slice(1);return p;}
  async function submitForm(form){const type=form.dataset.form,F=new FormData(form),g=k=>String(F.get(k)||'').trim();const button=form.querySelector('[type=submit],button:not([type])');if(button)button.disabled=true;try{
    if(type==='login'){need(await sb.auth.signInWithPassword({email:g('email'),password:g('password')}));clearNotice();go('#app');return;}
    if(type==='forgot-password'){need(await sb.auth.resetPasswordForEmail(g('email'),{redirectTo:location.origin+location.pathname+'#reset-password'}));flash('إذا البريد مسجّل، رح يصلك رابط استعادة بعد إعداد خدمة البريد.');return;}
    if(type==='reset-password'){if(g('password').length<12)throw Error('كلمة المرور الجديدة لازم تكون 12 حرفًا أو أكثر.');need(await sb.auth.updateUser({password:g('password')}));await sb.auth.signOut();alert('تم تغيير كلمة المرور. سجّل دخولك بكلمة المرور الجديدة.');go('#login');return;}
    if(type==='signup'){
      if(!state.registrationOpen)throw Error('التسجيل التجريبي عن طريق نموذج التواصل حاليًا.');
      if(g('password').length<12)throw Error('اختار كلمة مرور من 12 حرفًا على الأقل.');
      const options={};if(location.protocol==='http:'||location.protocol==='https:')options.emailRedirectTo=location.origin+location.pathname;
      need(await sb.auth.signUp({email:g('email'),password:g('password'),options}));flash('تم تقديم التسجيل. افحص بريدك الإلكتروني لتأكيد الحساب، ثم سجل الدخول.','');return;
    }
    if(type==='restaurant-register'){
      const row={owner_id:userId(),name:g('name'),slug:g('slug').toLowerCase(),city:g('city'),public_phone:g('public_phone'),status:'pending',is_published:false};
      const restaurant=need(await sb.from('restaurants').insert(row).select('id').single());
      try{need(await sb.from('restaurant_applications').insert({restaurant_id:restaurant.id,contact_name:g('contact_name'),contact_email:state.user?.email||'',contact_phone:g('contact_phone')}));}catch(appError){console.warn('registration details:',errText(appError));}
      clearNotice();await loadOwner();return;
    }
    if(type==='category-create'){
      need(await sb.from('menu_categories').insert({restaurant_id:state.restaurant.id,name_ar:g('name_ar'),name_he:g('name_he'),name_en:g('name_en'),sort_order:state.categories.length}));flash('تم إضافة القسم بنجاح');await loadOwner();return;
    }
    if(type==='restaurant-settings'){
      need(await sb.from('restaurants').update({name:g('name'),city:g('city'),description:g('description'),public_phone:g('public_phone'),is_published:F.has('is_published')}).eq('id',state.restaurant.id).select('id').single());flash('تم حفظ إعدادات المطعم');await loadOwner();return;
    }
    if(type==='item-save'){
      const row={restaurant_id:state.restaurant.id,category_id:g('category_id'),name_ar:g('name_ar'),name_he:g('name_he'),name_en:g('name_en'),description_ar:g('description_ar'),description_he:g('description_he'),description_en:g('description_en'),price_ils:Number(g('price_ils')),is_available:F.has('is_available'),is_visible:F.has('is_visible')};
      const file=F.get('image_file');if(file instanceof File && file.size>0){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP.');if(file.size>5*1024*1024)throw Error('الصورة أكبر من 5MB.'); const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[file.type];const path=`${state.restaurant.id}/${crypto.randomUUID()}.${ext}`;need(await sb.storage.from('menu-images').upload(path,file,{contentType:file.type,upsert:false}));row.image_url=sb.storage.from('menu-images').getPublicUrl(path).data.publicUrl;}
      if(state.itemEdit){const id=state.itemEdit;need(await sb.from('menu_items').update(row).eq('id',id).select('id').single());state.itemEdit=null;flash('تم تعديل الأكلة');}else{row.sort_order=state.items.length;need(await sb.from('menu_items').insert(row).select('id').single());flash('تم إضافة الأكلة');}
      await loadOwner();return;
    }
  }catch(err){flash(errText(err),'error');}finally{if(button)button.disabled=false;}}
  async function handleClick(el){const act=el.dataset.act,id=el.dataset.id;
    if(act==='signout'){await sb.auth.signOut();state.user=null;state.restaurant=null;state.menu=null;state.cart={};go('#');return;}
    if(act==='reload'){clearNotice();route();return;}
    if(act==='toggle-registration'){const target=!state.registrationOpen;if(target&&!confirm('هل ضبطت SMTP واختبرت إرسال الإيميلات وتسجيل مطعم مستقل؟'))return;try{need(await sb.from('site_settings').update({registration_open:target}).eq('id',1).select('id').single());state.registrationOpen=target;await loadAdmin();}catch(err){flash(errText(err),'error');}return;}
    if(act==='billingjump'){document.getElementById('billing-overview')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(act==='contactjump'){document.getElementById('contact-inbox')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(act==='contact-handled'){try{need(await sb.from('contact_messages').update({status:'handled',handled_at:new Date().toISOString()}).eq('id',id).select('id').single());await loadAdmin();}catch(err){flash(errText(err),'error');}return;}
    if(['approve','reject','suspend'].includes(act)){await changeStatus(id,({approve:'approved',reject:'rejected',suspend:'suspended'})[act]);return;}
    if(act==='tab'){state.tab=id;state.itemEdit=null;clearNotice();renderOwner();return;}
    if(act==='cancel-edit'){state.itemEdit=null;renderOwner();return;}
    if(act==='edit-item'){state.itemEdit=id;renderOwner();window.scrollTo({top:240,behavior:'smooth'});return;}
    if(act==='delete-item'){const item=state.items.find(x=>x.id===id);if(!item||!confirm(`حذف «${item.name_ar||item.name_he}»؟`))return;try{need(await sb.from('menu_items').delete().eq('id',id));flash('تم حذف الأكلة');await loadOwner();}catch(err){flash(errText(err),'error');}return;}
    if(act==='copy'){try{await navigator.clipboard.writeText(el.dataset.value||'');flash('تم نسخ الرابط / المعرّف');}catch{prompt('انسخ النص:',el.dataset.value||'');}return;}
    if(act==='download-qr'){const canvas=document.querySelector('#qr-target canvas');if(!canvas){flash('رمز QR مش جاهز','error');return;}const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`TAFRIVO-${state.restaurant.slug}-QR.png`;a.click();return;}
    if(act==='lang'){state.lang=id;renderMenu();return;}
    if(act==='scrollcat'){document.getElementById('cat-'+id)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(act==='cartadd'||act==='cartplus'){state.cart[id]=(state.cart[id]||0)+1;if(act==='cartplus')renderCart();else renderMenu();return;}
    if(act==='cartminus'){state.cart[id]=Math.max(0,(state.cart[id]||0)-1);renderCart();return;}
    if(act==='cartview'){renderCart();return;}
    if(act==='backtomenu'){renderMenu();return;}
    if(act==='sendorder'){
      const entries=Object.entries(state.cart).filter(([,q])=>q>0).map(([id,q])=>({item:state.menu.items.find(x=>x.id===id),q})).filter(x=>x.item);
      if(!entries.length)return;
      const total=entries.reduce((s,x)=>s+x.item.price_ils*x.q,0), note=String(document.querySelector('#cart-note')?.value||'').trim();
      const msg=[`طلب جديد من منيو ${state.menu.restaurant.name}`,'',...entries.map(x=>`${x.q} × ${foodLang(x.item,'name')} — ${money(x.item.price_ils*x.q)}`),'',`المجموع: ${money(total)}`,note?`ملاحظة/طاولة: ${note}`:''].filter(Boolean).join('\n');
      const phone=safePhone(state.menu.restaurant.public_phone);
      if(!phone){try{await navigator.clipboard.writeText(msg);alert('المطعم ما حدّد رقم واتساب. نسخنا نص الطلب، ممكن تشاركه مع المطعم.');}catch{prompt('انسخ الطلب:',msg);}return;}
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');return;
    }
  }
  root.addEventListener('submit',ev=>{const form=ev.target.closest('form[data-form]');if(form){ev.preventDefault();submitForm(form);}});
  document.addEventListener('click',ev=>{const el=ev.target.closest('[data-act]');if(!el)return;ev.preventDefault();handleClick(el);});
  window.addEventListener('hashchange',()=>{clearNotice();route();});
  sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')go('#reset-password');if(event==='SIGNED_OUT' && location.hash==='#app')go('#login');});
  (async()=>{loading();await refreshPublicSettings();route();})();
})();
