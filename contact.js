/* Public contact form: direct Supabase insert only, no private key or customer data reads. */
(() => {
 "use strict";
 const form=document.getElementById("contact-form"),out=document.getElementById("contact-feedback"),button=document.getElementById("contact-submit");
 if(!form||!out)return;
 const show=(message,isError=false)=>{out.className="banner"+(isError?" error":"");out.textContent=message;out.scrollIntoView({block:"nearest",behavior:"smooth"});};
 if(!window.supabase||!window.TAFRIVO_CONFIG){show("تعذر تحميل نموذج التواصل. جرّب تحديث الصفحة.",true);button.disabled=true;return;}
 const client=window.supabase.createClient(window.TAFRIVO_CONFIG.SUPABASE_URL,window.TAFRIVO_CONFIG.SUPABASE_PUBLISHABLE_KEY);
 let lastSubmit=0;
 form.addEventListener("submit",async(ev)=>{
   ev.preventDefault();
   if(button.disabled)return;
   const f=new FormData(form);
   if(String(f.get("website")||"").trim()){form.reset();show("تم استلام الرسالة.");return;}
   if(Date.now()-lastSubmit<60000){show("تم إرسال رسالة قبل قليل. جرّب مرة ثانية بعد دقيقة.",true);return;}
   const row={
     sender_name:String(f.get("sender_name")||"").trim(),
     sender_email:String(f.get("sender_email")||"").trim().toLowerCase(),
     topic:String(f.get("topic")||"general"),
     body:String(f.get("body")||"").trim()
   };
   if(row.sender_name.length<2||row.body.length<10||row.body.length>2000){show("راجع الاسم والرسالة قبل الإرسال.",true);return;}
   button.disabled=true;button.textContent="جاري إرسال الرسالة…";
   try{
     const {error}=await client.from("contact_messages").insert(row);
     if(error)throw error;
     lastSubmit=Date.now();form.reset();show("وصلتنا رسالتك بنجاح! رح نراجعها من لوحة الإدارة.");
   }catch(err){
     const rate=/too many|rate limit/i.test(err?.message||"");
     show(rate?"أرسلت رسائل كثيرة من هذا البريد. جرّب بعد ساعة.":"ما قدرنا نرسل الرسالة الآن. جرّب لاحقًا.",true);
     console.warn("TAFRIVO contact form:",err?.code||"unknown");
   }finally{button.disabled=false;button.textContent="إرسال الرسالة";}
 });
})();
