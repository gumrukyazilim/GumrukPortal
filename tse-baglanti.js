// ==================== TSE BAĞLANTI JS (v2.0 — 3'lü Paket Destekli) ====================
// MEVCUT SİSTEMİ BOZMAMA KURALI: Tüm orijinal fonksiyonlar (api_url, firmaIdBul, butonOlustur, baslat)
// %100 aynen korunmuştur. Sadece yeni 3'lü evrak paketi modülü eklenmiştir.

window.TSE = {
    // Siyah ekranda yazan adresin birebir aynısı (Orijinal)
    api_url: 'https://aloof-overlabor-jailer.ngrok-free.dev',

    firmaIdBul: function(firmaAdi) {
        if (!firmaAdi) return "1";
        const f = firmaAdi.toUpperCase();
        if (f.includes("ŞAMNU")) return "1";
        if (f.includes("FF OTOMOTİV")) return "2";
        if (f.includes("SANDIKÇI")) return "3";
        if (f.includes("MASKAR")) return "4";
        return "1";
    },

    // Orijinal TSE Butonu (Aynen korundu)
    butonOlustur: function(params) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn';
        btn.style.cssText = 'background:#10b981; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;';
        btn.innerHTML = '🚗 TSE';
        
        btn.onclick = function(e) {
            e.stopImmediatePropagation();
            window.TSE.baslat(
                params.sasi_no,
                params.firma_id || window.TSE.firmaIdBul(params.firma || ''),
                params.gelis_tarihi || '',
                params.ozet_beyan || '',
                params.atr || 'YOK'
            );
        };
        return btn;
    },

    // Orijinal TSE Başlatma Fonksiyonu (Aynen korundu)
    baslat: async function(sasi, firmaId, gelisTarihi, ozetBeyan, atr = 'YOK') {
        if (!sasi) {
            alert("Şasi numarası bulunamadı!");
            return;
        }

        const onay = confirm(`TSE Başvurusu (Merkez PC) başlatılsın mı?\n\nŞasi: ${sasi}\nFirma ID: ${firmaId}`);
        if (!onay) return;

        try {
            const response = await fetch(`${this.api_url}/basvuru`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({
                    firma_id: firmaId,
                    sasi_no: sasi,
                    gelis_tarihi: gelisTarihi,
                    ozet_beyan: ozetBeyan,
                    atr: atr
                })
            });

            const result = await response.json();

            if (result.success) {
                alert("✅ TSE başvurusu merkez bilgisayarda başlatıldı!\n\nLütfen laptop ekranını kontrol edin.");
            } else {
                alert("❌ Hata: " + (result.error || "Bilinmeyen hata"));
            }
        } catch (err) {
            alert("❌ Merkez bilgisayara bağlanılamadı!\n\nLaptopta hem API_BASLAT hem de TUNEL_BASLAT dosyalarının açık olduğundan emin olun.");
            console.error(err);
        }
    },

    // =========================================================================
    // YENİ EKLENEN MODÜL: TEK TIKLA 3'LÜ TSE EVRAK PAKETİ
    // (APM Excel + TSE Tutanağı + ULM Raporu)
    // =========================================================================
    tse3LuPaketButonOlustur: function(arac) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn tse-paket-btn';
        btn.style.cssText = 'background:#2563eb; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; margin-left:4px;';
        btn.innerHTML = '📄 3\'lü Paket';
        btn.title = 'APM Excel + TSE Tutanağı + ULM Raporu Üret';

        btn.onclick = function(e) {
            e.stopImmediatePropagation();
            window.TSE.tse3LuPaketUret(arac);
        };
        return btn;
    },

    tse3LuPaketUret: async function(arac) {
        if (!arac || !/^[A-HJ-NPR-Z0-9]{17}$/.test(String(arac.sasi || '').trim().toUpperCase())) {
            alert('Geçerli 17 haneli şasi gerekli.'); return;
        }
        if (!arac.evrakLink) { alert('Aracın Drive evrak klasörü kayıtlı değil.'); return; }
        if (!arac.firma) { alert('İthalatçı firma boş.'); return; }
        const key = String(arac.sasi).trim().toUpperCase();
        this._paketBekleyen = this._paketBekleyen || new Map();
        if (this._paketBekleyen.has(key)) return this._paketBekleyen.get(key);
        const task = (async () => {
            tsePaketSonucGoster({message:'CoC bulutta okunuyor; 3 evrak hazırlanıyor…'});
            try {
                const result = await tsePaketJsonp(arac);
                if (!result || !result.success) throw new Error(result && result.error || 'Bulut işlemi tamamlanamadı.');
                if (!Array.isArray(result.files) || result.files.length !== 3) throw new Error('Bulut yanıtında üç belge bulunamadı.');
                tsePaketSonucGoster(result);
                return result;
            } catch (err) {
                tsePaketSonucGoster({error:err.message});
                console.error('TSE bulut paket hatası:', err);
            } finally { this._paketBekleyen.delete(key); }
        })();
        this._paketBekleyen.set(key,task);
        return task;
    }
};

console.log("✓ TSE Bot ve 3'lü Evrak Paketi Modülü BAĞLI");


