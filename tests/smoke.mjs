import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = name => fs.readFileSync(name, 'utf8');
const source = read('app.js');
const homepage = read('index.html');
const files = ['index.html','app.js','contact.js','config.js','style.css','contact.html','privacy.html','terms.html','sitemap.xml','manifest.webmanifest','assets/logo.webp','assets/favicon.png'];
for(const name of files)assert.ok(fs.existsSync(name), 'Missing launch file: '+name);

assert.ok(homepage.includes('rel="canonical"'), 'Missing canonical metadata');
assert.ok(homepage.includes('property="og:title"'), 'Missing social sharing metadata');
assert.ok(homepage.includes('application/ld+json'), 'Missing structured data');
assert.ok(read('sitemap.xml').includes('https://ozaapex.github.io/TAFRIVO/'), 'Wrong sitemap URL');
assert.ok(!/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role/.test(read('config.js')), 'Secret in public configuration');
assert.ok(source.includes("sb.rpc('submit_restaurant_application'"), 'Atomic restaurant registration RPC not wired');
assert.ok(source.includes('data-act="toggle-registration"'), 'Admin registration toggle not wired');
assert.ok(source.includes('category-save'), 'Category editor missing');
assert.ok(source.includes('uploadRestaurantImage'), 'Image uploader missing');
assert.ok(read('contact.js').includes('contact_messages'), 'Contact form backend missing');

async function render({hash='',open=false,admin=false,menu=false}={}){
  const root={innerHTML:'',addEventListener(){}};
  const restaurant={id:'9ca7fb58-d71b-4f6e-9f36-5b66206cc4bb',slug:'tafrivo-demo',name:'مطعم اختبار',description:'تجربة',public_phone:'0521234567',logo_url:null,cover_url:null};
  const tables={site_settings:{registration_open:open},account_profiles:{role:admin?'super_admin':'owner'},restaurants:menu?restaurant:[],restaurant_applications:[],restaurant_subscriptions:[],billing_plans:[],billing_payments:[],contact_messages:[],menu_categories:[{id:'cat-1',name_ar:'الوجبات',is_visible:true}],menu_items:[{id:'item-1',category_id:'cat-1',name_ar:'برغر',price_ils:48,is_visible:true,is_available:true}]};
  const query=table=>{
    const q={
      select(){return q;},eq(){return q;},order(){return q;},gte(){return q;},lt(){return q;},limit(){return q;},
      single(){return Promise.resolve({data:tables[table],error:null});},
      maybeSingle(){return Promise.resolve({data:tables[table],error:null});},
      then(resolve,reject){return Promise.resolve({data:tables[table],error:null}).then(resolve,reject);}
    };
    return q;
  };
  const sb={from:query,auth:{getUser:async()=>({data:{user:admin?{id:'087a6e7f-100c-486d-ad0e-10880eb29695'}:null},error:null}),onAuthStateChange(){}}};
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
assert.ok(closed.includes('اطلب الانضمام'),'Closed onboarding needs working contact link');
assert.ok(!closed.includes('href="#signup"'),'Closed onboarding must not invite signups');

const opened=await render({open:true});
assert.ok(opened.includes('href="#signup"'),'Open registration should invite signups');
const signup=await render({hash:'#signup',open:true});
assert.ok(signup.includes('name="email"')&&signup.includes('privacy_ok'),'Signup form unavailable');

const closedSignup=await render({hash:'#signup'});
assert.ok(closedSignup.includes('التسجيل التجريبي'),'Direct signup must be blocked during SMTP setup');
const login=await render({hash:'#login'});
assert.ok(login.includes('#forgot-password'),'Missing password recovery link');

const dashboard=await render({hash:'#app',admin:true});
assert.ok(dashboard.includes('لوحة المدير العام')&&dashboard.includes('toggle-registration'),'Admin dashboard broken');
assert.ok(dashboard.includes('رسائل التواصل'),'Support inbox missing');

const menu=await render({hash:'#menu/tafrivo-demo',menu:true});
assert.ok(menu.includes('برغر')&&menu.includes('48'),'Public menu rendering broken');
console.log('TAFRIVO smoke checks: 8 scenarios + static files + payment-secret guard PASSED');
