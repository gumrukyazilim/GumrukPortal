/*
 * GÜMRÜKPORTAL — EVRAK ALAN ÇIKARICI (Faz 2.1)
 * ---------------------------------------------------------------------------
 * OCR metninden denetim motorunun (denetim-motoru.js) ihtiyaç duyduğu alanları okur.
 * Saf fonksiyonlar; DOM/Firebase/ağ YOK. Portal <script src>, Node require().
 *
 * Gerçek evraklardan öğrenilenler (2026-11-08, 6 araç):
 *  - Tek PDF birden çok belge taşır ("Ordino cmr t1": ordino + CMR + T2) → önce BÖLÜNÜR.
 *  - Alman A.TR formunda kutular 9/10/11 numaralı ("Rohmasse" = brüt) → kutu NO'su değil ETİKET okunur.
 *  - Taranmış formlarda etiket ve değer ayrı sütunlarda gelir → ağırlıkta makullük (≥300 kg) ve
 *    "tek başına satır / kg birimi" şartı; ordinoda etiket listesi ile ":" değer listesi sırayla eşlenir.
 *  - OCR şasiyi bozabilir (W1K… → WIR…): şasi DÜZELTİLMEZ, karttaki şasiye en yakın aday ham hâliyle alınır.
 *
 *   EvrakCikarici.cikar(metin, { ipucu, refSasi, dosya:{dosyaId, ad} })
 *     → [{ tur, alanlar: { alan: { deger, ham, guven, kaynak } } }]
 *   EvrakCikarici.birlestir(mevcutEvrakAlanlari, [cikarSonuclari...]) → yeni evrakAlanlari
 */
