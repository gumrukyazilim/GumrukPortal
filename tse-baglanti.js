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
        btn.innerHTML = '📄 4\'lü Paket';
        btn.title = 'APM Excel + TSE Tutanağı + ULM Raporu + Egzoz PDF Üret';

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
            tsePaketSonucGoster({message:'CoC bulutta okunuyor; 4 evrak hazırlanıyor…'});
            try {
                const result = await tsePaketJsonp(arac);
                if (!result || !result.success) throw new Error(result && result.error || 'Bulut işlemi tamamlanamadı.');
                if (!Array.isArray(result.files) || !['apm','tse','ulm','egzoz'].every(type=>result.files.some(file=>file.type===type&&file.url))) throw new Error('Bulut yanıtında zorunlu APM, TSE Tutanağı, ULM ve Egzoz PDF belgelerinden biri eksik.');
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
            firma:arac.firma,marka:arac.marka||'',model:arac.model||'',renk:arac.renk||'',
            antrepoAdi:'Y.O.İ.G.M',uretildigiUlke:arac.uretildigiUlke||arac.menseUlke||'',
            ithalatinYapildigiUlke:arac.cikisUlke||arac.ithalatUlkesi||arac.ithalatinYapildigiUlke||'',
            gonderici:arac.gonderici||arac.ihracatci||'',
            basvuruNo:arac.basvuruNo||arac.tseBasvuruNo||'',basvuruTarihi:arac.basvuruTarihi||arac.tseBasvuruTarihi||'',
            raporNo:arac.raporNo||arac.tseRaporNo||'',raporTarihi:arac.raporTarihi||'',
            motorNo:arac.motorNo||arac.motorNumarasi||'',yetkili:arac.yetkili||arac.imzaYetkilisi||'',unvan:arac.unvan||'',
            art44:(arac.art44===true||(arac.evrakler&&arac.evrakler.ART44===true))?'1':'',
            art45:(arac.art45===true||(arac.evrakler&&arac.evrakler.ART45===true))?'1':'',basvuruTuru:arac.basvuruTuru||''});
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
    const title=document.createElement('strong');title.textContent=result.error?'Paket oluşturulamadı: '+result.error:result.message||`${(result.files||[]).length} evrak Drive klasörüne kaydedildi.`;box.appendChild(title);
    (result.files||[]).forEach(function(file){
        const url=new URL(file.url);if(url.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(url.hostname))throw new Error('Geçersiz belge bağlantısı.');
        const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=file.name;a.style.cssText='display:block;margin-top:8px;color:#1d4ed8;font-weight:700;';box.appendChild(a);
    });
    if(result.fuel){const p=document.createElement('div');p.textContent='Yakıt: '+result.fuel+(result.yakitTahrik?' ('+result.yakitTahrik+')':'')+' · GTİP: '+result.gtip;box.appendChild(p);}
    // Orijinal CoC ↔ CoC_TR çapraz kontrolü: uyumsuzluk kırmızı kutuda, kontrol yapılamadıysa gri bilgi satırı.
    (result.caprazUyarilar||[]).forEach(function(u){
        const uyumsuz=result.caprazKontrol&&result.caprazKontrol.durum==='uyumsuz'&&/^⚠️/.test(u);
        const p=document.createElement('div');p.textContent=u;
        p.style.cssText=uyumsuz?'margin-top:10px;padding:10px;border:2px solid #dc2626;border-radius:8px;background:#fef2f2;color:#991b1b;font-weight:700;':'margin-top:8px;color:#64748b;';
        box.appendChild(p);
    });
    if(result.caprazKontrol&&result.caprazKontrol.durum==='dogrulandi'){const p=document.createElement('div');p.textContent='✅ Orijinal CoC ile CoC_TR çapraz doğrulandı ('+(result.caprazKontrol.dogrulanan||[]).length+' alan).';p.style.cssText='margin-top:8px;color:#15803d;font-weight:600;';box.appendChild(p);}
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
    btn.textContent = "📄 TEK TIKLA 4'LÜ PAKET ÜRET (APM + TSE Tutanağı + ULM + Egzoz)";
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