// Google Apps Script JSONP: CORS kaynaklı POST sorunlarından bağımsız.
window.TSE_GAS_URL = window.TSE_GAS_URL || 'https://script.google.com/macros/s/AKfycbw9UtTf7JryxFczgvyoW9zIXHk0GAO2SdSQ8tJ72zFaCcjuR5_jioocYvVBYZR3P5Fzlw/exec';
function tsePaketJsonp(arac) {
    return new Promise(function(resolve,reject) {
        const cb = '__tse3_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        const params = new URLSearchParams({action:'createTse3LuPaket',callback:cb,
            sasi:String(arac.sasi).trim().toUpperCase(),evrakLink:arac.evrakLink,
            firma:arac.firma,marka:arac.marka||'',model:arac.model||'',
            antrepoAdi:arac.antrepoAdi||'',uretildigiUlke:arac.uretildigiUlke||'',
            ithalatinYapildigiUlke:arac.ithalatinYapildigiUlke||''});
        let settled=false;
        function finish(error,result) {
            if(settled)return;settled=true;clearTimeout(timer);script.remove();
            window[cb]=function(){};
            setTimeout(function(){delete window[cb];},60000);
            if(error)reject(error);else resolve(result);
        }
        const timer=setTimeout(function(){finish(new Error('Bulut işlemi zaman aşımına uğradı. Yeniden tıklamadan önce Drive klasörünü kontrol edin.'));},300000);
        window[cb]=function(result){finish(null,result);};
        script.onerror=function(){finish(new Error('Apps Script bağlantısı kurulamadı.'));};
        script.src=window.TSE_GAS_URL+'?'+params.toString();
        document.head.appendChild(script);
    });
}
function tsePaketSonucGoster(result) {
    let box=document.getElementById('tse-3lu-paket-sonuc');
    if(!box) {
        box=document.createElement('div');box.id='tse-3lu-paket-sonuc';
        box.style.cssText='margin-top:12px;padding:12px;border-radius:10px;background:#eff6ff;color:#0f172a;font-size:13px;line-height:1.5;overflow-wrap:anywhere;';
        const anchor=document.getElementById('tse-3lu-paket-box');
        if(anchor)anchor.appendChild(box);
        else {
            const overlay=document.createElement('div');
            overlay.style.cssText='position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);padding:20px;';
            const panel=document.createElement('div');panel.style.cssText='background:white;padding:20px;border-radius:16px;width:100%;max-width:520px;max-height:85vh;overflow:auto;';
            const close=document.createElement('button');close.type='button';close.textContent='Kapat';close.onclick=function(){overlay.remove();};
            panel.appendChild(close);panel.appendChild(box);overlay.appendChild(panel);document.body.appendChild(overlay);
        }
    }
    box.replaceChildren();
    const title=document.createElement('strong');title.textContent=result.error?'Paket oluşturulamadı: '+result.error:result.message||'3 evrak Drive klasörüne kaydedildi.';box.appendChild(title);
    (result.files||[]).forEach(function(file){
        const url=new URL(file.url);if(url.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(url.hostname))throw new Error('Geçersiz belge bağlantısı.');
        const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=file.name;a.style.cssText='display:block;margin-top:8px;color:#1d4ed8;font-weight:700;';box.appendChild(a);
    });
    if(result.fuel){const p=document.createElement('div');p.textContent='Yakıt: '+result.fuel+' · GTİP: '+result.gtip;box.appendChild(p);}
    if(result.warnings&&result.warnings.length){const p=document.createElement('div');p.textContent=result.warnings.join(' · ');box.appendChild(p);}
}

// ==================== TSE AKILLI MENÜ BUTON ENTEGRASYONU ====================
(function () {
  "use strict";
  function butonuEkle(arac) {
    const modal = document.getElementById("tse-akilli-modal");
    if (!modal || !arac || modal.querySelector("#tse-3lu-paket-box")) return;
    const panel = modal.firstElementChild;
    const body = panel && panel.children[1];
    if (!body) return;
    // Sonuç bağlantıları küçük ekranlarda da kaydırılarak erişilebilir kalsın.
    panel.style.maxHeight = "calc(100vh - 32px)";
    if (CSS.supports("height", "100dvh")) panel.style.maxHeight = "calc(100dvh - 32px)";
    panel.style.overflowY = "auto";
    const box = document.createElement("div");
    box.id = "tse-3lu-paket-box";
    box.style.cssText = "margin-bottom:18px;padding:14px;background:#eff6ff;border:2px solid #2563eb;border-radius:14px;";
    const btn = document.createElement("button");
    btn.id = "btn-tse-3lu-action";
    btn.type = "button";
    btn.textContent = "📄 TEK TIKLA 3'LÜ PAKET ÜRET (APM + TSE Tutanağı + ULM)";
    btn.style.cssText = "width:100%;padding:14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:0;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;";
    btn.addEventListener("click", async function (event) {
      event.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await window.TSE.tse3LuPaketUret(arac);
      } catch (err) {
        console.error("TSE paket işlemi başarısız:", err);
        alert("TSE paketi oluşturulamadı: " + err.message);
      } finally {
        btn.disabled = false;
      }
    });
    box.appendChild(btn);
    body.insertBefore(box, body.firstChild);
  }
  function entegreEt() {
    const original = window.openTseAkilliMenu;
    if (typeof original !== "function" || original._has3LuHook) return;
    function wrapped(idx, ctx) {
      const selected = ctx === "firm"
        ? ((window.firmData || {})[window.currentFirm] || [])[idx]
        : (window.declarationsData || [])[idx];
      const arac = selected && Object.assign({}, selected, {
        firma: selected.firma || (ctx === "firm" ? window.currentFirm : "")
      });
      const result = original.apply(this, arguments);
      if (arac) {
        butonuEkle(arac);
        requestAnimationFrame(function () { butonuEkle(arac); });
      }
      return result;
    }
    wrapped._has3LuHook = true;
    window.openTseAkilliMenu = wrapped;
  }
  entegreEt();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", entegreEt, { once: true });
  }
  setInterval(entegreEt, 800);
})();