(function (kok, fabrika) {
  if (typeof module === 'object' && module.exports) module.exports = fabrika(require('./denetim-motoru.js'));
  else kok.EvrakCikarici = fabrika(kok.DenetimMotoru);
})(typeof window !== 'undefined' ? window : this, function (DM) {
  'use strict';

  var SURUM = '2026-11-08-c2';
  var GUVEN_PUAN = { yuksek: 3, orta: 2, dusuk: 1 };

  function U(s) { return String(s == null ? '' : s).toLocaleUpperCase('tr').replace(/İ/g, 'I'); }
  // OCR'daki form alan kodları: [18 04], (11 07], [1302], (16 15 074) → boşluk
  function kodTemizle(s) { return String(s).replace(/[\[(]\s*\d{2}\s?\d{2}(?:\s?\d{3})?\s*[\])]/g, ' '); }
  function kes(s, i, n) { return String(s).slice(Math.max(0, i), i + (n || 80)).replace(/\s+/g, ' ').trim(); }
  function alan(deger, ham, guven) { return { deger: deger, ham: String(ham || '').slice(0, 120), guven: guven || 'orta' }; }

  // ── Belge bölme ──────────────────────────────────────────────────────
  var ISARET = [
    ['cmr', /INTERNATIONAL CONSIGNMENT NOTE|ULUSLARARASI HAMULE SENED|INTERNATIONALER FRACHTBRIEF|LETTRE DE VOITURE INTERNATIONAL/],
    ['mrn', /VERSANDBEGLEITDOKUMENT|TRANSIT[- ]?BEGLEITDOKUMENT|TRANSIT ACCOMPANYING|TRANSIT REFAKAT|AUSFUHRBEGLEITDOKUMENT|EXPORT ACCOMPANYING/],
    ['ordino', /TA[SŞ]IMA SENET NO|AMBARA G[I]R[I][SŞ] TAR[I]H|\bORD[I]NO\b/],
    ['ozet', /G[I]R[I][SŞ] [OÖ]ZET BEYAN|[OÖ]ZET BEYAN (?:FORMU|NO\b|NUMARASI)/],
    ['atr', /WARENVERKEHRSBESCHEINIGUNG|MOVEMENT CERTIFICATE|DOLA[SŞ]IM BELGES/],
    ['coc', /CERTIFICATE OF CONFORMITY|[UÜ]BEREINSTIMMUNGSBESCHEINIGUNG|\bAT UYGUNLUK BELGES|EINZELGENEHMIGUNG/],
    ['ulm', /M[UÜ]NFER[I]T [I]THAL ARA[CÇ]|ULM-03-FR/],
    ['fatura', /\bRECHNUNG\b|COMMERCIAL INVOICE|\bINVOICE\b/]
  ];
  var IPUCU_TUR = { atr: 'atr', coc: 'coc', fatura: 'fatura', rapor: 'ulm', mrn: 'mrn', tse: '', navlun: '' };

  function belgeleriBol(metin, ipucu) {
    var t = String(metin || ''), M = U(t);
    var bulunan = [];
    ISARET.forEach(function (x) {
      if (x[0] === 'fatura') return;
      var m = x[1].exec(M);
      if (m) bulunan.push({ tur: x[0], i: m.index });
    });
    if (!bulunan.length) {
      var tur = IPUCU_TUR[ipucu] !== undefined ? IPUCU_TUR[ipucu] : '';
      if (!tur && ISARET[ISARET.length - 1][1].test(M)) tur = 'fatura';
      return tur ? [{ tur: tur, metin: t }] : [];
    }
    bulunan.sort(function (a, b) { return a.i - b.i; });
    var parcalar = bulunan.map(function (b, k) {
      var bas = k === 0 ? 0 : b.i, son = k + 1 < bulunan.length ? bulunan[k + 1].i : t.length;
      return { tur: b.tur, metin: t.slice(bas, son) };
    });
    // Noter tasdikli fatura + ihracat belgesi: ilk işaretten önceki kısım faturaysa ayrı belge
    var on = M.slice(0, bulunan[0].i);
    if (bulunan[0].i > 200 && ISARET[ISARET.length - 1][1].test(on)) {
      parcalar[0].metin = t.slice(bulunan[0].i, parcalar.length > 1 ? bulunan[1].i : t.length);
      parcalar.unshift({ tur: 'fatura', metin: t.slice(0, bulunan[0].i) });
    }
    return parcalar;
  }

  // ── Şasi ─────────────────────────────────────────────────────────────
  function hamming(a, b) { var d = 0; for (var i = 0; i < 17; i++) if (a[i] !== b[i]) d++; return d; }
  function sasiBul(metin, refSasi) {
    var M0 = U(metin);
    var T = M0.replace(/[^A-Z0-9]+/g, ' ');
    var ham = T.match(/\b[A-Z0-9]{17}\b/g) || [];
    // Etiketten sonra boşluklu yazılmış şasi: "FIN# WUA ZZZ GYX TA5 002 59"
    var etRe = /(?:\bFIN\b|\bVIN\b|FAHRGESTELL\w*|CHASSIS|[SŞ]AS[I]\s*NO|SASE-?NO)\W{0,6}((?:[A-Z0-9]{1,8}[ \-]){1,8}[A-Z0-9]{1,8})/g, em;
    while ((em = etRe.exec(M0))) {
      var bitisik = em[1].replace(/[ \-]/g, '');
      if (bitisik.length >= 17) ham.push(bitisik.slice(0, 17));
    }
    var adaylar = ham.filter(function (v, i) {
      return ham.indexOf(v) === i && !/^[A-Z]{2}\d{15}$/.test(v) && /\d/.test(v) && /[A-Z]/.test(v);
    });
    var ref = refSasi ? U(refSasi).replace(/[^A-Z0-9]/g, '') : '';
    if (ref.length === 17) {
      var en = null;
      adaylar.forEach(function (v) { var d = hamming(v, ref); if (d <= 6 && (!en || d < en.d)) en = { v: v, d: d }; });
      if (en) return { sasi: en.v, uzaklik: en.d, sayi: adaylar.length };
      return { sasi: '', sayi: adaylar.length };
    }
    var ilk = adaylar.find(function (v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(v); }) || adaylar[0] || '';
    return { sasi: ilk, sayi: adaylar.length };
  }
  function sasiAlani(metin, refSasi) {
    var s = sasiBul(metin, refSasi);
    if (!s.sasi) return null;
    return alan(s.sasi, s.sasi, s.uzaklik === 0 ? 'yuksek' : (s.uzaklik === undefined ? 'orta' : 'dusuk'));
  }

  // ── Sayılar ──────────────────────────────────────────────────────────
  var SAYI_RE = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
  // Etiketten sonraki pencerede makul brüt ağırlık: 300-80000 kg; "kg" birimi ya da tek başına satır şartı
  function brutBul(metin, etiketRe, pencere) {
    var t = kodTemizle(metin), M = U(t);
    var re = new RegExp(etiketRe.source, 'g'), m;
    while ((m = re.exec(M))) {
      var bas = m.index + m[0].length, parca = t.slice(bas, bas + (pencere || 260));
      var sm, r2 = new RegExp(SAYI_RE.source, 'g');
      while ((sm = r2.exec(parca))) {
        var n = DM.kgAyristir(sm[0]);
        if (n === null || n < 300 || n > 80000) continue;
        var sonra = parca.slice(sm.index + sm[0].length, sm.index + sm[0].length + 6);
        var satirBas = parca.lastIndexOf('\n', sm.index) + 1, satirSon = parca.indexOf('\n', sm.index);
        var satir = parca.slice(satirBas, satirSon < 0 ? parca.length : satirSon).trim();
        var kgVar = /^\s*KG\b/i.test(sonra);
        var tekBasina = /^\d[\d.,]*\s*(?:KG)?(?:\s+\d{1,2})?$/i.test(satir);
        if (!kgVar && !tekBasina) continue;
        if (!kgVar && n >= 2015 && n <= 2035) continue; // yıl olabilir
        return alan(n, kes(t, m.index, 60) + ' … ' + satir, kgVar ? 'yuksek' : 'orta');
      }
    }
    return null;
  }
  function kapAdetDesen(metin) {
    var M = U(metin);
    var m = M.match(/\b(\d{1,3})\s*[X×]\s*(?:NEU\w*\s+|NEW\s+)?(?:PKW|FAHRZEUG|VEHICLE|CAR\b|KFZ|ARA[CÇ]|OTO|ADET|UNIT|STK|ST[UÜ]CK)/);
    if (m) return alan(parseInt(m[1], 10), kes(M, m.index, 40), 'yuksek');
    m = M.match(/\b(\d{1,3})\s*(?:-\s*)?(?:ADET|STK\.?|ST[UÜ]CK|UNITS?\b|PCS\b)/);
    if (m) return alan(parseInt(m[1], 10), kes(M, m.index, 40), 'orta');
    return null;
  }
  function kapEtiket(metin, etiketRe) {
    var t = kodTemizle(metin), M = U(t);
    var m = etiketRe.exec(M);
    if (!m) return null;
    var parca = M.slice(m.index + m[0].length, m.index + m[0].length + 120);
    var s = parca.match(/(?:^|[^\d.,])(\d{1,3})(?![\d.,])/);
    if (!s) return null;
    var n = parseInt(s[1], 10);
    return n >= 1 && n <= 999 ? alan(n, kes(M, m.index, 70), 'orta') : null;
  }
  // Ordino düzeni: etiket satırları alt alta, sonra ":" ile başlayan değer satırları aynı sırayla
  function etiketDegerEsle(metin) {
    var satirlar = String(metin).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var sonuc = {}, blok = [], degerler = null;
    for (var i = 0; i < satirlar.length; i++) {
      var s = satirlar[i];
      var inline = s.match(/^([A-ZÇĞİÖŞÜ .\/]{3,40}?)\s*:\s*(\S.*)$/);
      if (inline && /[A-ZÇĞİÖŞÜ]{3}/.test(inline[1])) { sonuc[U(inline[1]).trim()] = inline[2].trim(); continue; }
      if (/^:/.test(s)) {
        if (degerler === null) degerler = [];
        degerler.push(s.replace(/^:\s*/, ''));
        continue;
      }
      if (degerler !== null) break; // değer bloğu bitti
      if (/^[A-ZÇĞİÖŞÜ .\/]{4,40}$/.test(s)) blok.push(U(s).trim());
      else blok = []; // etiket bloğu yalnız değerlerin hemen öncesindeki kesintisiz satırlar
    }
    if (degerler) blok.slice(0, degerler.length).forEach(function (e, k) { if (!(e in sonuc)) sonuc[e] = degerler[k]; });
    return sonuc;
  }

  // ── Belge türüne göre alanlar ─────────────────────────────────────────
  var BRUT_ETIKET = /ROHMA\w*|GROSS (?:WEIGHT|MASS)|BRUTTO\s*GEWICHT|BRUTTOMASSE|BR[UÜ]T (?:A[GĞ]IRLIK|K[UÜ]TLE)|E[SŞ]YANIN K[I]LOSU|MASSE BRUTE|POIDS BRUT/;

  function atrAlanlari(t, sec) {
    var a = {};
    var s = sasiAlani(t, sec.refSasi); if (s) a.sasi = s;
    var k = kapAdetDesen(t);
    if (!k) { var sb = sasiBul(t, ''); if (sb.sayi) k = alan(sb.sayi, 'kap adedi yazmıyor; şasi sayısından (' + sb.sayi + ')', 'dusuk'); }
    if (k) a.kap = k;
    var b = brutBul(t, BRUT_ETIKET); if (b) a.brut = b;
    return a;
  }
  function cmrAlanlari(t, sec) {
    var a = {};
    var s = sasiAlani(t, sec.refSasi); if (s) a.sasi = s;
    var k = kapAdetDesen(t); if (k) { a.kap = k; if (k.deger > 1) a.aracSayisi = alan(k.deger, k.ham, k.guven); }
    var b = brutBul(t, /GROSS WEIGHT|BR[UÜ]T A[GĞ]IRLIK|BRUTTOGEWICHT|POIDS BRUT/, 320); if (b) a.brut = b;
    return a;
  }
  function mrnAlanlari(t, sec) {
    var a = {};
    var m = U(t).match(/\b(\d{2}[A-Z]{2}[A-Z0-9]{13}\d)\b/); if (m) a.mrnNo = alan(m[1], m[1], 'orta');
    var k = kapEtiket(t, /PACKST(?:[UÜ]CKE)?\.?\s*INSG(?:ESAMT|ES)?\.?|TOTAL NUMBER OF PACKAGES|TOPLAM KAP SAYISI/);
    if (k) { a.kap = k; if (k.deger > 1) a.aracSayisi = alan(k.deger, k.ham, k.guven); }
    var b = brutBul(t, /GESAMTROHMA\w*|ROHMA\w*|TOTAL GROSS MASS|GROSS MASS|BR[UÜ]T K[UÜ]TLE/); if (b) a.brut = b;
    var s = sasiAlani(t, sec.refSasi); if (s) a.sasi = s;
    return a;
  }
  function ordinoAlanlari(t) {
    var a = {}, e = etiketDegerEsle(t);
    Object.keys(e).forEach(function (k) {
      if (/KAP ADED|KAP SAYISI/.test(k)) { var n = DM.kapAyristir(e[k]); if (n !== null) a.kap = alan(n, k + ': ' + e[k], 'orta'); }
      if (/E[SŞ]YANIN K[I]LOSU|BR[UÜ]T (?:K[UÜ]TLE|A[GĞ]IRLIK)/.test(k)) {
        var kg = DM.kgAyristir(e[k]);
        if (kg !== null && kg >= 300 && kg <= 80000) a.brut = alan(kg, k + ': ' + e[k], 'orta');
      }
    });
    // Sütun karışan ordinoda etiket→sayı tahmini YAPILMAZ ("261€ 7458…" kap sanılmasın); yalnız satır içi brüt
    if (!a.brut) { var b = brutBul(t, /BR[UÜ]T K[UÜ]TLE|BR[UÜ]T A[GĞ]IRLIK/); if (b) a.brut = b; }
    // Çok araçlı ordino: "KAP ADEDİ: 2-ADET", "ŞASİ NO: R239138 /R239142"
    if (a.kap && a.kap.deger > 1) a.aracSayisi = alan(a.kap.deger, a.kap.ham, a.kap.guven);
    return a;
  }
  function cocAlanlari(t, sec) {
    var a = {};
    var duz = t.replace(/\r/g, '');
    var m = duz.match(/0\.10\.?\s*(?:Ara[cç] kimlik numaras[ıi]|Fahrzeug-?Identifizierungsnummer|Vehicle identification number)[^:\n]{0,20}[:.]?\s*([A-Z0-9 ]{17,21})/i);
    if (m) { var v = U(m[1]).replace(/\s/g, '').slice(0, 17); if (v.length === 17) a.sasi = alan(v, m[0], 'yuksek'); }
    if (!a.sasi) { var s = sasiAlani(duz, sec.refSasi); if (s) a.sasi = s; }
    var tip = (duz.match(/0\.2\.?\s*(?:T[İIi]p|Typ|Type)\s*[:.]?\s*([^\n]+?)(?=\s*(?:Varyant|Variante|Variant|Versiyon|Version|\n|$))/i) || [])[1];
    var vary = (duz.match(/(?:Varyant|Variante|Variant)(?:\s*\([^)]*\))?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)(?=\s*(?:Versiyon|Version|\n|$))/i) || [])[1];
    var vers = (duz.match(/(?:Versiyon|Version)(?:\s*\([^)]*\))?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-]{0,60})/i) || [])[1];
    var parcalar = [tip, vary, vers].map(function (x) { return x ? x.trim() : ''; });
    if (parcalar.some(Boolean)) a.tvv = alan(parcalar.join('/'), 'Tip: ' + parcalar[0] + ' Varyant: ' + parcalar[1] + ' Versiyon: ' + parcalar[2], parcalar.every(Boolean) ? 'yuksek' : 'orta');
    m = duz.match(/(?:^|\s)13\.?\s+(?:[ÇC]al[ıi][şs][ıi]r durumdaki k[üu]tle|Kullan[ıi]ma haz[ıi]r[^\d\n]*k[üu]tle|Masse des Fahrzeugs in fahrbereitem Zustand|Mass (?:of the vehicle )?in running order)[^\d\n]{0,60}?(\d[\d.,]*)/i);
    if (m) { var k13 = DM.kgAyristir(m[1]); if (k13 !== null && k13 >= 300) a.kutle13 = alan(k13, m[0], 'yuksek'); }
    m = duz.match(/13\.2\.?\s*(?:Arac[ıi]n ger[çc]ek k[üu]tlesi|Ger[çc]ek k[üu]tle|Tats[äa]chliche Masse|Actual mass)[^\d\n]{0,60}?(\d[\d.,]*)/i);
    if (m) { var k132 = DM.kgAyristir(m[1]); if (k132 !== null && k132 >= 300) a.kutle132 = alan(k132, m[0], 'yuksek'); }
    m = duz.match(/(?:^|\s)21\.?\s+(?:Motorda yaz[ıi]l[ıi] kod|Motor kodu|Herstellercode des Motors|Engine code|Manufacturer.s engine code)[^:\n]{0,40}[:.]?\s*([A-Za-z0-9][A-Za-z0-9 \-]{0,14}?)(?=\s*(?:\n|$|2[2-9]\.|Kraftstoff|Yak[ıi]t))/i);
    if (m) a.motorKodu = alan(m[1].trim(), m[0], 'yuksek');
    m = duz.match(/0\.8\.?\s*(?:Montaj|Fertigungsst|Name\(n\) und Anschrift\(en\) der Fertigung|Address(?:es)? of (?:the )?assembly|Assembly plant|[İI]malat yer)[^\n:]{0,60}[:.]?\s*([\s\S]{0,220}?)(?=\s0\.9\.?|\s0\.10\.?|$)/i);
    if (m) {
      var adres = m[1].replace(/\s+/g, ' ').trim();
      var ulke = DM.ulkeAdresten(adres);
      if (adres) a.montajAdresi = alan(adres, m[0], 'orta');
      if (ulke) a.montajUlkesi = alan(ulke, adres, 'orta');
    }
    return a;
  }
  function ulmAlanlari(t, sec) {
    var a = {};
    var s = sasiAlani(t, sec.refSasi); if (s) a.sasi = s;
    var duz = t.replace(/\r/g, '');
    var tip = (duz.match(/\bT[İIi]p\s*[:.]\s*([^\n]+?)(?=\s*(?:Varyant|\n|$))/i) || [])[1];
    var vary = (duz.match(/Varyant\s*[:.]\s*([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)(?=\s*(?:Versiyon|\n|$))/i) || [])[1];
    var vers = (duz.match(/Versiyon\s*[:.]\s*([A-Za-z0-9][A-Za-z0-9\-]{0,60})/i) || [])[1];
    var p = [tip, vary, vers].map(function (x) { return x ? x.trim() : ''; });
    if (p.some(Boolean)) a.tvv = alan(p.join('/'), 'Tip: ' + p[0] + ' Varyant: ' + p[1] + ' Versiyon: ' + p[2], p.every(Boolean) ? 'yuksek' : 'orta');
    var m = duz.match(/Motor\s*(?:Seri\s*)?No\.?\s*[:.]\s*([A-Za-z0-9][A-Za-z0-9\-]{4,20})/i); if (m) a.motorNo = alan(m[1], m[0], 'orta');
    m = duz.match(/Motor\s*(?:Tip\s*)?Kodu\s*[:.]\s*([A-Za-z0-9][A-Za-z0-9 \-]{0,14})/i); if (m) a.motorKodu = alan(m[1].trim(), m[0], 'orta');
    return a;
  }
  function faturaAlanlari(t, sec) {
    var a = {};
    var s = sasiAlani(t, sec.refSasi); if (s) a.sasi = s;
    var m = U(t).match(/(?:MOTORNUMMER|MOTOR-?NR\.?|ENGINE (?:NO|NUMBER)|MOTOR NO)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-]{4,20})/);
    if (m) a.motorNo = alan(m[1], m[0], 'orta');
    return a;
  }
  var CIKARICI = { atr: atrAlanlari, cmr: cmrAlanlari, mrn: mrnAlanlari, ordino: ordinoAlanlari, ozet: ordinoAlanlari,
    coc: cocAlanlari, ulm: ulmAlanlari, fatura: faturaAlanlari };

  function cikar(metin, secenek) {
    secenek = secenek || {};
    var dosya = secenek.dosya ? { dosyaId: String(secenek.dosya.dosyaId || ''), ad: String(secenek.dosya.ad || '') } : { dosyaId: '', ad: '' };
    var sonuc = [];
    belgeleriBol(metin, secenek.ipucu).forEach(function (b) {
      var f = CIKARICI[b.tur];
      if (!f) return;
      var alanlar = {};
      try { alanlar = f(b.metin, secenek) || {}; } catch (e) { alanlar = {}; }
      Object.keys(alanlar).forEach(function (k) { if (alanlar[k]) alanlar[k].kaynak = dosya; else delete alanlar[k]; });
      if (Object.keys(alanlar).length) sonuc.push({ tur: b.tur, alanlar: alanlar });
    });
    return sonuc;
  }

  // Aynı tür + alan için: daha güvenilir okuma kazanır; eşitse yeni okuma (aynı dosyanın yeniden okunması) kazanır.
  // Elle girilen / kabul edilen değerler (guven 'elle') hiçbir yeniden taramada ezilmez.
  // secenek.sifirla: "Tümünü Yeniden Oku" → elle olmayan eski okumalar atılır.
  function birlestir(mevcut, sonuclar, zaman, secenek) {
    var sifirla = !!(secenek && secenek.sifirla);
    var ea = {};
    Object.keys(mevcut || {}).forEach(function (t) {
      if (t.charAt(0) === '_' || !mevcut[t] || typeof mevcut[t] !== 'object') return;
      ea[t] = {};
      Object.keys(mevcut[t]).forEach(function (k) {
        var v = mevcut[t][k];
        if (!sifirla || (v && v.guven === 'elle')) ea[t][k] = v;
      });
      if (!Object.keys(ea[t]).length) delete ea[t];
    });
    (sonuclar || []).forEach(function (liste) {
      (liste || []).forEach(function (b) {
        ea[b.tur] = ea[b.tur] || {};
        Object.keys(b.alanlar).forEach(function (k) {
          var yeni = b.alanlar[k], eski = ea[b.tur][k];
          if (eski && eski.guven === 'elle') return;
          if (!eski || (GUVEN_PUAN[yeni.guven] || 0) >= (GUVEN_PUAN[eski.guven] || 0)) ea[b.tur][k] = yeni;
        });
      });
    });
    ea._surum = SURUM;
    if (zaman) ea._zaman = zaman;
    return JSON.parse(JSON.stringify(ea));
  }

  // Satır içi elle giriş. deger null/'' → o alanın elle değeri silinir (alan boşalır, sonraki taramada OCR doldurabilir).
  // not: 'ocr' → tek tık OCR önerisi kabulü; ham değer korunur.
  function elleYaz(mevcut, belge, alanAdi, deger, secenek) {
    secenek = secenek || {};
    if (!/^[a-z][A-Za-z0-9]{0,30}$/.test(String(belge)) || !/^[a-z][A-Za-z0-9]{0,30}$/.test(String(alanAdi))) throw new Error('Geçersiz alan');
    var ea = JSON.parse(JSON.stringify(mevcut || {}));
    ea[belge] = ea[belge] || {};
    var eski = ea[belge][alanAdi];
    if (deger === null || deger === undefined || String(deger).trim() === '') {
      // OCR kabulü geri alınırsa belgedeki ham okuma geri gelir
      if (eski && eski.not === 'ocr' && eski.ham) { ea[belge][alanAdi] = { deger: eski.ham, ham: eski.ham, guven: 'dusuk', kaynak: { dosyaId: (eski.kaynak && eski.kaynak.dosyaId) || '', ad: 'OCR (geri alındı)' } }; return ea; }
      delete ea[belge][alanAdi];
      if (!Object.keys(ea[belge]).length) delete ea[belge];
      return ea;
    }
    var o = { deger: deger, guven: 'elle', ham: String(secenek.ham != null ? secenek.ham : (eski && eski.deger != null ? eski.deger : '')).slice(0, 120),
      kaynak: { dosyaId: (eski && eski.kaynak && eski.kaynak.dosyaId) || '', ad: secenek.not === 'ocr' ? 'OCR önerisi kabul' : 'Elle giriş' } };
    if (secenek.not) o.not = String(secenek.not);
    if (secenek.kim) o.kim = String(secenek.kim).slice(0, 60);
    if (secenek.zaman) o.zaman = String(secenek.zaman);
    ea[belge][alanAdi] = o;
    return ea;
  }

  return { SURUM: SURUM, cikar: cikar, birlestir: birlestir, elleYaz: elleYaz, belgeleriBol: belgeleriBol, sasiBul: sasiBul,
    brutBul: brutBul, etiketDegerEsle: etiketDegerEsle };
});
