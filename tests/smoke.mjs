import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = name => fs.readFileSync(name, 'utf8');
const source = read('app.js');
const i18n = read('public-language.js');
const homepage = read('index.html');
const files = ['index.html','app.js','public-language.js','contact.js','config.js','style.css','contact.html','join.html','join.js','pitch.html','pitch.js','privacy.html','terms.html','sitemap.xml','manifest.webmanifest','assets/logo.webp','assets/favicon.png'];
for(const name of files)assert.ok(fs.existsSync(name), 'Missing launch file: '+name);

assert.ok(homepage.includes('rel="canonical"'), 'Missing canonical metadata');
assert.ok(homepage.includes('public-language.js'), 'Public language script not loaded');
assert.ok(i18n.includes('he') && i18n.includes('en') && i18n.includes('ar'), 'Public multilingual switching incomplete');
assert.ok(source.includes('assets/favicon.png'), 'Header logo visibility fallback missing');
assert.ok(source.includes("redirectTo:location.origin+location.pathname}"), 'Password recovery should not include a fragment that conflicts with callback tokens');
assert.ok(homepage.includes('property="og:title"'), 'Missing social sharing metadata');
assert.ok(homepage.includes('application/ld+json'), 'Missing structured data');
assert.ok(read('sitemap.xml').includes('https://ozaapex.github.io/TAFRIVO/'), 'Wrong sitemap URL');
const runtimeConfig=read('config.js').split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
assert.ok(!/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role/.test(runtimeConfig), 'Secret in public configuration');
assert.ok(source.includes("sb.rpc('submit_restaurant_application'"), 'Atomic restaurant registration RPC not wired');
assert.ok(source.includes('data-act="toggle-registration"'), 'Admin registration toggle not wired');
assert.ok(source.includes('category-save'), 'Category editor missing');
assert.ok(source.includes('uploadRestaurantImage'), 'Image uploader missing');
assert.ok(read('contact.js').includes('contact_messages'), 'Contact form backend missing');
assert.ok(read('join.js').includes('restaurant_leads'), 'Restaurant onboarding form missing');
assert.ok(read('join.html').includes('id="join-form"'), 'Restaurant signup page missing');
const joinPage=read('join.html');
const joinLogic=read('join.js');
assert.ok(joinPage.includes('name="contact_email" type="email" required'), 'Restaurant application must require email in HTML');
assert.ok(joinLogic.includes("const email=get('contact_email').toLowerCase();") && joinLogic.includes('contact_email:email'), 'Onboarding must validate and send a required email');
assert.ok(!joinPage.includes('البريد الإلكتروني (اختياري)'), 'Email cannot be marked optional');
assert.ok(read('public-language.js').includes('["البريد الإلكتروني *","אימייל *","Email *"]'), 'Trilingual email-required label missing');
assert.ok(read('pitch.html').includes('pitch-join-qr')&&read('pitch.js').includes('QRCode.toCanvas'), 'Printed outreach QR page is missing');
for(const file of ['emails/confirm-signup.html','emails/reset-password.html']) { assert.ok(read(file).includes('{{ .ConfirmationURL }}'), 'Missing confirmation variable: '+file); assert.ok(read(file).includes('TAFRIVO'), 'Missing brand: '+file); }
assert.ok(read('SMTP-SETUP-AR.md').includes('smtp-relay.brevo.com'), 'SMTP setup guide missing');

