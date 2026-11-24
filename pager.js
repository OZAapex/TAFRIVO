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
  let poll=null,lastStatus=null,ownerRestaurant=null,ownerPanel=null;
  function stop(){if(poll)clearInterval(poll);poll=null;lastStatus=null;}
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
  function prepareCheckout({restaurant,entries,kind,table,note,lang}){
    if(!restaurant?.id||!['table','takeaway'].includes(kind)||!Array.isArray(entries)||!entries.length||entries.length>12)
      throw Error(t('تعذّر تحضير رابط المتابعة','לא ניתן להכין קישור מעקב','Cannot prepare tracking link'));
    const lines=entries.map(x=>({id:x.item.id,qty:x.q,option:x.option||''}));
    const payload={restaurant_id:restaurant.id,client_ref:crypto.randomUUID(),issued_at:Date.now(),kind,table:kind==='table'?table:'',note,lang:lang||'ar',lines};
    const fingerprint=JSON.stringify({id:restaurant.id,lines,kind,table,note,lang});
    const key='tafrivo-pager-checkout';
    let saved=null;try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
    if(saved?.fingerprint===fingerprint&&Date.now()-saved.ts<9*60*1000&&saved.envelope?.token)
      return build(saved.envelope);
    const envelope={payload,token:randomHex()};
    try{sessionStorage.setItem(key,JSON.stringify({fingerprint,ts:Date.now(),envelope}));}catch{}
    return build(envelope);
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
  async function showImport(encoded){
    stop();
    let envelope;
    try{envelope=decodeB64(encoded);if(!envelope?.payload||!/^[0-9a-f]{64}$/.test(envelope.token))throw Error('Bad token');}
    catch{root().innerHTML=heading('<div class="banner error">'+t('رابط تأكيد الطلب غير صالح','קישור אישור לא תקין','Invalid import link')+'</div>');return;}
    root().innerHTML=heading('<div class="pager-card">'+t('جاري التحقق من صلاحياتك…','בודק הרשאות…','Checking permissions…')+'</div>');
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){
        root().innerHTML=heading('<div class="pager-card"><h2>'+t('سجّل دخولك أولًا','תחילה יש להתחבר','Sign in first')+'</h2><p>'+t('سجّل الدخول إلى لوحة مطعمك، وبعدين ارجع افتح رابط التأكيد من رسالة واتساب مرة ثانية.','יש להתחבר ואז לפתוח שוב את הקישור מה-WhatsApp.','Sign in, then reopen the confirmation link from WhatsApp.')+'</p><a class="btn gold" href="#login">'+t('تسجيل الدخول','התחברות','Sign in')+'</a></div>');return;
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
      const el=root().querySelector('#pager-import-result');
      if(el)el.innerHTML='<div class="banner">'+t('تم قبول الطلب بنجاح. صار يظهر بلوحة Smart Pager.','ההזמנה התקבלה ותופיע בלוח Smart Pager.','Order accepted. It is now in the Smart Pager dashboard.')+'</div><a class="btn soft" href="#app">'+t('افتح لوحة التحكم ثم تبويب Smart Pager','פתח את לוח Smart Pager','Open Smart Pager dashboard')+'</a>';
      button.remove();
    }catch(e){button.disabled=false;alert(msg(e));}
  }
  async function renderOwner(panel,restaurant){
    if(!panel||!restaurant)return;
    ownerPanel=panel;ownerRestaurant=restaurant;
    panel.innerHTML='<section class="panel">'+t('جاري تحميل الطلبات…','טוען הזמנות…','Loading orders…')+'</section>';
    try{
      const [s,o]=await Promise.all([
        sb.from('pager_settings').select('enabled').eq('restaurant_id',restaurant.id).maybeSingle(),
        sb.from('pager_orders').select('id,client_ref,status,order_type,table_no,note,subtotal_ils,created_at,updated_at,pager_order_items(name,bread_option,quantity,unit_price_ils)')
        .eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(75)
      ]);
      const enabled=!!val(s)?.enabled,orders=val(o)||[];
      const active=orders.filter(x=>['accepted','preparing','ready'].includes(x.status));
      const statusLabels={accepted:t('مقبول','אושר','Accepted'),preparing:t('قيد التحضير','בהכנה','Preparing'),ready:t('جاهز','מוכן','Ready'),collected:t('تم التسليم','נמסר','Collected'),cancelled:t('ملغي','בוטל','Cancelled')};
      const buttons=x=>{
        const choices={accepted:[['preparing',t('بدء التحضير','התחל הכנה','Start preparing')],['cancelled',t('إلغاء','ביטול','Cancel')]],preparing:[['ready',t('الطلب جاهز','ההזמנה מוכנה','Ready')],['cancelled',t('إلغاء','ביטול','Cancel')]],ready:[['collected',t('تم التسليم','נמסר','Collected')],['cancelled',t('إلغاء','ביטול','Cancel')]]};
        return (choices[x.status]||[]).map(([next,label])=>'<button class="btn '+(next==='cancelled'?'outline':'gold')+' small" data-pager-action="status" data-id="'+esc(x.id)+'" data-next="'+esc(next)+'">'+esc(label)+'</button>').join('');
      };
      const card=x=>'<article class="pager-order"><div class="pager-order-title"><strong>#'+esc(short(x.client_ref))+'</strong><span class="pager-status '+esc(x.status)+'">'+esc(statusLabels[x.status]||x.status)+'</span></div><p class="small muted">'+esc(dateFmt(x.created_at))+' · '+(x.order_type==='table'?t('طاولة ','שולחן ','Table ')+esc(x.table_no):t('تيك أواي','איסוף עצמי','Takeaway'))+'</p>'+
        '<p>'+((x.pager_order_items||[]).map(i=>esc(i.quantity)+'× '+esc(i.name)+(i.bread_option?' ('+esc(i.bread_option==='wrap'?'لفة':'بجيت')+')':'')).join(' · '))+'</p><div class="pager-order-title"><b>'+price(x.subtotal_ils)+'</b><div class="actions">'+buttons(x)+'</div></div></article>';
      panel.innerHTML='<section class="panel"><h2>📟 TAFRIVO Smart Pager</h2><p class="muted">'+t('تأكيد الطلبات يتم فقط بعد وصول رسالة واتساب. الضغط من الزبون وحده ما بضيف أي طلب للوحة.','הזמנה נכנסת למערכת רק אחרי אישור מתוך WhatsApp.','Orders enter this dashboard only after verified WhatsApp acceptance.')+'</p>'+
        '<label class="pager-switch"><input type="checkbox" id="pager-enabled" '+(enabled?'checked':'')+'> '+t('تفعيل Smart Pager لهذا المطعم','הפעלת Smart Pager למסעדה','Enable Smart Pager for this restaurant')+'</label><button class="btn gold" data-pager-action="save-settings">'+t('حفظ الإعداد','שמירת הגדרה','Save setting')+'</button>'+
        '<p class="hint">'+t('تجريبي: الإشعار على صفحة المتابعة فقط، والتنبيه من المتصفح أثناء فتحها. ما بنرسل إشعارات خلفية حاليًا.','ניסוי: מעקב והתראות רק כשהדף פתוח.','Pilot: tracking page and foreground alerts only. No background push yet.')+'</p></section>'+
        '<div class="pager-summary"><div><strong>'+active.length+'</strong><span>'+t('طلبات نشطة','הזמנות פעילות','Active')+'</span></div><div><strong>'+orders.filter(x=>x.status==='ready').length+'</strong><span>'+t('جاهزة','מוכנות','Ready')+'</span></div><div><strong>'+orders.filter(x=>x.status==='collected').length+'</strong><span>'+t('تم التسليم','נמסרו','Collected')+'</span></div></div>'+
        '<section class="panel"><div class="flexbetween"><h2>'+t('الطلبات المقبولة','הזמנות שאושרו','Accepted orders')+'</h2><button class="btn outline small" data-pager-action="refresh">'+t('تحديث','רענון','Refresh')+'</button></div>'+
        (orders.length?'<div class="pager-orders">'+orders.map(card).join('')+'</div>':'<div class="empty">'+t('ما في طلبات مقبولة بعد. بعد استلام واتساب، افتح رابط التأكيد الموجود بالرسالة.','אין הזמנות מאושרות עדיין.','No accepted orders yet. Open the confirmation link from a received WhatsApp message.')+'</div>')+'</section><div class="pager-owner-feedback"></div>';
    }catch(e){panel.innerHTML='<div class="banner error">'+esc(msg(e))+'</div>';}
  }
  async function ownerAction(button){
    const act=button.dataset.pagerAction;
    if(!ownerPanel||!ownerRestaurant)return;
    button.disabled=true;
    try{
      if(act==='save-settings'){
        const enabled=!!ownerPanel.querySelector('#pager-enabled')?.checked;
        val(await sb.from('pager_settings').upsert({restaurant_id:ownerRestaurant.id,enabled},{onConflict:'restaurant_id'}).select('restaurant_id').single());
      }else if(act==='status'){
        const next=button.dataset.next;
        if(next==='cancelled'&&!confirm(t('إلغاء هذا الطلب؟','לבטל את ההזמנה?','Cancel this order?'))){button.disabled=false;return;}
        val(await sb.rpc('pager_set_status',{p_order_id:button.dataset.id,p_new_status:next}));
      }
      await renderOwner(ownerPanel,ownerRestaurant);
    }catch(e){button.disabled=false;alert(msg(e));}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-pager-action]');if(!b)return;
    event.preventDefault();
    if(b.dataset.pagerAction==='accept')accept(b.dataset.envelope,b).catch(err=>alert(msg(err)));
    else if(b.dataset.pagerAction==='notify'){
      if(typeof Notification==='undefined')alert(t('إشعارات المتصفح غير متاحة','התראות לא זמינות','Notifications unavailable'));
      else Notification.requestPermission().then(v=>alert(v==='granted'?t('تم تفعيل إشعارات الصفحة المفتوحة','התראות הופעלו לדף פתוח','Foreground alerts enabled'):t('الإذن غير متاح','אין הרשאה','Permission not granted')));
    }
    else if(b.dataset.pagerAction==='refresh'||b.dataset.pagerAction==='status'||b.dataset.pagerAction==='save-settings')
      ownerAction(b).catch(err=>alert(msg(err)));
  });
  window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#pager/track/'))stop();});
  window.TAFRIVO_PAGER={prepareCheckout,showTrackingLink,showTracking,showImport,renderOwner};
})();