// ==================== ⚡ HIZLI 4'LÜ PAKET (DRIVE'DAN — PORTALA KAYIT YOK) ====================
// Portala araç eklemeden seçilen Drive klasöründeki CoC ile mevcut 4'lü paket motorunu
// (createTse3LuPaket, tsePaketJsonp) çalıştırır; 4 belge o klasöre kaydedilir.
// Birincil yol: firma seç → firmanın GÜMRÜK ARŞİVİ'ndeki araç klasörlerinden tıklayarak seç.
// Link/ID yapıştırma ve tüm Drive'da arama da desteklenir.
// SIFIR VERİTABANI: bu modül Firebase'e, Gelen/Gelecek Araçlar listelerine, gümrük ambarı
// 20 gün sayacına veya alarmlara HİÇBİR şey yazmaz; yalnız Apps Script'i JSONP ile çağırır.
(function () {
  "use strict";
  const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
  const TURLER = [["apm", "APM Şablonu"], ["tse", "TSE Tutanağı"], ["ulm", "ULM Raporu"], ["egzoz", "Egzoz Raporu"]];
  const VARSAYILAN_FIRMA = "MASKAR";
  // GÜMRÜK ARŞİVİ kökündeki firma olmayan klasörler; firma listesinde gösterilmez (norm anahtarıyla).
  const FIRMA_DISI_KLASORLER = ["GENEL", "GUMRUKYEDEK", "TSEEVRAKLARI", "BAZILIKACAFE"];
  // Firma klasörü kısa adı (norm anahtarı) → TSE belgelerindeki tam resmi ticaret unvanı (onaylı ULM raporundaki yazım).
  const RESMI_UNVANLAR = { MASKAR: "MASKAR INSAAT OTOMOTIV TEKSTIL MAKINA SANAYI TIC.LTD.ŞTİ" };
  // İthalat / menşe ülkesi seçim listesi (APM'nin kabul ettiği TSE yazımı).
  const ULKELER = ["ALMANYA", "AVUSTURYA", "BELÇİKA", "BİRLEŞİK ARAP EMİRLİKLERİ", "ÇEK CUMHURİYETİ", "DANİMARKA", "FRANSA", "HOLLANDA",
    "İNGİLTERE", "İSPANYA", "İSVEÇ", "İSVİÇRE", "İTALYA", "LÜKSEMBURG", "MACARİSTAN", "POLONYA", "PORTEKİZ", "SLOVAKYA", "SLOVENYA",
    "AMERİKA", "KANADA", "JAPONYA", "G.KORE", "ÇİN", "GÜRCİSTAN", "BULGARİSTAN", "ROMANYA", "YUNANİSTAN"];
  // Karşılaştırma anahtarı: büyük harf, Türkçe harfler sadeleşir (audi = AUDİ = AUDI), yalnız harf/rakam.
  const norm = function (s) {
    const tr = { "Ç": "C", "Ğ": "G", "İ": "I", "Ö": "O", "Ş": "S", "Ü": "U" };
    return String(s || "").toLocaleUpperCase("tr").replace(/[ÇĞİÖŞÜ]/g, function (c) { return tr[c]; }).replace(/[^A-Z0-9]/g, "");
  };
  const H = window.HIZLI_PAKET = {
    // Girdi türü: klasör linki/ID'si, 17 haneli şasi ya da klasör adı parçası.
    girdiCozumle: function (girdi) {
      const q = String(girdi || "").trim();
      const m = q.match(/folders\/([A-Za-z0-9_-]{10,})/) || q.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
      if (m) return { tur: "klasor", id: m[1], q: q };
      if (VIN_RE.test(q.toUpperCase())) return { tur: "sasi", sasi: q.toUpperCase(), q: q.toUpperCase() };
      if (/^[A-Za-z0-9_-]{25,}$/.test(q)) return { tur: "klasor", id: q, q: q };
      return { tur: "metin", q: q };
    },
    klasorLinki: function (id) { return "https://drive.google.com/drive/folders/" + encodeURIComponent(id); },
    // Kayıtlı firma adları ve kullanım sayıları yalnız bellekteki listelerden OKUNUR.
    firmaSayilari: function () {
      const say = new Map();
      const ekle = function (f, n) { f = String(f || "").trim(); if (!f || /\.\.\./.test(f)) return; f = f.toLocaleUpperCase("tr"); say.set(f, (say.get(f) || 0) + n); };
      const fy = window.FIRMA_YETKILI || {};
      Object.keys(fy).forEach(function (k) { if (k !== "_DEFAULT") ekle(fy[k] && fy[k].resmiUnvan, 0); });
      (window.declarationsData || []).forEach(function (d) { ekle(d && d.firma, 1); });
      (window.gelecekData || []).forEach(function (d) { ekle(d && d.firma, 1); });
      Object.keys(window.firmData || {}).forEach(function (f) { ekle(f, 0); });
      return say;
    },
    firmaListesi: function () {
      return Array.from(H.firmaSayilari().keys()).sort(function (a, b) { return a.localeCompare(b, "tr"); });
    },
    // Drive firma klasörü adı (örn. "MASKAR") → belgelerde yazacak tam firma adı.
    // Kayıtlı adlardan klasör adıyla başlayan en çok kullanılanı (eşitlikte en kısası); yoksa klasör adı.
    firmaEslestir: function (klasorAdi) {
      const n = norm(klasorAdi);
      if (!n) return "";
      const resmi = Object.keys(RESMI_UNVANLAR).filter(function (k) { return n.indexOf(k) === 0; })[0];
      if (resmi) return RESMI_UNVANLAR[resmi];
      const say = H.firmaSayilari();
      const aday = Array.from(say.keys()).filter(function (f) { return norm(f).indexOf(n) === 0; })
        .sort(function (a, b) { return say.get(b) - say.get(a) || a.length - b.length; });
      return aday[0] || String(klasorAdi).trim().toLocaleUpperCase("tr");
    },
    varsayilanFirmaIndeksi: function (firmalar) {
      const i = (firmalar || []).findIndex(function (f) { return norm(f.ad).indexOf(VARSAYILAN_FIRMA) >= 0; });
      return i >= 0 ? i : 0;
    },
    // Araç listesi süzgeci: klasör adı, marka veya şasi içinde geçen her kelime.
    aracFiltrele: function (araclar, q) {
      const kelimeler = String(q || "").trim().split(/\s+/).map(norm).filter(Boolean);
      if (!kelimeler.length) return (araclar || []).slice();
      return (araclar || []).filter(function (a) {
        const metin = norm(a.ad) + " " + norm(a.marka) + " " + (a.sasiler || []).map(norm).join(" ");
        return kelimeler.every(function (k) { return metin.indexOf(k) >= 0; });
      });
    },
    jsonp: function (params, sureMs) {
      return new Promise(function (resolve, reject) {
        const cb = "__hizliPaket_" + Date.now() + "_" + Math.random().toString(36).slice(2);
        const script = document.createElement("script");
        let bitti = false;
        function bitir(err, res) {
          if (bitti) return; bitti = true; clearTimeout(timer); script.remove();
          window[cb] = function () {}; setTimeout(function () { delete window[cb]; }, 60000);
          if (err) reject(err); else resolve(res);
        }
        const timer = setTimeout(function () { bitir(new Error("Apps Script yanıt vermedi (zaman aşımı).")); }, sureMs || 60000);
        window[cb] = function (res) { bitir(null, res); };
        script.onerror = function () { bitir(new Error("Apps Script bağlantısı kurulamadı.")); };
        script.src = window.TSE_GAS_URL + "?" + new URLSearchParams(Object.assign({ callback: cb }, params)).toString();
        document.head.appendChild(script);
      });
    },
    firmalariGetir: async function () {
      const res = await H.jsonp({ action: "hizliFirmalar" }, 60000);
      if (!res || !res.success) throw new Error((res && res.error) || "Firma klasörleri okunamadı.");
      return H.firmaKlasorleriSuz(res.firmalar);
    },
    firmaKlasorleriSuz: function (firmalar) {
      return (firmalar || []).filter(function (f) { return f && FIRMA_DISI_KLASORLER.indexOf(norm(f.ad)) < 0; });
    },
    araclariGetir: async function (firmaId) {
      const res = await H.jsonp({ action: "hizliAracKlasorleri", firmaId: firmaId }, 90000);
      if (!res || !res.success) throw new Error((res && res.error) || "Araç klasörleri okunamadı.");
      return res.araclar || [];
    },
    // Link/ID/şasi/ad ile tüm Drive'da arama. Şasi Drive adlarında yoksa portalın salt okunur
    // arşiv araması (köprü klasorAra) denenir; klasör OLUŞTURULMAZ.
    adaylariGetir: async function (girdi) {
      const g = H.girdiCozumle(girdi);
      if (g.q.length < 3) throw new Error("Klasör linki, ID, şasi veya klasör adı girin.");
      const res = await H.jsonp({ action: "hizliKlasorBul", q: g.tur === "klasor" ? g.id : g.q }, 60000);
      if (!res || !res.success) throw new Error((res && res.error) || "Drive klasörü aranamadı.");
      let adaylar = res.adaylar || [];
      if (!adaylar.length && g.tur === "sasi" && typeof window.gelecekKlasorAraSasi === "function") {
        const kopru = await window.gelecekKlasorAraSasi(g.sasi);
        adaylar = (kopru || []).filter(function (a) { return a && a.url; }).map(function (a) {
          const id = (String(a.url).match(/folders\/([A-Za-z0-9_-]+)/) || [])[1] || "";
          const ds = a.dosyalar || [];
          const yol = String(a.yol || "").split("/").map(function (s) { return s.trim(); }).filter(Boolean);
          return { id: id, ad: a.yol || a.ad || a.url, url: a.url, sasiler: [g.sasi], firma: yol.length > 1 ? yol[0] : "",
            pdfSayisi: ds.filter(function (n) { return /\.pdf$/i.test(n); }).length,
            cocSayisi: ds.filter(function (n) { return /\.pdf$/i.test(n) && /coc|conformity|uygunluk|bereinstimmung/i.test(n); }).length };
        }).filter(function (a) { return a.id; });
      }
      // Şasiyle aranmışsa o şasi her adayda ilk öneri olur; CoC'lu klasörler öne alınır.
      if (g.tur === "sasi") adaylar.forEach(function (a) { a.sasiler = [g.sasi].concat((a.sasiler || []).filter(function (s) { return s !== g.sasi; })); });
      return adaylar.slice().sort(function (a, b) { return (b.cocSayisi || 0) - (a.cocSayisi || 0) || (b.pdfSayisi || 0) - (a.pdfSayisi || 0); });
    },
    // Firma adı asla boş gitmez: boşsa seçilen klasörün firma (üst) klasör adı kullanılır ve uyarı döner.
    firmaBelirle: function (form) {
      const yazilan = String(form.firma || "").trim();
      // Yalnız kısa ad yazılmışsa (ör. "Maskar") tam resmi unvana çevrilir.
      if (yazilan) return { firma: RESMI_UNVANLAR[norm(yazilan)] || yazilan.toLocaleUpperCase("tr"), uyari: "" };
      const ust = String(form.ustKlasorFirma || "").trim();
      if (ust) {
        const firma = H.firmaEslestir(ust);
        return { firma: firma, uyari: "⚠️ Başvuran firma adı boştu; aracın üst klasör adından \"" + firma + "\" kullanıldı." };
      }
      throw new Error("Başvuran firma adı boş ve klasörün üst klasöründen de bulunamadı; firmayı seçin.");
    },
    // Motorun beklediği alanlar; yalnız bu nesne Apps Script'e gider, hiçbir yere kaydedilmez.
    paketParametreleri: function (form) {
      const t = function (v) { return String(v || "").trim(); };
      const sasi = t(form.sasi).toUpperCase();
      if (!t(form.klasorId)) throw new Error("Önce listeden aracın Drive klasörünü seçin.");
      if (!VIN_RE.test(sasi)) throw new Error("Geçerli 17 haneli şasi gerekli (klasör adında bulunamadıysa elle yazın).");
      const f = H.firmaBelirle(form);
      return { sasi: sasi, evrakLink: H.klasorLinki(t(form.klasorId)), firma: f.firma,
        basvuruNo: t(form.basvuruNo), basvuruTarihi: t(form.basvuruTarihi), marka: t(form.marka), renk: t(form.renk),
        uretildigiUlke: t(form.uretildigiUlke), cikisUlke: t(form.cikisUlke) };
    },
    sonucDogrula: function (res) {
      if (!res || !res.success) {
        const hata = new Error((res && res.error) || "Bulut işlemi tamamlanamadı.");
        hata.kod = (res && res.kod) || "";
        throw hata;
      }
      const files = Array.isArray(res.files) ? res.files : [];
      const eksik = TURLER.filter(function (t) { return !files.some(function (f) { return f && f.type === t[0] && f.url; }); });
      if (eksik.length) throw new Error("Bulut yanıtında eksik belge: " + eksik.map(function (t) { return t[1]; }).join(", "));
      files.forEach(function (f) {
        const u = new URL(f.url);
        if (u.protocol !== "https:" || ["drive.google.com", "docs.google.com"].indexOf(u.hostname) < 0) throw new Error("Geçersiz belge bağlantısı: " + f.name);
      });
      return res;
    },
    indirmeLinki: function (file) {
      return file && /^[A-Za-z0-9_-]+$/.test(String(file.id || "")) ? "https://drive.google.com/uc?export=download&id=" + file.id : "";
    },
    uret: async function (form) {
      const arac = H.paketParametreleri(form);
      if (typeof window.tsePaketJsonp !== "function") throw new Error("TSE paket motoru yüklenemedi; sayfayı yenileyin.");
      return H.sonucDogrula(await window.tsePaketJsonp(arac));
    },

    // ---------- Arayüz ----------
    ac: function () {
      H.kapat();
      const ov = document.createElement("div");
      ov.id = "hizli-paket-modal";
      ov.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.6);padding:16px;";
      const girdi = "padding:9px 10px;border-radius:8px;border:1px solid var(--border,#cbd5e1);background:var(--input-bg,#fff);color:inherit;min-width:0;";
      const etiket = "display:grid;gap:4px;font-size:12px;font-weight:700;";
      const soluk = "font-weight:400;color:var(--text-muted,#64748b);";
      ov.innerHTML =
        '<div style="background:var(--bg-surface,#fff);color:var(--text-primary,#0f172a);border:1px solid var(--border,#e2e8f0);border-radius:16px;width:100%;max-width:600px;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.35);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border,#e2e8f0);">' +
        '<div><div style="font-size:16px;font-weight:800;">⚡ Hızlı 4\'lü Paket (Drive\'dan)</div><div style="font-size:12px;color:var(--text-muted,#64748b);margin-top:2px;">Portala araç kaydedilmez · belgeler seçilen klasöre yazılır</div></div>' +
        '<button type="button" data-hp="kapat" aria-label="Kapat" style="background:none;border:0;font-size:22px;cursor:pointer;color:var(--text-secondary,#475569);">×</button></div>' +
        '<div style="padding:16px 18px;display:grid;gap:12px;">' +
        '<label style="' + etiket + '">1. Firma<select data-hp="firmaKlasor" style="' + girdi + '"><option value="">Firma klasörleri yükleniyor…</option></select></label>' +
        '<label style="' + etiket + '">2. Araç klasörü <span style="' + soluk + '">listeden tıklayarak seçin</span>' +
        '<div style="display:flex;gap:6px;"><input data-hp="ara" type="search" autocomplete="off" placeholder="Şasi, marka veya klasör adıyla süz…" style="flex:1;' + girdi + '">' +
        '<button type="button" data-hp="genelAra" title="Tüm Drive\'da ara" style="padding:9px 12px;border-radius:8px;border:1px solid var(--border,#cbd5e1);background:var(--bg-elevated,#f1f5f9);color:inherit;font-weight:700;cursor:pointer;white-space:nowrap;">🔎 Tüm Drive</button></div></label>' +
        '<div data-hp="liste" role="listbox" style="display:grid;gap:6px;max-height:260px;overflow:auto;padding:2px;"></div>' +
        '<details data-hp="linkKutu" style="font-size:12px;"><summary style="cursor:pointer;font-weight:700;">Link / ID yapıştır</summary>' +
        '<div style="display:flex;gap:6px;margin-top:8px;"><input data-hp="kaynak" type="text" autocomplete="off" placeholder="https://drive.google.com/drive/folders/…" style="flex:1;' + girdi + '">' +
        '<button type="button" data-hp="bul" style="padding:9px 12px;border-radius:8px;border:1px solid var(--border,#cbd5e1);background:var(--bg-elevated,#f1f5f9);color:inherit;font-weight:700;cursor:pointer;">Bul</button></div></details>' +
        '<div data-hp="secili" style="font-size:12px;color:var(--text-secondary,#475569);"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<label style="' + etiket + '">Şasi No<input data-hp="sasi" type="text" maxlength="17" autocomplete="off" style="' + girdi + 'font-family:var(--font-mono,monospace);text-transform:uppercase;"></label>' +
        '<label style="' + etiket + '">Belgelerdeki firma adı<input data-hp="firma" type="text" list="hizli-paket-firmalar" autocomplete="off" style="' + girdi + '"><datalist id="hizli-paket-firmalar"></datalist></label></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        '<label style="' + etiket + '"><span>3. Başvuru No <span style="' + soluk + '">(isteğe bağlı)</span></span><input data-hp="basvuruNo" type="text" autocomplete="off" style="' + girdi + '"></label>' +
        '<label style="' + etiket + '"><span>Başvuru Tarihi <span style="' + soluk + '">(isteğe bağlı)</span></span><input data-hp="basvuruTarihi" type="date" style="' + girdi + '"></label></div>' +
        '<div style="font-size:11px;color:var(--text-muted,#64748b);margin-top:-6px;">Başvuru no boş bırakılırsa belgeler taslak olarak üretilir.</div>' +
        '<details style="font-size:12px;"><summary style="cursor:pointer;font-weight:700;">Ek bilgiler (isteğe bağlı)</summary><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">' +
        ["marka:Marka", "renk:Renk", "uretildigiUlke:Menşe ülke", "cikisUlke:İthalat (çıkış) ülkesi"].map(function (x) {
          const p = x.split(":");
          const liste = /Ulke$/.test(p[0]) ? ' list="hizli-paket-ulkeler"' : "";
          return '<label style="display:grid;gap:4px;font-weight:600;">' + p[1] + '<input data-hp="' + p[0] + '" type="text" autocomplete="off"' + liste + ' style="' + girdi + '"></label>';
        }).join("") + '<datalist id="hizli-paket-ulkeler">' + ULKELER.map(function (u) { return '<option value="' + u + '">'; }).join("") + '</datalist>' +
        '</div><div style="color:var(--text-muted,#64748b);margin-top:6px;">Boş bırakılan alanlar CoC ve şasiden okunur.</div></details>' +
        '<button type="button" data-hp="uret" style="padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-size:14px;font-weight:800;cursor:pointer;">⚡ Paketi Üret</button>' +
        '<div data-hp="sonuc" aria-live="polite" style="font-size:13px;line-height:1.5;overflow-wrap:anywhere;"></div>' +
        "</div></div>";
      document.body.appendChild(ov);
      const el = function (k) { return ov.querySelector('[data-hp="' + k + '"]'); };
      const dl = ov.querySelector("#hizli-paket-firmalar");
      H.firmaListesi().forEach(function (f) { const o = document.createElement("option"); o.value = f; dl.appendChild(o); });
      H._durum = { klasorId: "", otomatikSasi: "", otomatikFirma: "", ustFirma: "", firmalar: [], araclar: [] };
      ov.addEventListener("click", function (e) { if (e.target === ov || e.target === el("kapat")) H.kapat(); });
      el("firmaKlasor").addEventListener("change", function () { H._firmaDegisti(ov); });
      el("ara").addEventListener("input", function () { H._listeCiz(ov); });
      el("ara").addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const s = H.aracFiltrele(H._durum.araclar, el("ara").value);
        if (s.length === 1) H._sec(ov, s[0]); else if (!s.length) H._bul(ov, el("ara").value);
      });
      el("genelAra").addEventListener("click", function () { H._bul(ov, el("ara").value); });
      el("bul").addEventListener("click", function () { H._bul(ov, el("kaynak").value); });
      el("kaynak").addEventListener("keydown", function (e) { if (e.key === "Enter") H._bul(ov, el("kaynak").value); });
      el("uret").addEventListener("click", function () { H._uretTikla(ov); });
      H._firmalariYukle(ov);
    },
    kapat: function () { const m = document.getElementById("hizli-paket-modal"); if (m) m.remove(); },
    _mesaj: function (ov, metin, tur) {
      const box = ov.querySelector('[data-hp="sonuc"]');
      box.replaceChildren();
      if (!metin) return;
      const d = document.createElement("div");
      d.textContent = metin;
      d.style.cssText = "padding:10px 12px;border-radius:10px;" + (tur === "hata" ? "background:#fef2f2;color:#991b1b;border:1px solid #fecaca;" : tur === "uyari" ? "background:#fffbeb;color:#92400e;border:1px solid #fde68a;" : "background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe;");
      box.appendChild(d);
    },
    // Firma alanı yalnız boşken ya da önceki otomatik değerken doldurulur; elle yazılan ezilmez.
    _firmaYaz: function (ov, firma) {
      const f = ov.querySelector('[data-hp="firma"]');
      if (!firma || (f.value && f.value !== H._durum.otomatikFirma)) return;
      f.value = firma; H._durum.otomatikFirma = firma;
    },
    _firmalariYukle: async function (ov) {
      const sel = ov.querySelector('[data-hp="firmaKlasor"]');
      let firmalar = [];
      try { firmalar = await H.firmalariGetir(); }
      catch (err) { H._mesaj(ov, "Firma klasörleri okunamadı (" + err.message + "). Link yapıştırabilir veya Tüm Drive araması yapabilirsiniz.", "uyari"); }
      if (!document.body.contains(ov)) return;
      H._durum.firmalar = firmalar;
      sel.replaceChildren();
      if (!firmalar.length) {
        // Drive listesi gelmezse kayıtlı firmalar seçenek olur (yalnız ad; araç listesi yok).
        H.firmaListesi().forEach(function (f) { const o = document.createElement("option"); o.value = ""; o.textContent = f; o.dataset.ad = f; sel.appendChild(o); });
        const i = Math.max(0, Array.from(sel.options).findIndex(function (o) { return norm(o.dataset.ad).indexOf(VARSAYILAN_FIRMA) === 0; }));
        if (sel.options[i]) { sel.selectedIndex = i; H._firmaYaz(ov, sel.options[i].dataset.ad); }
        return;
      }
      firmalar.forEach(function (f) { const o = document.createElement("option"); o.value = f.id; o.textContent = f.ad; o.dataset.ad = f.ad; sel.appendChild(o); });
      sel.selectedIndex = H.varsayilanFirmaIndeksi(firmalar);
      H._firmaDegisti(ov);
    },
    _firmaDegisti: async function (ov) {
      const sel = ov.querySelector('[data-hp="firmaKlasor"]');
      const o = sel.options[sel.selectedIndex];
      if (!o) return;
      H._firmaYaz(ov, H.firmaEslestir(o.dataset.ad));
      H._durum.ustFirma = o.dataset.ad;
      if (!o.value) return;
      const liste = ov.querySelector('[data-hp="liste"]');
      H._durum.araclar = [];
      liste.replaceChildren();
      const y = document.createElement("div"); y.textContent = "⏳ " + o.dataset.ad + " araç klasörleri yükleniyor…"; y.style.cssText = "font-size:12px;color:var(--text-muted,#64748b);padding:6px;"; liste.appendChild(y);
      const istek = H._durum.istek = o.value;
      try {
        const araclar = await H.araclariGetir(o.value);
        if (H._durum.istek !== istek) return; // bu arada başka firma seçildi
        H._durum.araclar = araclar;
        H._listeCiz(ov);
      } catch (err) {
        if (H._durum.istek !== istek) return;
        liste.replaceChildren();
        H._mesaj(ov, "Araç klasörleri okunamadı: " + err.message, "hata");
      }
    },
    _satir: function (ov, a) {
      const k = document.createElement("button");
      k.type = "button"; k.setAttribute("data-hp-aday", a.id); k.setAttribute("role", "option");
      k.style.cssText = "text-align:left;padding:8px 11px;border-radius:10px;border:1px solid var(--border,#e2e8f0);background:var(--bg-elevated,#f8fafc);color:inherit;cursor:pointer;";
      const ad = document.createElement("div"); ad.textContent = "📁 " + a.ad; ad.style.cssText = "font-weight:700;font-family:var(--font-mono,inherit);";
      const alt = document.createElement("div"); alt.style.cssText = "font-size:11px;color:var(--text-muted,#64748b);";
      const parca = [];
      if (a.firma) parca.push(a.firma);
      if (a.marka) parca.push(a.marka);
      if (a.cocSayisi !== undefined) parca.push(a.cocSayisi ? a.cocSayisi + " CoC PDF" : "⚠️ CoC adlı PDF yok");
      if (a.tarih) parca.push(new Date(a.tarih).toLocaleDateString("tr-TR"));
      if (!(a.sasiler || []).length) parca.push("şasi adda yok");
      alt.textContent = parca.join(" · ");
      k.appendChild(ad); k.appendChild(alt);
      k.addEventListener("click", function () { H._sec(ov, a); });
      if (a.id === H._durum.klasorId) { k.style.borderColor = "#2563eb"; k.style.boxShadow = "0 0 0 2px rgba(37,99,235,.25)"; }
      return k;
    },
    _listeCiz: function (ov, liste) {
      const kutu = ov.querySelector('[data-hp="liste"]');
      const q = ov.querySelector('[data-hp="ara"]').value;
      const gos = liste || H.aracFiltrele(H._durum.araclar, q);
      kutu.replaceChildren();
      if (!gos.length) {
        const d = document.createElement("div");
        d.textContent = H._durum.araclar.length ? "Bu firmada eşleşen klasör yok — Enter ya da \"🔎 Tüm Drive\" ile her yerde arayın." : "Bu firma klasöründe araç klasörü yok.";
        d.style.cssText = "font-size:12px;color:var(--text-muted,#64748b);padding:6px;";
        kutu.appendChild(d); return;
      }
      gos.slice(0, 150).forEach(function (a) { kutu.appendChild(H._satir(ov, a)); });
      if (gos.length > 150) { const d = document.createElement("div"); d.textContent = "… " + (gos.length - 150) + " klasör daha; süzgece şasi veya marka yazın."; d.style.cssText = "font-size:11px;color:var(--text-muted,#64748b);padding:4px 6px;"; kutu.appendChild(d); }
    },
    _sec: function (ov, aday) {
      H._durum.klasorId = aday.id;
      if (aday.firma) { H._durum.ustFirma = aday.firma; H._firmaYaz(ov, H.firmaEslestir(aday.firma)); }
      const sasiEl = ov.querySelector('[data-hp="sasi"]');
      const oneri = (aday.sasiler || [])[0] || "";
      // Kullanıcı şasiyi elle yazdıysa ezilmez; yalnız boş ya da önceki otomatik değer değiştirilir.
      if (!sasiEl.value || sasiEl.value === H._durum.otomatikSasi) { sasiEl.value = oneri; H._durum.otomatikSasi = oneri; }
      ov.querySelectorAll("[data-hp-aday]").forEach(function (k) {
        const secili = k.getAttribute("data-hp-aday") === aday.id;
        k.style.borderColor = secili ? "#2563eb" : "var(--border,#e2e8f0)";
        k.style.boxShadow = secili ? "0 0 0 2px rgba(37,99,235,.25)" : "none";
      });
      ov.querySelector('[data-hp="secili"]').textContent = "✅ Seçilen klasör: " + [aday.firma, aday.marka, aday.ad].filter(Boolean).join(" / ");
      H._mesaj(ov, oneri ? "" : "Klasör adında şasi yok; Şasi No alanına elle yazın.", oneri ? "" : "uyari");
    },
    // Tüm Drive'da (link/ID/şasi/ad) arama; sonuçlar aynı listede gösterilir.
    _bul: async function (ov, kaynak) {
      const g = H.girdiCozumle(kaynak);
      if (g.tur === "sasi") { const s = ov.querySelector('[data-hp="sasi"]'); if (!s.value || s.value === H._durum.otomatikSasi) { s.value = g.sasi; H._durum.otomatikSasi = g.sasi; } }
      H._mesaj(ov, "🔎 Drive'da aranıyor…");
      try {
        const adaylar = await H.adaylariGetir(kaynak);
        if (!adaylar.length) throw new Error("Eşleşen Drive klasörü bulunamadı.");
        H._listeCiz(ov, adaylar);
        H._sec(ov, adaylar[0]);
        if (adaylar.length > 1) H._mesaj(ov, adaylar.length + " klasör bulundu; doğru olanı listeden seçin.");
        return adaylar;
      } catch (err) { H._mesaj(ov, "Klasör bulunamadı: " + err.message, "hata"); return null; }
    },
    _uretTikla: async function (ov) {
      const btn = ov.querySelector('[data-hp="uret"]');
      if (btn.disabled) return;
      const v = function (k) { const e = ov.querySelector('[data-hp="' + k + '"]'); return e ? e.value : ""; };
      btn.disabled = true; btn.style.opacity = ".6";
      try {
        if (!H._durum.klasorId && v("kaynak").trim() && !(await H._bul(ov, v("kaynak")))) return;
        const form = { klasorId: H._durum.klasorId, sasi: v("sasi"), firma: v("firma"), ustKlasorFirma: H._durum.ustFirma,
          basvuruNo: v("basvuruNo"), basvuruTarihi: v("basvuruTarihi"), marka: v("marka"), renk: v("renk"),
          uretildigiUlke: v("uretildigiUlke"), cikisUlke: v("cikisUlke") };
        const p = H.paketParametreleri(form); // eksik alan varsa buluta gitmeden uyar
        const firmaUyari = H.firmaBelirle(form).uyari;
        if (firmaUyari) { const f = ov.querySelector('[data-hp="firma"]'); f.value = p.firma; H._durum.otomatikFirma = p.firma; }
        H._mesaj(ov, (firmaUyari ? firmaUyari + " " : "") + "⏳ CoC bulutta okunuyor, çapraz kontrol yapılıyor; 4 belge klasöre yazılıyor… (1-3 dk)", firmaUyari ? "uyari" : "");
        H._sonucGoster(ov, await H.uret(form), !String(form.basvuruNo).trim(), firmaUyari);
      } catch (err) {
        H._mesaj(ov, "Paket oluşturulamadı: " + err.message, "hata");
        // Ülke kesin tespit edilemedi: varsayım yapılmaz, kullanıcı ilgili alandan seçer.
        if (err.kod === "ITHALAT_ULKESI") H._ulkeSor(ov, "cikisUlke", "Faturadaki satıcı ülkesini seçin");
        if (err.kod === "URETIM_ULKESI") H._ulkeSor(ov, "uretildigiUlke", "Üretim (menşe) ülkesini seçin");
      } finally { btn.disabled = false; btn.style.opacity = ""; }
    },
    _ulkeSor: function (ov, alanAdi, ipucu) {
      const alan = ov.querySelector('[data-hp="' + alanAdi + '"]');
      if (!alan) return;
      const kutu = alan.closest("details");
      if (kutu) kutu.open = true;
      alan.style.borderColor = "#dc2626";
      alan.style.boxShadow = "0 0 0 3px rgba(220,38,38,.2)";
      alan.placeholder = ipucu;
      alan.addEventListener("input", function () { alan.style.borderColor = ""; alan.style.boxShadow = ""; }, { once: true });
      alan.focus();
    },
    _sonucGoster: function (ov, res, taslak, firmaUyari) {
      const box = ov.querySelector('[data-hp="sonuc"]');
      box.replaceChildren();
      const bas = document.createElement("div");
      bas.textContent = "✅ 4 belge Drive klasörüne kaydedildi" + (taslak ? " (taslak — başvuru no yok)" : "") + ".";
      bas.style.cssText = "font-weight:800;color:#15803d;margin-bottom:8px;";
      box.appendChild(bas);
      if (firmaUyari) { const u = document.createElement("div"); u.textContent = firmaUyari; u.style.cssText = "margin-bottom:8px;color:#92400e;font-weight:600;"; box.appendChild(u); }
      TURLER.forEach(function (t) {
        const f = res.files.find(function (x) { return x.type === t[0]; });
        const satir = document.createElement("div");
        satir.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;margin-top:6px;border:1px solid var(--border,#e2e8f0);border-radius:10px;";
        const ad = document.createElement("div"); ad.style.cssText = "flex:1;min-width:160px;";
        const b = document.createElement("strong"); b.textContent = t[1]; ad.appendChild(b);
        const n = document.createElement("div"); n.textContent = f.name; n.style.cssText = "font-size:11px;color:var(--text-muted,#64748b);"; ad.appendChild(n);
        satir.appendChild(ad);
        const link = function (href, metin, renk) {
          const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = metin;
          a.style.cssText = "padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;color:#fff;background:" + renk + ";";
          return a;
        };
        satir.appendChild(link(new URL(f.url).href, "Drive'da Aç", "#2563eb"));
        const ind = H.indirmeLinki(f);
        if (ind) satir.appendChild(link(ind, "⬇ İndir", "#0f766e"));
        box.appendChild(satir);
      });
      if (res.folderUrl) { const a = document.createElement("a"); a.href = res.folderUrl; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "📁 Klasörü aç"; a.style.cssText = "display:inline-block;margin-top:10px;font-weight:700;color:#2563eb;"; box.appendChild(a); }
      if (res.fuel) { const p = document.createElement("div"); p.textContent = "Yakıt: " + res.fuel + (res.yakitTahrik ? " (" + res.yakitTahrik + ")" : "") + " · GTİP: " + (res.gtip || "-"); p.style.marginTop = "8px"; box.appendChild(p); }
      // Orijinal CoC ↔ CoC_TR çapraz kontrolü — Gelen Araçlar paketindeki gösterimle aynı.
      (res.caprazUyarilar || []).forEach(function (u) {
        const uyumsuz = res.caprazKontrol && res.caprazKontrol.durum === "uyumsuz" && /^⚠️/.test(u);
        const p = document.createElement("div"); p.textContent = u;
        p.style.cssText = uyumsuz ? "margin-top:10px;padding:10px;border:2px solid #dc2626;border-radius:8px;background:#fef2f2;color:#991b1b;font-weight:700;" : "margin-top:8px;color:var(--text-muted,#64748b);";
        box.appendChild(p);
      });
      if (res.caprazKontrol && res.caprazKontrol.durum === "dogrulandi") { const p = document.createElement("div"); p.textContent = "✅ Orijinal CoC ile CoC_TR çapraz doğrulandı (" + (res.caprazKontrol.dogrulanan || []).length + " alan)."; p.style.cssText = "margin-top:8px;color:#15803d;font-weight:600;"; box.appendChild(p); }
      if (res.warnings && res.warnings.length) { const p = document.createElement("div"); p.textContent = res.warnings.join(" · "); p.style.cssText = "margin-top:8px;color:var(--text-secondary,#475569);font-size:12px;"; box.appendChild(p); }
    }
  };
})();
