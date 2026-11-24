/* TAFRIVO Loyalty v1 — isolated UI, preserving the existing menu and WhatsApp checkout.
   Wallet-native passes and background push require separately configured issuer credentials.
   No raw card token is stored in Supabase: token hash is validated by audited RPCs. */
(() => {
  'use strict';
  const s = window.supabase, cfg = window.TAFRIVO_CONFIG;
  if (!s || !cfg) return;
  const db = s.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
  const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const L = (ar,he,en) => {
    let lang='ar'; try{lang=localStorage.getItem('tafrivo-lang')||document.documentElement.lang||'ar';}catch{}
    return lang==='he'?he:lang==='en'?en:ar;
  };
  const link = h => location.origin+location.pathname+'#'+h;
  const error = x => x?.message||String(x||'حدث خطأ');
  const get = r => {if(r.error)throw r.error;return r.data;};
  const frame = body => '<div class="loyalty-shell"><header class="loyalty-header"><a href="#" class="loyalty-brand"><img src="assets/favicon.png" alt="" width="38" height="38"> TAFRIVO</a><a class="loyalty-back" href="#">'+L('الرئيسية','דף הבית','Home')+'</a></header><main class="loyalty-container">'+body+'</main><footer class="loyalty-footer">Powered by TAFRIVO · OZA APEX</footer></div>';
  let current={slug:null,token:null,card:null,restaurant:null,watchId:null,lastNear:0,tick:null,ownerRoot:null,ownerRestaurant:null};
  const root=()=>document.getElementById('app');
  function cancelWatch(){if(current.watchId!=null&&navigator.geolocation){navigator.geolocation.clearWatch(current.watchId)}current.watchId=null;}
  function stopPoll(){if(current.tick){clearInterval(current.tick);current.tick=null;}}
  function resetCard(){cancelWatch();stopPoll();current.slug=null;current.token=null;current.card=null;}
  function info(message,bad=false,scope){
    const el=(scope||root())?.querySelector('.loyalty-feedback');
    if(el){el.textContent=String(message);el.className='loyalty-feedback banner'+(bad?' error':'');}
  }
  function drawQR(target,body,size=170){
    if(!target)return;
    if(!window.QRCode?.toCanvas){target.textContent=body;return;}
    const canvas=document.createElement('canvas');
    target.replaceChildren(canvas);
    window.QRCode.toCanvas(canvas,body,{width:size,margin:2,color:{dark:'#113d2e',light:'#ffffff'}}).catch(()=>{target.textContent=body;});
  }
  async function showJoin(slug){
    resetCard();current.slug=slug;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){root().innerHTML=frame('<p>Invalid link</p>');return;}
    root().innerHTML=frame('<section class="loyalty-panel"><p>'+L('جاري تحميل نادي الزبائن…','טוען…','Loading…')+'</p></section>');
    try{
      const r=get(await db.from('restaurants').select('id,name,slug,logo_url').eq('slug',slug).eq('status','approved').eq('is_published',true).maybeSingle());
      if(!r)throw Error(L('هذا المطعم غير متاح','המסעדה אינה זמינה','Restaurant not available'));
      const p=get(await db.from('loyalty_programs').select('enabled,stamps_goal,reward_text').eq('restaurant_id',r.id).maybeSingle());
      if(!p?.enabled)throw Error(L('نادي الزبائن مش مفعّل حاليًا','מועדון הלקוחות לא פעיל','Loyalty club not enabled'));
      current.restaurant=r;
      const saved=(()=>{try{return localStorage.getItem('tafrivo-loyalty-'+slug)||''}catch{return''}})();
      root().innerHTML=frame('<section class="loyalty-panel loyalty-join"><div class="loyalty-medal">✦</div><h1>'+escape(r.name)+'</h1><p>'+L('انضم لنادي الزبائن','הצטרפו למועדון','Join the loyalty club')+'</p><div class="loyalty-reward">⭐ '+escape(p.stamps_goal)+' '+L('أختام —','חותמות —','stamps —')+' '+escape(p.reward_text)+'</div>'+(saved?'<a class="btn soft" href="'+escape(saved)+'">'+L('افتح بطاقتي الموجودة','פתיחת הכרטיס שלי','Open my existing card')+'</a>':'')+
      '<form data-loyalty-form="join" class="loyalty-form"><label>'+L('الاسم الأول أو لقب تختاره','שם פרטי או כינוי','First name or nickname')+' *</label><input type="text" name="member_name" minlength="2" maxlength="70" autocomplete="nickname" required placeholder="'+L('اسمك','השם שלך','Your name')+'">'+
      '<label class="loyalty-check"><input type="checkbox" name="birthday_opt"> '+L('بدي هدية عيد الميلاد (اختياري)','אני רוצה הטבת יום הולדת (אופציונלי)','I want a birthday reward (optional)')+'</label>'+
      '<div class="loyalty-birthday hide"><label>'+L('يوم الميلاد','יום','Birthday day')+' <input type="number" name="birth_day" min="1" max="31" placeholder="15"></label><label>'+L('الشهر','חודש','Month')+' <input type="number" name="birth_month" min="1" max="12" placeholder="6"></label></div>'+
      '<label class="loyalty-check"><input type="checkbox" name="marketing_opt"> '+L('بوافق أستقبل عروض المطعم داخل بطاقتي، وبقدر ألغي بأي وقت.','אני מסכים לקבל מבצעים בכרטיס ואוכל לבטל בכל עת.','I agree to receive offers in my card and can opt out anytime.')+'</label>'+
      '<p class="small muted">'+L('ما منطلب رقم تلفون ولا منحتفظ بموقعك. رابط البطاقة الخاص فيك مهم تحفظه.','אין צורך בטלפון או בשמירת מיקום. חשוב לשמור את הקישור הפרטי.','No phone number or location history is collected. Save your private card link.')+'</p>'+
      '<button class="btn gold block" type="submit">'+L('إنشاء بطاقتي','יצירת הכרטיס שלי','Create my card')+'</button></form><div class="loyalty-feedback"></div></section>');
    }catch(err){root().innerHTML=frame('<div class="banner warn">'+escape(error(err))+'</div><a href="#menu/'+escape(slug)+'" class="btn outline">'+L('رجوع للمنيو','חזרה לתפריט','Back to menu')+'</a>');}
  }
  async function showCard(slug,token,{silent=false}={}){
    if(!/^[a-z0-9-]{3,60}$/.test(slug)||!/^[0-9a-f]{64}$/.test(token)){root().innerHTML=frame('<div class="banner error">Invalid loyalty card URL</div>');return;}
    if(current.slug!==slug||current.token!==token){resetCard();current.slug=slug;current.token=token;}
    if(!silent)root().innerHTML=frame('<div class="loyalty-panel">'+L('جاري تحميل بطاقتك…','טוען את הכרטיס…','Loading card…')+'</div>');
    try{
      const result=get(await db.rpc('loyalty_get_card',{p_slug:slug,p_token:token}));
      if(current.token!==token)return;
      current.card=result;
      const p=result,goal=Number(p.goal)||10,shown=Number(p.pending_rewards)>0?goal:Math.min(goal,Number(p.stamps)%goal);
      const stamps=Array.from({length:goal},(_,i)=>'<span class="loyalty-stamp '+(i<shown?'earned':'')+'">'+(i<shown?'★':'☆')+'</span>').join('');
      const notices=Array.isArray(p.notices)?p.notices:[];
      const birthday=p.birthday_today?'<div class="loyalty-birthday-banner">🎂 '+L('كل عام وإنت بخير!','יום הולדת שמח!','Happy Birthday!')+' '+escape(p.birthday_reward_text)+'</div>':'';
      const location=p.location_enabled&&p.latitude!=null&&p.longitude!=null;
      const lastNotice=notices[0]?.created_at||'';
      const seenKey='tafrivo-loyalty-notice-'+slug;
      let seen='';try{seen=localStorage.getItem(seenKey)||'';}catch{}
      const shouldNotify=seen&&lastNotice&&seen!==lastNotice&&NotificationAvailable()&&Notification.permission==='granted';
      root().innerHTML=frame(
        '<section class="loyalty-pass"><div class="loyalty-pass-top"><span>✦ TAFRIVO CLUB</span><span>'+escape(p.restaurant_name)+'</span></div>'+
        '<div class="loyalty-pass-name">'+escape(p.name)+'</div>'+
        '<div class="loyalty-stamps">'+stamps+'</div>'+
        '<div class="loyalty-pass-count">'+shown+'/'+goal+' '+L('أختام','חותמות','stamps')+'</div>'+
        '<p>'+escape(p.reward_text)+'</p>'+
        (Number(p.pending_rewards)>0?'<div class="loyalty-ready">🎁 '+p.pending_rewards+' '+L('مكافأة جاهزة! اطلب من المطعم تأكيد الاستلام.','הטבה מוכנה למימוש!','reward(s) ready to claim!')+'</div>':'')+
        '<div class="loyalty-card-qr" id="loyalty-card-qr"></div><small>'+L('اعرض هذا الكود للموظف حتى يضيف ختمك. لا تنشر رابط بطاقتك للآخرين.','הציגו את הקוד לצוות. אל תשתפו את הקישור האישי.','Show this code to staff. Keep the link private.')+'</small></section>'+
        birthday+
        '<section class="loyalty-panel"><h2>🔔 '+L('عروض وتنبيهات المطعم','הודעות ומבצעים','Restaurant offers & updates')+'</h2>'+
        (p.marketing_consent?(notices.length?notices.map(n=>'<article class="loyalty-notice"><b>'+escape(n.title)+'</b><p>'+escape(n.body)+'</p><small>'+escape(new Date(n.created_at).toLocaleDateString())+'</small></article>').join(''):'<p class="muted">'+L('ما في عروض جديدة حاليًا.','אין מבצעים חדשים כרגע.','No offers yet.')+'</p>'):'<p class="muted">'+L('عروض التسويق مش مفعّلة على بطاقتك.','מבצעים כבויים בכרטיס שלך.','Marketing offers are disabled for your card.')+'</p>')+
        '<div class="actions"><button class="btn soft small" data-loyalty-action="notify">'+L('فعّل إشعارات الهاتف أثناء فتح البطاقة','הפעל הודעות כשהכרטיס פתוח','Allow alerts while card is open')+'</button>'+ (p.marketing_consent?'<button class="btn outline small" data-loyalty-action="optout">'+L('إلغاء عروض التسويق','ביטול מבצעים','Unsubscribe from offers')+'</button>':'')+'</div></section>'+
        (location?'<section class="loyalty-panel"><h2>📍 '+L('تنبيه قرب المطعم','התראה בקרבת המסעדה','Near-store alert')+'</h2><p class="muted">'+L('إذا وافقت على الموقع، بننبهك لما تقرب من المطعم طالما الصفحة مفتوحة. ما بنحفظ موقعك، ولا بشتغل التتبع بالخلفية.','בהסכמתך נתריע בקרבת המסעדה רק כשהדף פתוח. מיקום לא נשמר.','With your permission, alerts work only while this page is open. We do not store your location.')+'</p><button class="btn gold" data-loyalty-action="near">'+L('تفعيل تنبيه القرب الآن','הפעלת התראות קרבה','Enable nearby alert now')+'</button><button class="btn outline" data-loyalty-action="stop-near">'+L('إيقاف','עצירה','Stop')+'</button><div class="loyalty-near-status muted small"></div></section>':'')+
        '<section class="loyalty-panel"><h2>📲 '+L('احتفظ ببطاقتك','שמרו את הכרטיס','Keep your card')+'</h2><p class="small muted">'+L('أضف الموقع للشاشة الرئيسية من قائمة المتصفح. Apple Wallet / Google Wallet بحاجة لتفعيل الربط الرسمي من TAFRIVO قبل إتاحة زر الحفظ الأصلي.','ניתן להוסיף למסך הבית. חיבור Wallet רשמי עדיין דורש הגדרה.','Add this web card to your Home Screen. Native Wallet integration requires issuer setup.')+'</p><button class="btn outline" data-loyalty-action="copy">'+L('نسخ رابط بطاقتي','העתקת קישור','Copy card link')+'</button> <button class="btn danger" data-loyalty-action="delete">'+L('حذف البطاقة وبياناتي','מחיקת הכרטיס והנתונים','Delete my card & data')+'</button></section>'
      );
      drawQR(document.getElementById('loyalty-card-qr'),link('loyalty/card/'+slug+'/'+token),155);
      if(shouldNotify){try{new Notification(notices[0].title,{body:notices[0].body,icon:'assets/favicon.png'})}catch{}}
      try{if(lastNotice)localStorage.setItem(seenKey,lastNotice);}catch{}
      if(!current.tick)current.tick=setInterval(()=>{if(location.hash.startsWith('#loyalty/card/'))showCard(slug,token,{silent:true}).catch(()=>{});},60000);
    }catch(err){if(!silent)root().innerHTML=frame('<div class="banner error">'+escape(error(err))+'</div>');}
  }
  function NotificationAvailable(){return typeof window.Notification!=='undefined';}
  function distanceM(a,b,c,d){
    const rad=x=>x*Math.PI/180;
    const dlat=rad(c-a),dlon=rad(d-b);
    const aa=Math.sin(dlat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dlon/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));
  }
  function startNearby(){
    const c=current.card;
    const status=()=>document.querySelector('.loyalty-near-status');
    if(!c?.location_enabled||!navigator.geolocation){if(status())status().textContent=L('الموقع مش متاح على هذا الجهاز.','המיקום אינו זמין','Location unavailable');return;}
    cancelWatch();
    if(status())status().textContent=L('جاري طلب إذن الموقع…','מבקש הרשאת מיקום…','Requesting location permission…');
    current.watchId=navigator.geolocation.watchPosition(pos=>{
      const d=distanceM(pos.coords.latitude,pos.coords.longitude,c.latitude,c.longitude);
      if(!status())return;
      if(d<=c.radius_m){
        status().textContent=L('إنت قريب من المطعم!','אתם קרובים למסעדה!','You are near the restaurant!');
        if(Date.now()-current.lastNear>60*60*1000){
          current.lastNear=Date.now();
          if(NotificationAvailable()&&Notification.permission==='granted')new Notification(c.restaurant_name,{body:c.near_message,icon:'assets/favicon.png'});
          else alert(c.near_message);
        }
      }else status().textContent=L('المسافة التقريبية: ','מרחק משוער: ','Approximate distance: ')+Math.round(d)+' m';
    },err=>{if(status())status().textContent=L('تعذّر تحديد الموقع: ','שגיאת מיקום: ','Location error: ')+err.message;},{enableHighAccuracy:false,maximumAge:30000,timeout:15000});
  }
  async function loadOwner(container,restaurant){
    current.ownerRoot=container;current.ownerRestaurant=restaurant;
    if(!container||!restaurant?.id)return;
    container.innerHTML='<section class="panel">'+L('جاري تحميل نادي الزبائن…','טוען…','Loading loyalty club…')+'</section>';
    try{
      const [p,c,n]=await Promise.all([
        db.from('loyalty_programs').select('*').eq('restaurant_id',restaurant.id).maybeSingle(),
        db.from('loyalty_cards').select('id,display_name,total_stamps,rewards_claimed,marketing_consent,created_at').eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(200),
        db.from('loyalty_notices').select('id,title,body,created_at,is_active').eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).limit(30)
      ]);
      const program=get(p)||{restaurant_id:restaurant.id,enabled:false,stamps_goal:10,reward_text:'مكافأة عند اكتمال البطاقة',birthday_reward_text:'كل عام وأنت بخير!',location_enabled:false,radius_m:200,near_message:'قريب منّا؟ مرّ علينا!'};
      const cards=get(c)||[],messages=get(n)||[];
      const joinUrl=link('loyalty/join/'+restaurant.slug);
      container.innerHTML='<section class="panel"><h2>⭐ نادي الزبائن والبطاقات الرقمية</h2><p class="muted">برنامج الولاء لكل مطعم مستقل. الزبون بقدر يحتفظ برابط بطاقة خاصة فيه، والأختام والمكافآت ما بضيفها إلا صاحب المطعم.</p>'+
      '<div class="stats"><div class="stat"><strong>'+cards.length+'</strong><span>بطاقات مسجلة (آخر 200)</span></div><div class="stat"><strong>'+cards.reduce((a,x)=>a+Number(x.total_stamps),0)+'</strong><span>أختام مسجلة</span></div><div class="stat"><strong>'+cards.filter(x=>x.marketing_consent).length+'</strong><span>موافقون على العروض</span></div></div>'+
      '<form data-loyalty-form="program"><div class="formgrid"><div class="field span2"><label><input type="checkbox" name="enabled" '+(program.enabled?'checked':'')+'> تفعيل نادي الزبائن للمطعم</label></div>'+
      '<div class="field"><label>عدد الأختام للمكافأة</label><input name="goal" type="number" min="2" max="30" required value="'+escape(program.stamps_goal)+'"></div>'+
      '<div class="field"><label>وصف المكافأة</label><input name="reward" maxlength="180" required value="'+escape(program.reward_text)+'"></div>'+
      '<div class="field span2"><label>رسالة هدية عيد الميلاد</label><input name="birthday_reward" maxlength="200" required value="'+escape(program.birthday_reward_text)+'"></div>'+
      '<div class="field span2"><label><input type="checkbox" name="location_enabled" '+(program.location_enabled?'checked':'')+'> تفعيل تنبيه القرب (خلال فتح البطاقة فقط حاليًا)</label></div>'+
      '<div class="field"><label>خط العرض (Latitude)</label><input name="latitude" type="number" step="any" min="-90" max="90" value="'+escape(program.latitude??'')+'" placeholder="32.85"></div>'+
      '<div class="field"><label>خط الطول (Longitude)</label><input name="longitude" type="number" step="any" min="-180" max="180" value="'+escape(program.longitude??'')+'" placeholder="35.34"></div>'+
      '<div class="field"><label>مسافة التنبيه بالمتر</label><input name="radius" type="number" min="50" max="500" value="'+escape(program.radius_m)+'"></div>'+
      '<div class="field"><label>نص تنبيه القرب</label><input name="near_message" maxlength="160" required value="'+escape(program.near_message)+'"></div></div>'+
      '<div class="actions"><button type="button" class="btn outline" data-loyalty-action="owner-location">📍 تحديد إحداثيات المطعم من موقعي الحالي</button><button class="btn gold" type="submit">حفظ برنامج الولاء</button></div></form>'+
      '<p class="hint">تنبيه الهاتف المقفّل عبر Apple Wallet / Google Wallet يحتاج ربط الحسابات الرسمية وشهادات إصدار البطاقات. هالإعدادات بتجهّز موقع المطعم للتكامل.</p></section>'+
      '<section class="panel" style="margin-top:18px"><h2>🔳 رمز الانضمام لنادي الزبائن</h2><div id="loyalty-join-qr" class="loyalty-join-qr"></div><p class="display-url">'+escape(joinUrl)+'</p><button class="btn outline" data-loyalty-action="copyjoin">نسخ رابط الانضمام</button></section>'+
      '<section class="panel" style="margin-top:18px"><h2>🔔 إرسال عرض للبطاقات</h2><p class="muted">الرسالة بتوصل لصندوق عروض الزبائن اللي وافقوا، وبتظهر عند فتح بطاقاتهم. الإشعارات الفورية بالخلفية مش مفعّلة قبل ربط Push.</p>'+
      '<form data-loyalty-form="notice"><div class="field"><label>عنوان الإشعار</label><input name="title" required minlength="3" maxlength="90" placeholder="عرض نهاية الأسبوع"></div><div class="field"><label>نص العرض</label><textarea name="body" required minlength="5" maxlength="400" placeholder="عرض خاص لأعضاء النادي"></textarea></div><button class="btn gold" type="submit">نشر العرض للمشتركين الموافقين</button></form><h3 style="margin-top:22px">العروض الأخيرة</h3>'+
      (messages.length?messages.map(x=>'<div class="listcard"><div><b>'+escape(x.title)+'</b><p>'+escape(x.body)+'</p><small>'+escape(new Date(x.created_at).toLocaleDateString())+'</small></div>'+(x.is_active?'<button class="btn outline small" data-loyalty-action="disable-notice" data-id="'+escape(x.id)+'">إيقاف</button>':'<span class="tag">متوقف</span>')+'</div>').join(''):'<div class="empty">لا توجد عروض بعد</div>')+'</section>'+
      '<section class="panel" style="margin-top:18px"><h2>⭐ بطاقات الزبائن</h2>'+
      (cards.length?cards.map(x=>{
        const avail=Math.max(0,Math.floor(Number(x.total_stamps)/Number(program.stamps_goal))-Number(x.rewards_claimed));
        return '<div class="listcard loyalty-member"><div><b>'+escape(x.display_name)+'</b><p>'+x.total_stamps+' ختم · '+(x.marketing_consent?'وافق على العروض':'بدون عروض')+(avail?' · 🎁 '+avail+' مكافآت جاهزة':'')+'</p><small>'+escape(x.id)+'</small></div><div class="actions"><button type="button" class="btn gold small" data-loyalty-action="stamp" data-id="'+escape(x.id)+'">+1 ختم</button>'+(avail?'<button type="button" class="btn soft small" data-loyalty-action="redeem" data-id="'+escape(x.id)+'">تسليم المكافأة</button>':'')+'</div></div>';
      }).join(''):'<div class="empty">لسه ما في زبائن مسجّلين</div>')+'</section><div class="loyalty-feedback"></div>';
      drawQR(container.querySelector('#loyalty-join-qr'),joinUrl,175);
    }catch(err){container.innerHTML='<div class="banner error">تعذر تحميل نادي الزبائن: '+escape(error(err))+'</div>';}
  }
  async function action(button){
    const action=button.dataset.loyaltyAction,slug=current.slug,token=current.token;
    if(action==='copy'||action==='copyjoin'){
      const val=action==='copyjoin'?link('loyalty/join/'+current.ownerRestaurant.slug):link('loyalty/card/'+slug+'/'+token);
      try{await navigator.clipboard.writeText(val);alert(L('تم نسخ الرابط','הקישור הועתק','Link copied'));}catch{prompt('Copy link:',val);}
      return;
    }
    if(action==='notify'){
      if(!NotificationAvailable())alert(L('الإشعارات مش مدعومة بهالمتصفح.','התראות לא נתמכות בדפדפן','Notifications are not supported on this browser.'));
      else alert((await Notification.requestPermission())==='granted'?L('تم السماح بإشعارات الصفحة المفتوحة.','ההרשאה ניתנה','Allowed while page is open.'):L('ما تم السماح بالإشعارات.','ההרשאה לא ניתנה','Permission not granted.'));
      return;
    }
    if(action==='near'){startNearby();return;}
    if(action==='stop-near'){cancelWatch();const x=document.querySelector('.loyalty-near-status');if(x)x.textContent=L('تم إيقاف مراقبة القرب.','המעקב הופסק','Nearby monitoring stopped.');return;}
    if(action==='optout'){
      if(!confirm(L('إلغاء استقبال العروض؟','לבטל מבצעים?','Unsubscribe from offers?')))return;
      get(await db.rpc('loyalty_opt_out',{p_token:token}));await showCard(slug,token);return;
    }
    if(action==='delete'){
      if(!confirm(L('حذف بطاقتك وجميع بياناتها نهائيًا؟','למחוק את הכרטיס והנתונים לצמיתות?','Permanently delete your card and its data?')))return;
      get(await db.rpc('loyalty_delete_card',{p_token:token}));
      try{localStorage.removeItem('tafrivo-loyalty-'+slug);}catch{}
      location.hash='#menu/'+slug;return;
    }
    const r=current.ownerRestaurant,c=current.ownerRoot;
    if(!r||!c)return;
    if(action==='owner-location'){
      if(!navigator.geolocation){info('الموقع مش متاح بهذا الجهاز',true,c);return;}
      navigator.geolocation.getCurrentPosition(pos=>{
        c.querySelector('[name=latitude]').value=pos.coords.latitude.toFixed(6);
        c.querySelector('[name=longitude]').value=pos.coords.longitude.toFixed(6);
        info('حددنا مكانك الحالي. تأكد إنك داخل المطعم قبل الحفظ.',false,c);
      },err=>info('تعذر تحديد الموقع: '+err.message,true,c),{enableHighAccuracy:true,timeout:15000});
      return;
    }
    if(action==='disable-notice'){
      if(!confirm('إيقاف هذا العرض؟'))return;
      try{get(await db.from('loyalty_notices').update({is_active:false}).eq('id',button.dataset.id).eq('restaurant_id',r.id));await loadOwner(c,r);}
      catch(err){info(error(err),true,c);}return;
    }
    if(action==='stamp'||action==='redeem'){
      const message=action==='stamp'?'تأكيد إضافة ختم واحد لهذا الزبون؟':'تأكيد تسليم مكافأة لهذا الزبون؟';
      if(!confirm(message))return;
      button.disabled=true;
      try{get(await db.rpc(action==='stamp'?'loyalty_award_stamp':'loyalty_redeem_reward',{p_card_id:button.dataset.id}));await loadOwner(c,r);}
      catch(err){button.disabled=false;info(error(err),true,c);}return;
    }
  }
  async function submit(form){
    const type=form.dataset.loyaltyForm;
    const data=new FormData(form),v=k=>String(data.get(k)||'').trim();
    const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=true;
    try{
      if(type==='join'){
        if(!current.restaurant)throw Error('Restaurant not found');
        const birth=data.has('birthday_opt'),month=birth?Number(v('birth_month')):null,day=birth?Number(v('birth_day')):null;
        if(birth&&(!Number.isInteger(month)||!Number.isInteger(day)||month<1||month>12||day<1||day>31))throw Error(L('اكتب يوم وشهر ميلاد صحيحين','יש להזין תאריך תקין','Enter a valid birthday'));
        const card=get(await db.rpc('loyalty_enroll',{p_restaurant_id:current.restaurant.id,p_name:v('member_name'),p_birth_month:month,p_birth_day:day,p_birthday_consent:birth,p_marketing_consent:data.has('marketing_opt')}));
        const url=link('loyalty/card/'+card.slug+'/'+card.token);
        try{localStorage.setItem('tafrivo-loyalty-'+card.slug,url)}catch{}
        location.hash='#loyalty/card/'+card.slug+'/'+card.token;return;
      }
      const r=current.ownerRestaurant,c=current.ownerRoot;if(!r||!c)throw Error('Restaurant not found');
      if(type==='program'){
        const lat=v('latitude'),lng=v('longitude'),loc=data.has('location_enabled');
        if(loc&&(!lat||!lng))throw Error('إذا بدك تنبيه قرب، لازم تحدد الإحداثيات أولًا.');
        const row={
          restaurant_id:r.id,enabled:data.has('enabled'),stamps_goal:Number(v('goal')),
          reward_text:v('reward'),birthday_reward_text:v('birthday_reward'),
          location_enabled:loc,latitude:lat?Number(lat):null,longitude:lng?Number(lng):null,
          radius_m:Number(v('radius')),near_message:v('near_message')
        };
        get(await db.from('loyalty_programs').upsert(row,{onConflict:'restaurant_id'}).select('restaurant_id').single());
        await loadOwner(c,r);info('تم حفظ إعدادات نادي الزبائن',false,c);return;
      }
      if(type==='notice'){
        if(!confirm('نشر العرض داخل بطاقات المشتركين الموافقين؟'))return;
        get(await db.from('loyalty_notices').insert({restaurant_id:r.id,title:v('title'),body:v('body')}).select('id').single());
        await loadOwner(c,r);info('تم نشر العرض داخل بطاقات الأعضاء الموافقين. الإرسال بالخلفية غير مفعّل.',false,c);return;
      }
    }catch(err){info(error(err),true,type==='join'?root():current.ownerRoot);}
    finally{if(btn)btn.disabled=false;}
  }
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-loyalty-action]');
    if(el){ev.preventDefault();action(el).catch(err=>info(error(err),true,current.ownerRoot||root()));}
  });
  document.addEventListener('change',ev=>{
    if(ev.target.name==='birthday_opt'){
      const form=ev.target.closest('form'),row=form?.querySelector('.loyalty-birthday');
      if(row){row.classList.toggle('hide',!ev.target.checked);row.querySelectorAll('input').forEach(input=>{input.required=ev.target.checked;});}
    }
  });
  document.addEventListener('submit',ev=>{
    const form=ev.target.closest('form[data-loyalty-form]');
    if(form){ev.preventDefault();submit(form);}
  });
  window.addEventListener('hashchange',()=>{
    if(!location.hash.startsWith('#loyalty/card/')){cancelWatch();stopPoll();}
  });
  window.TAFRIVO_LOYALTY={showJoin,showCard,renderOwner:loadOwner,resetCard};
})();