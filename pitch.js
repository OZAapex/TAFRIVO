/* Public QR presentation for restaurant outreach. No personal data is collected. */
(()=>{
  'use strict';
  const base='https://ozaapex.github.io/TAFRIVO/';
  const destinations=[
    ['pitch-demo-qr',base+'#menu/tafrivo-demo'],
    ['pitch-join-qr',base+'join.html']
  ];
  for(const [id,url] of destinations){
    const canvas=document.getElementById(id);
    if(!canvas)continue;
    if(window.QRCode?.toCanvas){
      window.QRCode.toCanvas(canvas,url,{width:210,margin:2,errorCorrectionLevel:'H',color:{dark:'#0b3a2c',light:'#ffffff'}})
        .catch(()=>{canvas.replaceWith(document.createTextNode(url));});
    }else canvas.replaceWith(document.createTextNode(url));
  }
  for(const btn of document.querySelectorAll('[data-download-qr]')){
    btn.addEventListener('click',()=>{
      const canvas=document.getElementById(btn.dataset.downloadQr);
      if(!canvas||typeof canvas.toDataURL!=='function'){alert('الرمز غير متاح؛ افتح رابط التسجيل مباشرة.');return;}
      const a=document.createElement('a');
      a.download=btn.dataset.file||'TAFRIVO-QR.png';
      a.href=canvas.toDataURL('image/png');a.click();
    });
  }
  document.getElementById('pitch-print')?.addEventListener('click',()=>window.print());
})();