async function render({hash='',open=false,admin=false,menu=false,signedIn=false,ownerMulti=false}={}){
  const root={innerHTML:'',addEventListener(){}};
  const restaurant={id:'9ca7fb58-d71b-4f6e-9f36-5b66206cc4bb',slug:'tafrivo-demo',name:'مطعم اختبار',description:'تجربة',public_phone:'0521234567',logo_url:null,cover_url:null};
  const ownerRestaurants=ownerMulti?[
    {id:'fd8a16d4-9b31-408e-af22-2073a3c102a3',name:'1Test',slug:'test1',status:'rejected',is_published:false,created_at:'2026-11-17T05:47:31Z'},
    {id:'4b474d4e-d709-4f53-a7c4-ad95feec63b9',name:'LAS VEGAS',slug:'las-vegas',status:'approved',is_published:true,created_at:'2026-11-16T13:54:16Z'}
  ]:[];
  const tables={site_settings:{registration_open:open},account_profiles:{role:admin?'super_admin':'owner'},restaurants:ownerMulti?ownerRestaurants:menu?restaurant:[],restaurant_applications:[],restaurant_subscriptions:[],billing_plans:[],billing_payments:[],contact_messages:[],menu_categories:[{id:'cat-1',name_ar:'الوجبات',is_visible:true}],menu_items:[{id:'item-1',category_id:'cat-1',name_ar:'برغر',price_ils:48,is_visible:true,is_available:true}]};
  const query=table=>{
    const q={
      select(){return q;},eq(){return q;},order(){return q;},gte(){return q;},lt(){return q;},limit(){return q;},range(){return q;},ilike(){return q;},
      single(){return Promise.resolve({data:tables[table],error:null});},
      maybeSingle(){return Promise.resolve({data:tables[table],error:null});},
      then(resolve,reject){return Promise.resolve({data:tables[table],error:null}).then(resolve,reject);}
    };
    return q;
  };
  const mockUser=(admin||signedIn)?{id:'087a6e7f-100c-486d-ad0e-10880eb29695',email:'test@example.com'}:null;
  const sb={from:query,auth:{getUser:async()=>({data:{user:mockUser},error:null}),getSession:async()=>({data:{session:mockUser?{user:mockUser}:null}}),onAuthStateChange(){}}};
  const context={
    window:{supabase:{createClient:()=>sb},TAFRIVO_CONFIG:{SUPABASE_URL:'mock',SUPABASE_PUBLISHABLE_KEY:'mock'},addEventListener(){}},
    document:{getElementById:()=>root,addEventListener(){}},
    location:{hash,origin:'https://ozaapex.github.io',pathname:'/TAFRIVO/'},
    navigator:{},crypto:{randomUUID:()=> 'mock-uuid'},
    console,confirm:()=>true,alert(){},prompt(){}
  };
  vm.runInNewContext(source,context,{timeout:2500,filename:'app.js'});
  for(let i=0;i<36;i++)await Promise.resolve();
  return root.innerHTML;
}
const closed=await render();
assert.ok(closed.includes('href="join.html"'),'Closed onboarding must show functioning restaurant application link');
assert.ok(closed.includes('جرّب المنيو بنفسك'),'Demo preview missing from homepage');
assert.ok(!closed.includes('href="#signup"'),'Closed onboarding must not invite signups');

const ownerWithTransfer=await render({hash:'#app',signedIn:true,ownerMulti:true});
assert.ok(ownerWithTransfer.includes('أهلًا في LAS VEGAS') && ownerWithTransfer.includes('لوحة مطعمك'), 'Approved transferred restaurant must be shown instead of newer rejected application');
assert.ok(ownerWithTransfer.includes('data-act="owner-switch-restaurant"') && ownerWithTransfer.includes('1Test') && ownerWithTransfer.includes('مطاعمي'), 'Restaurant chooser must show multiple owned restaurants');
const signedIn=await render({signedIn:true});
assert.ok(signedIn.includes('حسابي')&&signedIn.includes('test@example.com')&&!signedIn.includes('href="#login"'),'Signed-in home must show account without fake logout');
const opened=await render({open:true});
assert.ok(opened.includes('href="#signup"'),'Open registration should invite signups');
const signup=await render({hash:'#signup',open:true});
assert.ok(signup.includes('name="email"')&&signup.includes('privacy_ok'),'Signup form unavailable');

const closedSignup=await render({hash:'#signup'});
assert.ok(closedSignup.includes('التسجيل التجريبي'),'Direct signup must be blocked during SMTP setup');
const invalidRecovery=await render({hash:'#reset-password'});
assert.ok(invalidRecovery.includes('رابط استعادة كلمة المرور غير صالح'),'Unverified recovery URL must not reveal password reset form');
const login=await render({hash:'#login'});
assert.ok(login.includes('#forgot-password'),'Missing password recovery link');

const dashboard=await render({hash:'#app',admin:true});
assert.ok(dashboard.includes('لوحة المدير العام')&&dashboard.includes('toggle-registration'),'Admin dashboard broken');
assert.ok(dashboard.includes('رسائل التواصل'),'Support inbox missing');
assert.ok(dashboard.includes('طلبات انضمام المطاعم'),'Restaurant leads missing from admin');
assert.ok(dashboard.includes('lead-search')&&dashboard.includes('leads-export'),'Lead search and CSV export missing');

const menu=await render({hash:'#menu/tafrivo-demo',menu:true});
assert.ok(menu.includes('برغر')&&menu.includes('48'),'Public menu rendering broken');
console.log('TAFRIVO smoke checks: account sessions, recovery URL, public languages, onboarding, static files, security PASSED');
