/* Public restaurant lead capture; no passwords or payment details collected. */
(()=>{"use strict";
 const form=document.getElementById('join-form'),out=document.getElementById('join-feedback'),button=document.getElementById('join-submit');
 if(!form||!out||!button)return;
 const show=(msg,error=false)=>{out.className='banner'+(error?' error':'');out.textContent=msg;out.scrollIntoView({block:'nearest',behavior:'smooth'});};
 if(!window.supabase||!window.TAFRIVO_CONFIG){show('تعذر تشغيل التسجيل. جرّب تحديث الصفحة.',true);button.disabled=true;return;}
 const sb=window.supabase.createClient(window.TAFRIVO_CONFIG.SUPABASE_URL,window.TAFRIVO_CONFIG.SUPABASE_PUBLISHABLE_KEY);
 let submittedAt=0;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(button.disabled)return;
  const f=new FormData(form),get=k=>String(f.get(k)||'').trim();
  if(get('website')){show('تعذر استقبال الطلب؛ تواصل معنا عبر صفحة التواصل.',true);return;}
  const phone=get('contact_phone').replace(/[^0-9]/g,'');
  if(phone.length<9||phone.length>15){show('راجع رقم الهاتف: لازم يكون بين 9 و15 رقمًا.',true);return;}
  if(Date.now()-submittedAt<60000){show('قدّمت طلبًا قبل قليل. حاول بعد دقيقة.',true);return;}
  const data={restaurant_name:get('restaurant_name'),city:get('city'),contact_name:get('contact_name'),
    contact_phone:get('contact_phone'),contact_email:get('contact_email').toLowerCase()||null,
    menu_url:get('menu_url')||null,notes:get('notes')||null,consent:true};
  if(data.restaurant_name.length<2||data.city.length<2||data.contact_name.length<2){show('عبّي جميع الحقول المطلوبة.',true);return;}
  button.disabled=true;button.textContent='جاري إرسال الطلب…';
  try{
   const {error}=await sb.from('restaurant_leads').insert(data);
   if(error)throw error;
   form.reset();submittedAt=Date.now();
   show('وصل طلب انضمام مطعمك بنجاح ✅ صار عند إدارة TAFRIVO للمراجعة والتواصل معك.');
  }catch(error){
   show(/too many|rate/i.test(String(error?.message||''))?
     'وصلتنا طلبات متكررة من نفس الرقم. جرّب لاحقًا أو تواصل معنا.':
     'تعذر إرسال الطلب الآن. جرّب مرة ثانية أو تواصل معنا.',true);
   console.warn('TAFRIVO lead submit:',error?.code||'unknown');
  }finally{button.disabled=false;button.textContent='أرسل طلب انضمام المطعم';}
 });
})();