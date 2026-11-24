/* TAFRIVO Smart Pager — staff-verified WhatsApp import, no anonymous draft queue.
   Future Web Push is separate: this pilot uses a status page (foreground notifications only). */
(() => {
  'use strict';
  if (!window.supabase || !window.TAFRIVO_CONFIG) return;
  const conf=window.TAFRIVO_CONFIG;
  const sb=window.supabase.createClient(conf.SUPABASE_URL,conf.SUPABASE_PUBLISHABLE_KEY);
  const root=()=>document.getElementById('app');
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const t=(a,h,en)=>{let lang='ar';try{lang=localStorage.getItem('tafrivo-lang')||document.documentElement.lang||'ar';}catch{}return lang==='he'?h:lang==='en'?en:a;};
  const val=r=>{if(r?.error)throw r.error;return r.data;};
  const link=h=>location.origin+location.pathname+'#'+h;
  const short=id=>String(id||'').slice(0,8).toUpperCase();
  const price=x=>Number(x||0).toLocaleString('he-IL',{maximumFractionDigits:2})+' ₪';
  const msg=e=>e?.message||String(e||'حدث خطأ');
  const heading=title=>'<div class="pager-page"><header class="pager-header"><a href="#" class="pager-brand">✦ TAFRIVO</a><span>SMART PAGER</span></header><main class="pager-container">'+title+'</main><footer class="pager-footer">Powered by OZA APEX</footer></div>';
  const dateFmt=x=>new Date(x).toLocaleString('ar-IL',{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'});
  let poll=null,lastStatus=null,ownerRestaurant=null,ownerPanel=null,ownerOrders=[];
  function stop(){if(poll)clearInterval(poll);poll=null;lastStatus=null;}
  const pendingKey='tafrivo-pager-pending-import';
  function pendingImport(restaurantId){
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
    if(!saved?.encoded||!saved.restaurant_id||!Number.isFinite(saved.issued_at))return null;
    const elapsed=Date.now()-saved.issued_at;
    if(elapsed< -60000||elapsed>=600000){try{sessionStorage.removeItem(pendingKey)}catch{}return null;}
    return restaurantId&&saved.restaurant_id!==restaurantId?null:saved;
  }
  function rememberImport(encoded){
    try{
      const value=decodeB64(encoded),payload=value?.payload;
      if(!payload?.restaurant_id||!/^[0-9a-f]{64}$/.test(value.token))return;
      const issued_at=Number(payload.issued_at);
      if(!Number.isFinite(issued_at)||issued_at>Date.now()+60000||Date.now()-issued_at>=600000)return;
      sessionStorage.setItem(pendingKey,JSON.stringify({encoded,restaurant_id:payload.restaurant_id,issued_at}));
    }catch{}
  }
  function clearImport(encoded){
    try{if(pendingImport()?.encoded===encoded)sessionStorage.removeItem(pendingKey);}catch{}
  }
  const shortPendingKey='tafrivo-pager-confirm-short';
  function pendingShort(){
    try{
      const p=JSON.parse(sessionStorage.getItem(shortPendingKey)||'null');
      if(!p||!/^[0-9A-F]{16}$/.test(p.code)||Date.now()-p.saved_at>600000||Date.now()<p.saved_at-60000)return null;
      return p.code;
    }catch{return null;}
  }
  function rememberShort(code){
    try{sessionStorage.setItem(shortPendingKey,JSON.stringify({code,saved_at:Date.now()}));}catch{}
  }
  function clearShort(code){
    try{if(pendingShort()===code)sessionStorage.removeItem(shortPendingKey);}catch{}
  }
  function resumeAfterLogin(){
    const shortCode=pendingShort();
    if(shortCode)return '#pager/confirm/'+shortCode;
    const p=pendingImport();return p?'#pager/import/'+p.encoded:null;
  }
  function extractImportHash(value){
    const raw=String(value||'').trim();
    if(raw.length>10000)throw Error(t('الرابط طويل جدًا','הקישור ארוך מדי','Link too long'));
    const links=raw.match(/https?:\/\/[^\s<>"']+/g)||[];
    const fragments=links.length?[]:(raw.match(/#pager\/import\/[A-Za-z0-9_-]+/g)||[]);
    const options=[raw,...links,...fragments];
    for(const option of options){
      try{
        const u=new URL(option,location.origin+location.pathname);
        if(u.origin!==location.origin||u.pathname.replace(/\/+$/,'/')!==location.pathname.replace(/\/+$/,'/'))continue;
        if(!/^#pager\/import\/[A-Za-z0-9_-]{12,7000}$/.test(u.hash))continue;
        const envelope=decodeB64(u.hash.slice('#pager/import/'.length));
        if(envelope?.payload?.restaurant_id&&/^[0-9a-f]{64}$/.test(envelope.token))return u.hash;
      }catch{}
    }
    throw Error(t('الصق رابط تأكيد الطلب الموجود برسالة واتساب.','הדביקו קישור אישור מהודעת WhatsApp.','Paste the WhatsApp order confirmation link.'));
  }
  const utf8B64=x=>{
    const bytes=new TextEncoder().encode(x);
    let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  const decodeB64=s=>{
    if(!/^[A-Za-z0-9_-]{12,7000}$/.test(s))throw Error(t('رابط غير صالح','קישור לא תקין','Invalid link'));
    const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,ch=>ch.charCodeAt(0))));
  };
  const randomHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
  function prepareCheckout({restaurant,entries,kind,table,note,lang,readyWhatsApp='',readyConsent=false}){
    if(!restaurant?.id||!['table','takeaway'].includes(kind)||!Array.isArray(entries)||!entries.length||entries.length>12)
      throw Error(t('تعذّر تحضير رابط المتابعة','לא ניתן להכין קישור מעקב','Cannot prepare tracking link'));
    const lines=entries.map(x=>({id:x.item.id,qty:x.q,option:x.option||''}));
    const payload={restaurant_id:restaurant.id,client_ref:crypto.randomUUID(),issued_at:Date.now(),kind,table:kind==='table'?table:'',note,lang:lang||'ar',lines};
    if(readyConsent){payload.ready_whatsapp_consent=true;payload.ready_whatsapp=readyWhatsApp;}
    const fingerprint=JSON.stringify({id:restaurant.id,lines,kind,table,note,lang,readyWhatsApp,readyConsent});
    const key='tafrivo-pager-checkout';
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
    if(saved?.fingerprint===fingerprint&&Date.now()-saved.ts<9*60*1000&&saved.envelope?.token)
      return build(saved.envelope);
    const envelope={payload,token:randomHex()};
    try{sessionStorage.setItem(key,JSON.stringify({fingerprint,ts:Date.now(),envelope}));}catch{}
    return build(envelope);
  }
  function lastTracking(restaurantId){
    try{
      const saved=JSON.parse(sessionStorage.getItem('tafrivo-pager-checkout')||'null');
      if(!saved?.envelope?.payload||saved.envelope.payload.restaurant_id!==restaurantId||Date.now()-saved.ts>24*60*60*1000)return null;
      return build(saved.envelope);
    }catch{return null;}
  }
  function build(envelope){
    const {payload,token}=envelope;
    const staff=link('pager/import/'+utf8B64(JSON.stringify(envelope)));
    const tracking=link('pager/track/'+payload.client_ref+'/'+token);
    return {tracking,reference:short(payload.client_ref),
      suffix:'\n\n🔐 TAFRIVO SMART PAGER\nمرجع الطلب: #'+short(payload.client_ref)+
      '\nلصاحب المطعم فقط — بعد التأكد من رسالة واتساب، افتح الرابط واضغط قبول:\n'+staff+
      '\n\nلا يبدأ التحضير ولا المتابعة قبل تأكيد صاحب المطعم.'};
  }
  async function prepareQuickCheckout(args){
    const old=prepareCheckout(args);
    const saved=JSON.parse(sessionStorage.getItem('tafrivo-pager-checkout')||'null');
    if(!saved?.envelope?.payload||!saved.envelope.token)throw Error(t('تعذّر تجهيز كود الطلب','לא ניתן להכין קוד הזמנה','Could not prepare order code'));
    const result=val(await sb.rpc('pager_prepare_short_order',{
      p_payload:saved.envelope.payload,p_token:saved.envelope.token
    }));
    const code=String(result?.code||'');
    if(!/^[0-9A-F]{16}$/.test(code))throw Error(t('تعذّر إنشاء كود التأكيد','לא נוצר קוד אישור','Confirmation code unavailable'));
    const shortUrl=link('pager/confirm/'+code);
    return {...old,code,
      suffix:'\n\n📟 TAFRIVO SMART PAGER'+
      '\nكود التأكيد: '+code+
      '\n✅ لصاحب المطعم فقط: اضغط رابط التأكيد التالي بعد وصول الطلب والتحقق منه:'+
      '\n'+shortUrl+
      '\nلا يبدأ التحضير إلا بعد قبول المطعم.'};
  }
  function showTrackingLink(container,details){
    if(!container||!details)return;
    container.innerHTML='<div class="pager-tracking-link"><b>📟 '+t('رابط متابعة طلبك','קישור מעקב הזמנה','Your order tracker')+' #'+esc(details.reference)+'</b><p>'+t('بعد ما تبعث رسالة واتساب، صاحب المطعم لازم يقبل الطلب أولًا. اضغط على الرابط التالي واحفظه.','יש לשלוח את הודעת WhatsApp. המעקב מתחיל רק לאחר אישור המסעדה.','Send your WhatsApp message. Tracking starts only after the restaurant approves.')+'</p><a class="btn gold" href="'+esc(details.tracking)+'">'+t('متابعة طلبي','מעקב הזמנה','Track order')+'</a></div>';
  }
  function customerStatus(status){
    const label={waiting:t('بانتظار تأكيد المطعم','ממתין לאישור המסעדה','Awaiting restaurant confirmation'),
      accepted:t('تم قبول الطلب','ההזמנה התקבלה','Order accepted'),
      preparing:t('جاري تحضير طلبك','בהכנה','Preparing your order'),
      ready:t('طلبك جاهز للاستلام!','ההזמנה מוכנה לאיסוף!','Your order is ready!'),
      collected:t('تم تسليم الطلب','ההזמנה נמסרה','Order collected'),
      cancelled:t('تم إلغاء الطلب','ההזמנה בוטלה','Order cancelled')};
    return label[status]||status;
  }
  async function showTracking(ref,token,{silent=false}={}){
    if(!/^[0-9a-f-]{36}$/i.test(ref)||!/^[0-9a-f]{64}$/.test(token)){
      root().innerHTML=heading('<div class="banner error">Invalid tracking link</div>');return;
    }
    if(!silent){stop();root().innerHTML=heading('<div class="pager-card"><p>'+t('جاري فحص طلبك…','בודק הזמנה…','Checking order…')+'</p></div>');}
    try{
      const data=val(await sb.rpc('pager_get_tracking',{p_client_ref:ref,p_token:token}));
      const state=data?.found?data.status:'waiting';
      if(silent&&state===lastStatus)return;
      const ready=state==='ready',count=['accepted','preparing','ready','collected'].indexOf(state);
      const steps=['accepted','preparing','ready'];
      const items=Array.isArray(data?.items)?data.items:[];
      root().innerHTML=heading(
        '<section class="pager-phone"><div class="pager-topline"><strong>TAFRIVO</strong><span>SMART PAGER</span></div>'+
        '<div class="pager-logo">🍔</div><h2>'+esc(data?.restaurant_name||t('متابعة طلبك','מעקב הזמנה','Order tracking'))+'</h2>'+
        '<p class="pager-code">#'+esc(short(ref))+'</p><div class="pager-bigicon">'+(ready?'✅':state==='preparing'?'👨‍🍳':state==='cancelled'?'⛔':'⏳')+'</div>'+
        '<h3>'+esc(customerStatus(state))+'</h3>'+
        '<div class="pager-progress">'+steps.map((s,i)=>'<span class="'+(count>=i?'done':'')+'"></span>').join('')+'</div>'+
        '<p class="pager-detail">'+(state==='waiting'?t('ما وصلنا تأكيد قبول من المطعم. لازم تبعث رسالة واتساب ويقبلها صاحب المطعم خلال 10 دقائق.','יש לשלוח WhatsApp ולהמתין לאישור תוך 10 דקות.','Send the WhatsApp message and wait for staff confirmation within 10 minutes.'):ready?t('تفضل على الكاونتر لاستلام طلبك.','אפשר להגיע לדלפק לאיסוף.','Please collect your order at the counter.'):state==='preparing'?t('المطعم عم يجهز وجبتك.','המנה שלכם בהכנה.','Your food is being prepared.'):state==='accepted'?t('المطعم تأكد من الطلب وقبله.','המסעדה אישרה את ההזמנה.','The restaurant confirmed your order.'):state==='cancelled'?t('تواصل مع المطعم لأي استفسار.','נא ליצור קשר עם המסעדה.','Please contact the restaurant.'):t('شكرًا لاختياركم المطعم.','תודה שבחרתם בנו.','Thank you.'))+'</p>'+
        (items.length?'<div class="pager-items">'+items.map(x=>'<div><span>'+esc(x.qty)+' × '+esc(x.name)+(x.bread?' ('+esc(x.bread==='wrap'?'لفة':'بجيت')+')':'')+'</span><span>'+price(Number(x.price)*Number(x.qty))+'</span></div>').join('')+'<strong>'+t('المجموع','סה״כ','Total')+': '+price(data.total)+'</strong></div>':'')+
        '<button data-pager-action="notify" class="btn outline pager-notify">'+t('🔔 فعّل التنبيه أثناء فتح الصفحة','הפעל התראות בזמן שהדף פתוח','Enable alert while page is open')+'</button>'+
        '<small>'+t('الصفحة بتتحدث تلقائيًا. التنبيه بالخلفية مش مفعّل في التجربة.','הדף מתעדכן אוטומטית. התראות רקע אינן פעילות בניסוי.','Status refreshes automatically. Background push is not active in this pilot.')+'</small></section>'
      );
      if(lastStatus&&lastStatus!==state&&ready&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
        try{new Notification('TAFRIVO',{body:customerStatus('ready'),icon:'assets/favicon.png'})}catch{}
      }
      lastStatus=state;
      if(!poll&&!['collected','cancelled'].includes(state)){
        poll=setInterval(()=>{if(location.hash.startsWith('#pager/track/'))showTracking(ref,token,{silent:true}).catch(()=>{});else stop();},12000);
      }
    }catch(e){if(!silent)root().innerHTML=heading('<div class="banner error">'+esc(msg(e))+'</div>');}
  }
  async function showConfirm(code){
    stop();
    code=String(code||'').trim().toUpperCase();
    if(!/^[0-9A-F]{16}$/.test(code)){
      root().innerHTML=heading('<div class="banner error">'+t('كود تأكيد غير صالح','קוד אישור לא תקין','Invalid confirmation code')+'</div>');return;
    }
    rememberShort(code);
    root().innerHTML=heading('<section class="pager-card"><p>'+t('جاري تحميل تفاصيل الطلب…','טוען פרטי הזמנה…','Loading order…')+'</p></section>');
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){
        root().innerHTML=heading('<section class="pager-card"><h2>'+t('لازم تدخل بحساب المطعم أولًا','יש להתחבר לחשבון המסעדה','Sign in to the restaurant account')+'</h2>'+
        '<p>'+t('بعد الدخول بنفس المتصفح بنرجعك تلقائيًا لهذا الطلب. ما رح ينقبل أي طلب إلا لما تراجعه وتضغط قبول.','לאחר התחברות תחזרו להזמנה. שום הזמנה לא מתקבלת אוטומטית.','After signing in, you will return to this order. It will not be accepted automatically.')+'</p>'+
        '<p class="pager-pill">'+esc(code)+'</p><a href="#login" class="btn gold">'+t('تسجيل الدخول ومراجعة الطلب','התחברות ובדיקת הזמנה','Sign in and review order')+'</a></section>');return;
      }
      const order=val(await sb.rpc('pager_review_short_order',{p_code:code}));
      const invalidItems=(order.lines||[]).some(item=>item.available===false);
      const type=order.kind==='table'
        ?t('على الطاولة','לשבת במקום','Dine in')+' '+esc(order.table||'')
        :t('تيك أواي','איסוף עצמי','Takeaway');
      root().innerHTML=heading(
        '<section class="pager-card"><div class="pager-pill">'+t('تأكيد طلب واتساب','אישור הזמנת WhatsApp','Confirm WhatsApp order')+'</div>'+
        '<h2>'+esc(order.restaurant_name)+'</h2><p><b>#'+esc(short(order.ref))+'</b> · '+type+'</p>'+
        '<div class="pager-items">'+(order.lines||[]).map(item=>'<div><span>'+esc(item.qty)+' × '+esc(item.name)+
        (item.bread?' ('+esc(item.bread==='wrap'?'لفة':'بجيت')+')':'')+(item.available===false?' ⛔':'')+
        '</span><span>'+price(Number(item.price)*Number(item.qty))+'</span></div>').join('')+
        '<strong>'+t('المجموع','סה"כ','Total')+': '+price(order.total)+'</strong></div>'+
        (order.note?'<p>'+t('ملاحظات: ','הערות: ','Notes: ')+esc(order.note)+'</p>':'')+
        '<div class="pager-warning">'+t('راجع رسالة واتساب اللي وصلتك: هل رقم الطلب والأكلات نفس التفاصيل؟ لا تقبل الطلب إلا بعد التأكد.','בדקו שהודעת ה-WhatsApp באמת התקבלה ושהפרטים תואמים.','Verify that this exact WhatsApp message was received before accepting.')+'</div>'+
        (order.accepted?'<div class="banner">'+t('هذا الطلب تم قبوله مسبقًا.','ההזמנה כבר אושרה.','This order is already accepted.')+'</div>':
        invalidItems?'<div class="banner error">'+t('في صنف غير متوفر. اطلب طلب جديد.','אחד הפריטים אינו זמין.','An item is unavailable; request a new order.')+'</div>':
        '<button class="btn gold block" data-pager-action="accept-short" data-code="'+esc(code)+'">'+t('✅ تأكدت من واتساب — قبول الطلب','אימתתי ב-WhatsApp — אישור הזמנה','Verified WhatsApp — Accept order')+'</button>')+
        '<div id="pager-import-result"></div></section>');
    }catch(err){root().innerHTML=heading('<section class="pager-card"><div class="banner error">'+esc(msg(err))+'</div><a class="btn outline" href="#app">'+t('لوحة المطعم','לוח המסעדה','Dashboard')+'</a></section>');}
  }
  async function acceptShort(code,button){
    if(!confirm(t('تأكدت إن رسالة واتساب وصلت للمطعم بنفس رقم الطلب والأكلات؟','בדקת שהודעת WhatsApp זהה להזמנה?','Did you verify the matching WhatsApp order?')))return;
    button.disabled=true;
    try{
      val(await sb.rpc('pager_accept_short_order',{p_code:code}));
      clearShort(code);
      const target=root().querySelector('#pager-import-result');
      if(target)target.innerHTML='<div class="banner">'+t('تم قبول الطلب. رح يظهر بلوحة Smart Pager.','ההזמנה אושרה ותופיע בלוח Smart Pager.','Order accepted; it is now on your Smart Pager dashboard.')+'</div>'+
        '<a class="btn soft" href="#app">'+t('افتح لوحة المطعم','פתח לוח מסעדה','Open dashboard')+'</a>';
      button.remove();
    }catch(err){button.disabled=false;alert(msg(err));}
  }
  function readConfirmCode(value){
    const raw=String(value||'').trim().toUpperCase();
    const match=raw.match(/#PAGER\/CONFIRM\/([0-9A-F]{16})/)||raw.match(/^([0-9A-F]{16})$/);
    if(!match)throw Error(t('أدخل كود التأكيد المكوّن من 16 خانة أو رابط التأكيد المختصر.','הזינו קוד אישור בן 16 תווים.','Enter the 16-character confirmation code or its link.'));
    return match[1];
  }
  async function showImport(encoded){
    stop();
    let envelope;
    try{envelope=decodeB64(encoded);if(!envelope?.payload||!/^[0-9a-f]{64}$/.test(envelope.token))throw Error('Bad token');rememberImport(encoded);}
    catch{root().innerHTML=heading('<div class="banner error">'+t('رابط تأكيد الطلب غير صالح','קישור אישור לא תקין','Invalid import link')+'</div>');return;}
    root().innerHTML=heading('<div class="pager-card">'+t('جاري التحقق من صلاحياتك…','בודק הרשאות…','Checking permissions…')+'</div>');
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){
        root().innerHTML=heading('<div class="pager-card"><h2>'+t('سجّل دخولك أولًا','תחילה יש להתחבר','Sign in first')+'</h2><p>'+t('سجّل الدخول بنفس المتصفح. بنرجعك تلقائيًا لشاشة تأكيد الطلب. وإذا غيّرت المتصفح انسخ الرابط وافتحه هناك.','יש להתחבר באותו דפדפן כדי לחזור לאישור.','Sign in in this same browser to resume confirmation. If you change browsers, copy the link and open it there.')+'</p><a class="btn gold" href="#login">'+t('تسجيل الدخول ومتابعة التأكيد','התחברות והמשך','Sign in and resume')+'</a> <button class="btn outline" data-pager-action="copy-import" data-encoded="'+esc(encoded)+'">'+t('نسخ رابط التأكيد','העתקת קישור','Copy confirmation link')+'</button></div>');return;
      }
      const p=envelope.payload;
      const rest=val(await sb.from('restaurants').select('id,name,slug').eq('id',p.restaurant_id).maybeSingle());
      if(!rest)throw Error('Restaurant not found');
      const ids=[...new Set((p.lines||[]).map(x=>x.id))];
      const rows=val(await sb.from('menu_items').select('id,name_ar,name_he,name_en,price_ils,is_available').eq('restaurant_id',rest.id).in('id',ids));
      const dishes=(p.lines||[]).map(x=>{const item=rows.find(i=>i.id===x.id);return {name:item?.name_ar||item?.name_he||item?.name_en||'—',qty:Number(x.qty),option:x.option||'',price:Number(item?.price_ils||0),valid:!!(item&&item.is_available)};});
      const expired=Date.now()-Number(p.issued_at)>10*60*1000||Date.now()+60000<Number(p.issued_at);
      const notAllowed=dishes.some(x=>!x.valid)||expired||!dishes.length;
      const orderKind=p.kind==='table'?t('على الطاولة','ישיבה במקום','Dine in')+' '+esc(p.table):t('تيك أواي','איסוף עצמי','Takeaway');
      root().innerHTML=heading('<section class="pager-card"><div class="pager-pill">'+t('طلب واتساب — بحاجة لمراجعة صاحب المطعم','הזמנת וואטסאפ – דורשת אישור','WhatsApp order — staff review required')+'</div>'+
        '<h2>'+esc(rest.name)+'</h2><p><strong>#'+esc(short(p.client_ref))+'</strong> · '+orderKind+'</p>'+
        '<div class="pager-items">'+dishes.map(x=>'<div><span>'+esc(x.qty)+' × '+esc(x.name)+(x.option?' ('+esc(x.option==='wrap'?'لفة':'بجيت')+')':'')+'</span><span>'+price(x.qty*x.price)+'</span></div>').join('')+'</div>'+
        (p.note?'<p>'+t('ملاحظات: ','הערות: ','Note: ')+esc(p.note)+'</p>':'')+
        '<div class="pager-warning">'+t('تأكد إن الطلب موجود فعلًا في واتساب المطعم وإن التفاصيل والرقم متطابقين. ما في أي طلب رسمي قبل ضغط قبول.','יש לוודא שההודעה התקבלה ב-WhatsApp ופרטיה תואמים.','Verify this exact message arrived in the restaurant WhatsApp before accepting.')+'</div>'+
        (notAllowed?'<div class="banner error">'+t('انتهت مدة التأكيد (10 دقائق) أو إحدى الوجبات غير متوفرة. اطلب رسالة جديدة.','הקישור פג או אחד הפריטים אינו זמין.','Confirmation expired or an item is unavailable. Request a new message.')+'</div>':
          '<button class="btn gold block" data-pager-action="accept" data-envelope="'+esc(encoded)+'">'+t('✅ تأكدت من رسالة واتساب — قبول الطلب','אישרתי את הודעת ה-WhatsApp — קבל הזמנה','I verified WhatsApp — Accept order')+'</button>')+
        '<div id="pager-import-result"></div></section>');
    }catch(e){root().innerHTML=heading('<div class="banner error">'+esc(msg(e))+'</div>');}
  }
  async function accept(encoded,button){
    if(!confirm(t('هل تأكدت من وصول طلب واتساب الحقيقي؟ القبول رح يبدأ متابعة الطلب.','אישרת שהתקבלה הודעת WhatsApp אמיתית?','Did you verify the real WhatsApp message?')))return;
    button.disabled=true;
    try{
      const envelope=decodeB64(encoded);
      const result=val(await sb.rpc('pager_accept_from_whatsapp',{p_payload:envelope.payload,p_token:envelope.token}));
      clearImport(encoded);
      const el=root().querySelector('#pager-import-result');
      if(el)el.innerHTML='<div class="banner">'+t('تم قبول الطلب بنجاح. صار يظهر بلوحة Smart Pager.','ההזמנה התקבלה ותופיע בלוח Smart Pager.','Order accepted. It is now in the Smart Pager dashboard.')+'</div><a class="btn soft" href="#app">'+t('افتح لوحة التحكم ثم تبويب Smart Pager','פתח את לוח Smart Pager','Open Smart Pager dashboard')+'</a>';
      button.remove();
    }catch(e){button.disabled=false;alert(msg(e));}
  }
  function readyMessage(order){
    const code=short(order.client_ref),name=ownerRestaurant?.name||'TAFRIVO',atTable=order.order_type==='table';
    if(order.language==='he')return '🍔 '+name+'\n\n✅ ההזמנה שלך מספר #'+code+
      (atTable?' מוכנה ותוגש לשולחן '+(order.table_no||'')+'!':' מוכנה לאיסוף!')+
      '\nתודה שהזמנת אצלנו 💚\n\nPowered by TAFRIVO';
    if(order.language==='en')return '🍔 '+name+'\n\n✅ Order #'+code+
      (atTable?' is ready and will be served at table '+(order.table_no||'')+'!':' is ready for pickup!')+
      '\nThanks for ordering 💚\n\nPowered by TAFRIVO';
    return '🍔 '+name+'\n\n✅ طلبك رقم #'+code+
      (atTable?' جاهز ورح يوصلك على الطاولة '+(order.table_no||'')+'!':' صار جاهز للاستلام!')+
      '\nشكرًا لطلبك من '+name+' 💚\n\nPowered by TAFRIVO';
  }
  function customerWhatsAppLink(order){
    return 'https://wa.me/'+order.ready_whatsapp+'?text='+encodeURIComponent(readyMessage(order));
  }
  async function notifyCustomerReady(order){
    if(order.ready_whatsapp_consent&&/^[1-9][0-9]{9,14}$/.test(order.ready_whatsapp||'')){
      const target=customerWhatsAppLink(order);
      window.open(target,'_blank','noopener,noreferrer');
    }else{
      const text=readyMessage(order);
      try{await navigator.clipboard.writeText(text);alert(t('نسخنا رسالة الجهوزية. الصقها في محادثة الزبون اللي بعث الطلب على واتساب.','ההודעה הועתקה. הדביקו אותה בשיחת הלקוח ב-WhatsApp.','Ready message copied. Paste it into the WhatsApp conversation from this customer.'));}
      catch{prompt(t('انسخ رد الجهوزية لمحادثة الزبون','העתקת הודעת המוכנות','Copy ready reply into the customer chat'),text);}
    }
  }
  async function renderOwner(panel,restaurant){
    if(!panel||!restaurant)return;
    ownerPanel=panel;ownerRestaurant=restaurant;
    panel.innerHTML='<section class="panel">'+t('جاري تحميل الطلبات…','טוען הזמנות…','Loading orders…')+'</section>';
    try{
      const [s,o]=await Promise.all([
        sb.from('pager_settings').select('enabled').eq('restaurant_id',restaurant.id).maybeSingle(),
        sb.from('pager_orders').select('id,client_ref,status,order_type,table_no,note,language,ready_whatsapp_consent,ready_whatsapp,subtotal_ils,created_at,updated_at,pager_order_items(name,bread_option,quantity,unit_price_ils)')
        .eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(75)
      ]);
      const enabled=!!val(s)?.enabled,orders=val(o)||[];
      ownerOrders=orders;
      const active=orders.filter(x=>['accepted','preparing','ready'].includes(x.status));
      const statusLabels={accepted:t('مقبول','אושר','Accepted'),preparing:t('قيد التحضير','בהכנה','Preparing'),ready:t('جاهز','מוכן','Ready'),collected:t('تم التسليم','נמסר','Collected'),cancelled:t('ملغي','בוטל','Cancelled')};
      const buttons=x=>{
        const choices={accepted:[['preparing',t('بدء التحضير','התחל הכנה','Start preparing')],['cancelled',t('إلغاء','ביטול','Cancel')]],preparing:[['ready',t('الطلب جاهز','ההזמנה מוכנה','Ready')],['cancelled',t('إلغاء','ביטול','Cancel')]],ready:[['collected',t('تم التسليم','נמסר','Collected')],['cancelled',t('إلغاء','ביטול','Cancel')]]};
        return (choices[x.status]||[]).map(([next,label])=>'<button class="btn '+(next==='cancelled'?'outline':'gold')+' small" data-pager-action="status" data-id="'+esc(x.id)+'" data-next="'+esc(next)+'">'+esc(next==='ready'&&x.ready_whatsapp_consent?t('جاهز + إبلاغ واتساب','מוכן + WhatsApp','Ready + WhatsApp'):label)+'</button>').join('')+
          (x.status==='ready'?'<button class="btn outline small" data-pager-action="ready-message" data-id="'+esc(x.id)+'">'+(x.ready_whatsapp_consent?t('📲 افتح رسالة الزبون','📲 שלחו WhatsApp','📲 Open WhatsApp'):t('📋 نسخ رسالة الجهوزية','📋 העתקת הודעה','📋 Copy ready message'))+'</button>':'');
      };
      const card=x=>'<article class="pager-order"><div class="pager-order-title"><strong>#'+esc(short(x.client_ref))+'</strong><span class="pager-status '+esc(x.status)+'">'+esc(statusLabels[x.status]||x.status)+'</span></div><p class="small muted">'+esc(dateFmt(x.created_at))+' · '+(x.order_type==='table'?t('طاولة ','שולחן ','Table ')+esc(x.table_no):t('تيك أواي','איסוף עצמי','Takeaway'))+'</p>'+
        '<p>'+((x.pager_order_items||[]).map(i=>esc(i.quantity)+'× '+esc(i.name)+(i.bread_option?' ('+esc(i.bread_option==='wrap'?'لفة':'بجيت')+')':'')).join(' · '))+'</p><div class="pager-order-title"><b>'+price(x.subtotal_ils)+'</b><div class="actions">'+buttons(x)+'</div></div></article>';
      const pending=pendingImport(restaurant.id),shortWaiting=pendingShort();
      panel.innerHTML='<section class="panel"><h2>📟 TAFRIVO Smart Pager</h2><p class="muted">'+t('تأكيد الطلبات يتم فقط بعد وصول رسالة واتساب. الضغط من الزبون وحده ما بضيف أي طلب للوحة.','הזמנה נכנסת למערכת רק אחרי אישור מתוך WhatsApp.','Orders enter this dashboard only after verified WhatsApp acceptance.')+'</p>'+
        '<label class="pager-switch"><input type="checkbox" id="pager-enabled" '+(enabled?'checked':'')+'> '+t('تفعيل Smart Pager لهذا المطعم','הפעלת Smart Pager למסעדה','Enable Smart Pager for this restaurant')+'</label><button class="btn gold" data-pager-action="save-settings">'+t('حفظ الإعداد','שמירת הגדרה','Save setting')+'</button>'+
        '<div class="pager-import-tool">'+
        (shortWaiting?'<div class="banner warn"><b>'+t('في طلب قصير كنت تراجعه.','יש הזמנה שממתינה לבדיקה.','You have a pending short confirmation.')+'</b> <a class="btn gold small" href="#pager/confirm/'+esc(shortWaiting)+'">'+t('الرجوع للطلب','חזרה להזמנה','Return to order')+'</a></div>':'')+
        '<h3>'+t('تأكيد طلب من واتساب','אישור הזמנה מ-WhatsApp','Approve WhatsApp order')+'</h3>'+
        '<p class="small muted">'+t('الأسرع: اضغط رابط «تأكيد الطلب» في رسالة واتساب مباشرة. وإذا الرابط ما فتح، اكتب الكود القصير الموجود بالرسالة هون.','הדרך הקלה: לחצו על קישור האישור ב-WhatsApp. אפשר גם להזין קוד.','Tap the confirmation link in WhatsApp. If needed, enter its short code here.')+'</p>'+
        '<input id="pager-short-code" maxlength="300" autocomplete="off" placeholder="AB12CD34EF56AB78" inputmode="text" dir="ltr" />'+
        '<button class="btn gold" type="button" data-pager-action="open-short">'+t('فتح الطلب ومراجعته','פתיחת ההזמנה','Review order')+'</button>'+
        (pending?'<details><summary>'+t('تأكيد طلب قديم بالرابط الطويل','אישור הזמנה ישנה','Legacy long-link confirmation')+'</summary><p class="small muted">'+t('للطلبات القديمة فقط','להזמנות ישנות בלבד','Old requests only')+'</p><a class="btn outline small" href="#pager/import/'+esc(pending.encoded)+'">'+t('فتح الطلب القديم','פתיחת הזמנה ישנה','Open old request')+'</a></details>':'')+
        '</div>'+
        '<p class="hint">'+t('تجريبي: الإشعار على صفحة المتابعة فقط، والتنبيه من المتصفح أثناء فتحها. ما بنرسل إشعارات خلفية حاليًا.','ניסוי: מעקב והתראות רק כשהדף פתוח.','Pilot: tracking page and foreground alerts only. No background push yet.')+'</p></section>'+
        '<div class="pager-summary"><div><strong>'+active.length+'</strong><span>'+t('طلبات نشطة','הזמנות פעילות','Active')+'</span></div><div><strong>'+orders.filter(x=>x.status==='ready').length+'</strong><span>'+t('جاهزة','מוכנות','Ready')+'</span></div><div><strong>'+orders.filter(x=>x.status==='collected').length+'</strong><span>'+t('تم التسليم','נמסרו','Collected')+'</span></div></div>'+
        '<section class="panel"><div class="flexbetween"><h2>'+t('الطلبات المقبولة','הזמנות שאושרו','Accepted orders')+'</h2><button class="btn outline small" data-pager-action="refresh">'+t('تحديث','רענון','Refresh')+'</button></div>'+
        (orders.length?'<div class="pager-orders">'+orders.map(card).join('')+'</div>':'<div class="empty">'+t('ما في طلبات مقبولة بعد. بعد استلام واتساب، افتح رابط التأكيد الموجود بالرسالة.','אין הזמנות מאושרות עדיין.','No accepted orders yet. Open the confirmation link from a received WhatsApp message.')+'</div>')+'</section><div class="pager-owner-feedback"></div>';
    }catch(e){panel.innerHTML='<div class="banner error">'+esc(msg(e))+'</div>';}
  }
  async function ownerAction(button){
    const act=button.dataset.pagerAction;
    if(!ownerPanel||!ownerRestaurant)return;
    const order=ownerOrders.find(x=>x.id===button.dataset.id);
    if(act==='ready-message'){
      if(!order||order.status!=='ready')return;
      await notifyCustomerReady(order);
      return;
    }
    // Reserve the Safari popup synchronously on the staff click so it can open WhatsApp after the status RPC.
    const toReady=act==='status'&&button.dataset.next==='ready';
    const contact=toReady&&order?.ready_whatsapp_consent&&/^[1-9][0-9]{9,14}$/.test(order.ready_whatsapp||'');
    const popup=contact?window.open('about:blank','_blank'):null;
    button.disabled=true;
    try{
      if(act==='save-settings'){
        const enabled=!!ownerPanel.querySelector('#pager-enabled')?.checked;
        val(await sb.from('pager_settings').upsert({restaurant_id:ownerRestaurant.id,enabled},{onConflict:'restaurant_id'}).select('restaurant_id').single());
      }else if(act==='status'){
        const next=button.dataset.next;
        if(next==='cancelled'&&!confirm(t('إلغاء هذا الطلب؟','לבטל את ההזמנה?','Cancel this order?'))){button.disabled=false;return;}
        val(await sb.rpc('pager_set_status',{p_order_id:button.dataset.id,p_new_status:next}));
        if(toReady&&order){
          if(contact){
            const url=customerWhatsAppLink(order);
            if(popup&&!popup.closed){try{popup.location.replace(url)}catch{popup.location.href=url}}
            else alert(t('الطلب جاهز. اضغط زر «افتح رسالة الزبون» لإرسال واتساب.','ההזמנה מוכנה. לחצו על כפתור WhatsApp.','Order is ready. Use Open WhatsApp to send the prepared message.'));
          }else{
            // No phone consent. The restaurant can reply in the existing WhatsApp chat manually.
            try{await navigator.clipboard.writeText(readyMessage(order));}
            catch{}
          }
        }
      }
      await renderOwner(ownerPanel,ownerRestaurant);
      if(toReady&&!contact)alert(t('تم تحديث الطلب إلى جاهز. رسالة الجهوزية موجودة بزر «نسخ رسالة الجهوزية» للرد على الزبون بنفس محادثة واتساب.','ההזמנה מוכנה. ניתן להעתיק הודעה לשיחת WhatsApp של הלקוח.','Order marked ready. Copy the ready message into the existing customer WhatsApp chat.'));
    }catch(e){
      button.disabled=false;
      if(popup&&!popup.closed)popup.close();
      alert(msg(e));
    }
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-pager-action]');if(!b)return;
    event.preventDefault();
    if(b.dataset.pagerAction==='accept')accept(b.dataset.envelope,b).catch(err=>alert(msg(err)));
    else if(b.dataset.pagerAction==='accept-short')acceptShort(b.dataset.code,b).catch(err=>alert(msg(err)));
    else if(b.dataset.pagerAction==='open-short'){
      try{location.hash='#pager/confirm/'+readConfirmCode(ownerPanel?.querySelector('#pager-short-code')?.value||'');}
      catch(err){alert(msg(err));}
    }
    else if(b.dataset.pagerAction==='copy-import'){
      const target=link('pager/import/'+b.dataset.encoded);
      if(navigator.clipboard?.writeText)navigator.clipboard.writeText(target).then(()=>alert(t('تم نسخ الرابط','הקישור הועתק','Link copied'))).catch(()=>prompt('Copy link:',target));
      else prompt('Copy link:',target);
    }
    else if(b.dataset.pagerAction==='open-import'){
      try{location.hash=extractImportHash(ownerPanel?.querySelector('#pager-import-input')?.value||'');}
      catch(err){alert(msg(err));}
    }
    else if(b.dataset.pagerAction==='notify'){
      if(typeof Notification==='undefined')alert(t('إشعارات المتصفح غير متاحة','התראות לא זמינות','Notifications unavailable'));
      else Notification.requestPermission().then(v=>alert(v==='granted'?t('تم تفعيل إشعارات الصفحة المفتوحة','התראות הופעלו לדף פתוח','Foreground alerts enabled'):t('الإذن غير متاح','אין הרשאה','Permission not granted')));
    }
    else if(b.dataset.pagerAction==='refresh'||b.dataset.pagerAction==='status'||b.dataset.pagerAction==='save-settings'||b.dataset.pagerAction==='ready-message')
      ownerAction(b).catch(err=>alert(msg(err)));
  });
  window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#pager/track/'))stop();});
  window.TAFRIVO_PAGER={prepareCheckout,prepareQuickCheckout,lastTracking,showTrackingLink,showTracking,showImport,showConfirm,renderOwner,resumeAfterLogin,extractImportHash,readConfirmCode};
})();