/*
 * GÜMRÜKPORTAL — EVRAK ÇAPRAZ DENETİM MOTORU (Faz 2.0)
 * ---------------------------------------------------------------------------
 * Saf fonksiyonlar: DOM, Firebase, ağ YOK. Aynı dosya portalda <script src>,
 * Node testlerinde require() ile kullanılır. Mimari: docs/FAZ2_EVRAK_DENETIM_MIMARISI.md
 *
 * Kullanım:
 *   const rapor = DenetimMotoru.denetle(girdi, ayarlar, { menseCoz: window.menseFabrikaCoz });
 *   const durum = DenetimMotoru.kilitDurumu(rapor, onaylar, 'golge' | 'sert');
 *
 * girdi = {
 *   arac:   { sasi, mensei, model, marka },                      // portal kartı
 *   fatura: { sasi, motorNo },
 *   atr:    { sasi, kap, kapTanim, brut },                       // A.TR kutu 8 / 9
 *   cmr:    { kap, kapTanim, brut, aracSayisi, cocKutleToplami }, // CMR kutu 6-9 / 11
 *   ozet:   { kap, brut },                                       // özet beyan ("Brüt Kütle" alanı)
 *   coc:    { sasi, tvv, kutle13, kutle132, motorKodu, montajUlkesi }, // 0.10, 0.2, 13, 13.2, 21, 0.8
 *   ulm:    { sasi, tvv, motorNo, motorKodu }
 * }
 * Her değer düz değer ya da { deger, kaynak:{dosyaId, ad}, ham } olabilir.
 *
 * Sonuç durumları: GECTI · KALDI · DOGRULANAMADI (sarı, kilitlemez) · UYGULANMAZ
 * Seviyeler (yalnız KALDI için anlamlı): KRITIK (kilit) · UYARI (sarı) · BILGI
 */
(function (kok, fabrika) {
  if (typeof module === 'object' && module.exports) module.exports = fabrika();
  else kok.DenetimMotoru = fabrika();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SURUM = '2026-11-08-d3';

  var VARSAYILAN_AYARLAR = {
    // Kontrol hanesi tutmazsa KİLİT olan şasi ilk haneleri (kullanıcı kararı 2026-11-08: K. Amerika 1-5 + Çin L)
    kontrolHanesiZorunlu: ['1', '2', '3', '4', '5', 'L'],
    kontrolHanesiDigerSeviye: 'BILGI',
    brutToleransKg: 5,
    cocKutlePayiKg: 100,          // CMR brüt < (CoC 13.2 ya da 13) − 100 → KRİTİK; arası → UYARI
    menseUyusmazlikSeviye: 'KRITIK',
    // Homoglif sınıfları: aynı sınıftaki karakterler OCR'da birbirine karışır
    homoglifSiniflari: [['1', 'I', 'L'], ['0', 'O', 'Q', 'D'], ['8', 'B'], ['5', 'S'], ['2', 'Z'], ['6', 'G']],
    // Desenli (güvenlik zeminli) belgelere özel ek sınıflar: A.TR'nin yeşil guilloche dalgaları K'nin bacaklarıyla
    // çakışıp OCR'da R okutuyor (2026-11-08, S580: belgede W1K, OCR WIR). Yalnız o belgenin karşılaştırmalarında geçerli.
    belgeHomoglifleri: { atr: [['K', 'R']] }
  };
  // Belgeye özel homoglif sınıflarıyla genişletilmiş ayar
  function belgeAyari(ayar, belgeler) {
    var ek = [];
    (belgeler || []).forEach(function (b) { ((ayar.belgeHomoglifleri || {})[b] || []).forEach(function (x) { ek.push(x); }); });
    if (!ek.length) return ayar;
    var s = {};
    Object.keys(ayar).forEach(function (k) { s[k] = ayar[k]; });
    s.homoglifSiniflari = (ayar.homoglifSiniflari || []).concat(ek);
    return s;
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────
  function birlestirAyar(a) {
    var s = {};
    Object.keys(VARSAYILAN_AYARLAR).forEach(function (k) { s[k] = VARSAYILAN_AYARLAR[k]; });
    Object.keys(a || {}).forEach(function (k) { if (a[k] !== undefined && a[k] !== null) s[k] = a[k]; });
    return s;
  }
  function deger(x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) return ('deger' in x) ? x.deger : undefined;
    return x;
  }
  function kaynakBilgi(x) {
    return (x && typeof x === 'object' && x.kaynak) ? x.kaynak : null;
  }
  function bos(v) { return v === undefined || v === null || String(v).trim() === ''; }
  function parmakIzi(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  // Kiril / Yunan harf ikizleri → Latin (Rus A.TR'lerinde OCR Kiril harf üretir)
  var HARF_IKIZ = {
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T',
    'Х': 'X', 'У': 'Y', 'І': 'I', 'Ѕ': 'S', 'Ј': 'J', 'Ζ': 'Z',
    'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P',
    'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'İ': 'I', 'ı': 'I'
  };

  // Kanonik biçim: büyük harf, Kiril/Yunan ikizleri Latin, boşluk/tire/nokta yok.
  // tip 'sasi': yalnız harf+rakam kalır. Küçük "l" ve "|" OCR'da 1 yerine geçtiği için ayrı işaretlenir.
  function kanonik(v, tip) {
    var s = String(v == null ? '' : v);
    var cikti = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === 'l' || c === '|') { cikti += 'ℓ'; continue; } // ℓ: "küçük l" işareti, katlamada 1 olur
      c = HARF_IKIZ[c] || c;
      cikti += c;
    }
    cikti = cikti.toUpperCase().replace(/İ/g, 'I');
    cikti = cikti.split('').map(function (ch) { return HARF_IKIZ[ch] || ch; }).join('');
    cikti = tip === 'sasi' ? cikti.replace(/[^A-Z0-9ℓ]/g, '') : cikti.replace(/[\s\-._]/g, '');
    return cikti;
  }
  function katlayici(ayar) {
    var harita = { 'ℓ': '1' };
    (ayar.homoglifSiniflari || []).forEach(function (sinif) {
      sinif.forEach(function (ch) { harita[ch] = sinif[0]; });
    });
    return function (s) { return s.split('').map(function (ch) { return harita[ch] || ch; }).join(''); };
  }
  function gorunur(s) { return String(s).replace(/ℓ/g, 'l'); }

  // İki değer: ESIT · BENZER (yalnız homoglif farkı → OCR tuzağı) · FARKLI
  function karsilastir(a, b, secenek) {
    secenek = secenek || {};
    var ayar = birlestirAyar(secenek.ayarlar);
    var ka = kanonik(a, secenek.tip), kb = kanonik(b, secenek.tip);
    if (ka === kb) return { sonuc: 'ESIT', pozisyonlar: [] };
    var katla = katlayici(ayar);
    var fa = katla(ka), fb = katla(kb);
    var pozisyonlar = [];
    if (ka.length === kb.length) {
      for (var i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) pozisyonlar.push({ sira: i + 1, a: gorunur(ka[i]), b: gorunur(kb[i]) });
      }
    }
    return { sonuc: fa === fb ? 'BENZER' : 'FARKLI', pozisyonlar: pozisyonlar };
  }

  // ── Şasi (ISO 3779) ──────────────────────────────────────────────────
  var HARF_DEGER = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var AGIRLIK = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  function kontrolHanesiHesapla(vin) {
    var t = 0;
    for (var i = 0; i < 17; i++) {
      var c = vin[i];
      var d = /[0-9]/.test(c) ? +c : HARF_DEGER[c];
      if (d === undefined) return null;
      t += d * AGIRLIK[i];
    }
    var k = t % 11;
    return k === 10 ? 'X' : String(k);
  }
  function kontrolZorunlu(vin, ayar) {
    return (ayar.kontrolHanesiZorunlu || []).some(function (p) { return vin.indexOf(p) === 0; });
  }
  // Şasi incelemesi: biçim hataları, kontrol hanesi, I/O/Q ve homoglif düzeltme ÖNERİLERİ (asla otomatik yazılmaz)
  function sasiIncele(ham, ayarlar) {
    var ayar = birlestirAyar(ayarlar);
    var v = kanonik(ham, 'sasi').replace(/ℓ/g, 'L');
    var r = { sasi: v, hatalar: [], kontrol: null, oneriler: [] };
    if (!v) { r.hatalar.push('Şasi boş'); return r; }
    if (v.length !== 17) r.hatalar.push('Şasi ' + v.length + ' hane (17 olmalı)');
    var yasak = [];
    for (var i = 0; i < v.length; i++) if (/[IOQ]/.test(v[i])) yasak.push((i + 1) + '. hane "' + v[i] + '"');
    if (yasak.length) r.hatalar.push('ISO 3779: şasi I, O, Q içeremez (' + yasak.join(', ') + ') — OCR hatası');
    if (/[^A-Z0-9]/.test(v)) r.hatalar.push('Şasi harf/rakam dışı karakter içeriyor');
    if (v.length !== 17) return r;

    var aday = v.replace(/I/g, '1').replace(/[OQ]/g, '0');
    var zorunlu = kontrolZorunlu(aday, ayar); // "I" ile okunmuş "1…" şasi de K. Amerika sayılır
    if (zorunlu && /[UZ0]/.test(aday[9])) r.hatalar.push('10. hane (model yılı) U, Z ya da 0 olamaz');
    var hesap = kontrolHanesiHesapla(aday);
    r.kontrol = { zorunlu: zorunlu, mevcut: v[8], hesap: hesap, eslesme: hesap !== null && hesap === v[8] };

    if (aday !== v) {
      var h2 = kontrolHanesiHesapla(aday);
      r.oneriler.push({ sasi: aday, neden: 'I→1, O/Q→0 (ISO 3779)', guclu: zorunlu && h2 === aday[8] });
    }
    // Zorunlu bölgede kontrol hanesi tutmuyorsa: tek karakterlik homoglif değişimiyle tutturan adaylar
    if (zorunlu && hesap !== aday[8]) {
      var katla = ayar.homoglifSiniflari || [];
      for (var p = 0; p < 17 && r.oneriler.length < 5; p++) {
        katla.forEach(function (sinif) {
          if (sinif.indexOf(aday[p]) < 0) return;
          sinif.forEach(function (yeni) {
            if (yeni === aday[p] || /[IOQ]/.test(yeni) || r.oneriler.length >= 5) return;
            var deneme = aday.slice(0, p) + yeni + aday.slice(p + 1);
            if (kontrolHanesiHesapla(deneme) === deneme[8]) {
              r.oneriler.push({ sasi: deneme, neden: (p + 1) + '. hane ' + aday[p] + '→' + yeni + ' kontrol hanesini tutturuyor', guclu: false });
            }
          });
        });
      }
    }
    return r;
  }

  // ── Sayı / kap / ülke ayrıştırma ─────────────────────────────────────
  function kgAyristir(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/[^\d.,\s]/g, '|');
    var m = s.match(/\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/);
    if (!m) return null;
    var t = m[0].replace(/\s/g, '');
    var nokta = t.lastIndexOf('.'), virgul = t.lastIndexOf(',');
    if (nokta > -1 && virgul > -1) {
      var ondalik = nokta > virgul ? '.' : ',';
      t = t.split(ondalik === '.' ? ',' : '.').join('').replace(ondalik, '.');
    } else if (nokta > -1 || virgul > -1) {
      var ayr = nokta > -1 ? '.' : ',';
      var parcalar = t.split(ayr);
      // Tek ayırıcı ve ardından tam 3 hane → binlik (2.150 kg); aksi hâlde ondalık (2150,5)
      if (parcalar.length > 2 || (parcalar.length === 2 && parcalar[1].length === 3)) t = parcalar.join('');
      else t = parcalar.join('.');
    }
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }
  var SAYI_KELIME = { 'BIR': 1, 'BİR': 1, 'ONE': 1, 'EIN': 1, 'EINS': 1, 'EINE': 1, 'IKI': 2, 'İKİ': 2, 'TWO': 2, 'ZWEI': 2 };
  function kapAyristir(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).toLocaleUpperCase('tr');
    var m = s.match(/\d+/);
    if (m) return parseInt(m[0], 10);
    var k = Object.keys(SAYI_KELIME).find(function (w) { return new RegExp('(^|[^A-ZİÜĞŞÇÖ])' + w + '($|[^A-ZİÜĞŞÇÖ])').test(s); });
    return k ? SAYI_KELIME[k] : null;
  }
  // Ülke adı / ISO kodu / gümrük kodlu ad ("063 — SLOVAKYA") → TSE adı
  var ULKE_TAKMA = {
    'ALMANYA': ['DE', 'D', 'GERMANY', 'DEUTSCHLAND', 'BRD', 'ALLEMAGNE'],
    'SLOVAKYA': ['SK', 'SLOVAKIA', 'SLOWAKEI', 'SLOVENSKO', 'SLOVAK REPUBLIC', 'SLOWAKISCHE REPUBLIK'],
    'AVUSTURYA': ['AT', 'A', 'AUSTRIA', 'ÖSTERREICH', 'OSTERREICH', 'OESTERREICH'],
    'MACARİSTAN': ['HU', 'H', 'HUNGARY', 'UNGARN', 'MAGYARORSZÁG'],
    'İNGİLTERE': ['GB', 'UK', 'UNITED KINGDOM', 'BİRLEŞİK KRALLIK', 'GROSSBRITANNIEN', 'GROẞBRITANNIEN', 'ENGLAND', 'GREAT BRITAIN'],
    'AMERİKA': ['US', 'USA', 'UNITED STATES', 'AMERİKA BİRLEŞİK DEVLETLERİ', 'ABD', 'VEREINIGTE STAATEN', 'U.S.A.'],
    'MEKSİKA': ['MX', 'MEXICO', 'MEXIKO'],
    'BELÇİKA': ['BE', 'B', 'BELGIUM', 'BELGIEN', 'BELGIQUE'],
    'ÇEK CUMHURİYETİ': ['CZ', 'CZECH REPUBLIC', 'CZECHIA', 'TSCHECHIEN', 'ÇEKYA'],
    'İTALYA': ['IT', 'I', 'ITALY', 'ITALIEN', 'ITALIA'],
    'FRANSA': ['FR', 'F', 'FRANCE', 'FRANKREICH'],
    'İSPANYA': ['ES', 'E', 'SPAIN', 'SPANIEN', 'ESPAÑA'],
    'JAPONYA': ['JP', 'J', 'JAPAN'],
    'ÇİN': ['CN', 'CHINA', 'ÇİN HALK CUMHURİYETİ', 'VOLKSREPUBLIK CHINA'],
    'GÜNEY KORE': ['KR', 'KOREA', 'SOUTH KOREA', 'GÜNEY KORE CUMHURİYETİ', 'SÜDKOREA'],
    'İSVEÇ': ['SE', 'S', 'SWEDEN', 'SCHWEDEN'],
    'POLONYA': ['PL', 'POLAND', 'POLEN'],
    'PORTEKİZ': ['PT', 'P', 'PORTUGAL'],
    'SLOVENYA': ['SI', 'SLOVENIA', 'SLOWENIEN'],
    'KANADA': ['CA', 'CANADA'],
    'HOLLANDA': ['NL', 'NETHERLANDS', 'NIEDERLANDE'],
    'FİNLANDİYA': ['FI', 'FIN', 'FINLAND', 'FINNLAND'],
    'ROMANYA': ['RO', 'ROMANIA', 'RUMÄNIEN'],
    'TÜRKİYE': ['TR', 'TURKEY', 'TÜRKEI', 'TURKIYE']
  };
  // Anahtar: Türkçe büyük harf + İ→I (Slovakia → SLOVAKİA → SLOVAKIA tuzağı olmasın)
  function ulkeAnahtar(s) { return String(s).toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim(); }
  var ULKE_INDEKS = {};
  Object.keys(ULKE_TAKMA).forEach(function (u) {
    ULKE_INDEKS[ulkeAnahtar(u)] = u;
    ULKE_TAKMA[u].forEach(function (t) { ULKE_INDEKS[ulkeAnahtar(t)] = u; });
  });
  function ulkeNormalize(v) {
    var s = String(v == null ? '' : v).replace(/^\s*\d{3}\s*[—–-]\s*/, '').trim();
    if (!s) return '';
    return ULKE_INDEKS[ulkeAnahtar(s)] || s.toLocaleUpperCase('tr');
  }
  // CoC 0.8 montaj adresinden ülke: "SK-83302 Bratislava" ya da adres içinde ülke adı
  function ulkeAdresten(adres) {
    var s = String(adres || '');
    var m = s.match(/\b([A-Z]{1,3})\s?-\s?\d{4,6}\b/);
    if (m && ULKE_INDEKS[m[1]] && m[1].length >= 2) return ULKE_INDEKS[m[1]];
    var U = ulkeAnahtar(s);
    var bulunan = '';
    Object.keys(ULKE_INDEKS).forEach(function (k) {
      if (k.length < 4 || bulunan) return;
      if (new RegExp('(^|[^A-ZÄÖÜŞĞÇ])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-ZÄÖÜŞĞÇ])').test(U)) bulunan = ULKE_INDEKS[k];
    });
    return bulunan;
  }
  // Şasi WMI'dan "ilk bakışta" ülke (tuzağın kendisi: W → Almanya). Yalnız uyarı metni için.
  function wmiUlke(vin) {
    var v = kanonik(vin, 'sasi');
    var c1 = v[0], c2 = v.slice(0, 2);
    var ara = function (a, z) { return c2 >= a && c2 <= z; };
    if (c1 === 'W') return 'ALMANYA';
    if (ara('SA', 'SM')) return 'İNGİLTERE';
    if (ara('ZA', 'ZR')) return 'İTALYA';
    if (ara('VF', 'VR')) return 'FRANSA';
    if (ara('VA', 'VE')) return 'AVUSTURYA';
    if (ara('TR', 'TV')) return 'MACARİSTAN';
    if (ara('TJ', 'TP')) return 'ÇEK CUMHURİYETİ';
    if (c1 === 'J') return 'JAPONYA';
    if (c1 === 'L') return 'ÇİN';
    if (/[145]/.test(c1)) return 'AMERİKA';
    if (c1 === '2') return 'KANADA';
    if (c1 === '3') return 'MEKSİKA';
    return '';
  }

  // ── Kurallar ─────────────────────────────────────────────────────────
  function sonuc(id, baslik, durum, seviye, mesaj, degerler, ek) {
    var r = { id: id, baslik: baslik, durum: durum, seviye: durum === 'KALDI' ? seviye : '', mesaj: mesaj || '',
      degerler: (degerler || []).map(function (d) {
        var o = { kaynak: d.kaynak, deger: d.deger == null ? '' : String(d.deger) };
        if (d.dosya) o.dosya = d.dosya;
        return o;
      }) };
    if (ek) Object.keys(ek).forEach(function (k) { if (ek[k] !== undefined) r[k] = ek[k]; });
    r.parmakIzi = parmakIzi(id + '|' + r.degerler.map(function (d) { return d.kaynak + '=' + d.deger; }).join('|'));
    return r;
  }
  function topla(girdi, liste) {
    // liste: [[kaynakEtiketi, belge, alan]]
    var out = [];
    liste.forEach(function (x) {
      var b = girdi[x[1]];
      if (!b) return;
      var ham = b[x[2]];
      var v = deger(ham);
      if (bos(v)) return;
      var kb = kaynakBilgi(ham);
      var o = { kaynak: x[0], deger: v, dosya: kb ? (kb.ad || kb.dosyaId || '') : '', belge: x[1] };
      if (ham && typeof ham === 'object' && ham.guven === 'dusuk') o.dusukGuven = true;
      out.push(o);
    });
    return out;
  }
  // x[3] === 'ops': belgede bu alan her zaman bulunmaz (ör. A.TR'de şasi) → yokluğu "doğrulanamadı" saydırmaz
  function eksikler(girdi, liste) {
    return liste.filter(function (x) { return x[3] !== 'ops' && (!girdi[x[1]] || bos(deger(girdi[x[1]][x[2]]))); }).map(function (x) { return x[0]; });
  }

  // Kimlik alanı eşitliği (şasi, TVV, motor no, motor kodu, 11. hane)
  function kimlikKurali(id, baslik, girdi, liste, tip, ayar, enAz) {
    var degerler = topla(girdi, liste);
    var eksik = eksikler(girdi, liste);
    if (degerler.length < (enAz || 2)) {
      return sonuc(id, baslik, degerler.length ? 'DOGRULANAMADI' : 'UYGULANMAZ', '',
        degerler.length ? 'Karşılaştırma için en az iki kaynak gerekli; okunamayan/eksik: ' + eksik.join(', ') : 'Kaynak yok', degerler);
    }
    var ref = degerler[0];
    var en = 'ESIT', farklar = [];
    degerler.slice(1).forEach(function (d) {
      var k = karsilastir(ref.deger, d.deger, { tip: tip, ayarlar: belgeAyari(ayar, [ref.belge, d.belge]) });
      if (k.sonuc === 'ESIT') return;
      if (k.sonuc === 'FARKLI') en = 'FARKLI';
      else if (en === 'ESIT') en = 'BENZER';
      farklar.push({ kaynak: d.kaynak, referans: ref.kaynak, sonuc: k.sonuc, pozisyonlar: k.pozisyonlar });
    });
    if (en === 'ESIT') {
      return sonuc(id, baslik, eksik.length ? 'DOGRULANAMADI' : 'GECTI', '',
        eksik.length ? 'Okunan kaynaklar birebir aynı; doğrulanamayan: ' + eksik.join(', ') : 'Tüm kaynaklar birebir aynı', degerler);
    }
    var aciklama = farklar.map(function (f) {
      var poz = f.pozisyonlar.length ? ' (' + f.pozisyonlar.map(function (p) { return p.sira + '. hane ' + p.a + '↔' + p.b; }).join(', ') + ')' : '';
      return f.referans + ' ↔ ' + f.kaynak + ': ' + (f.sonuc === 'BENZER' ? 'OCR TUZAĞI — yalnız benzer karakter farkı' : 'farklı') + poz;
    }).join(' · ');
    return sonuc(id, baslik, 'KALDI', 'KRITIK', aciklama, degerler, { karsilastirma: en, farklar: farklar });
  }

  function R_sasiBicim(girdi, ayar) {
    var kaynaklar = [['Kart', 'arac', 'sasi'], ['Fatura', 'fatura', 'sasi'], ['CoC 0.10', 'coc', 'sasi'], ['ULM', 'ulm', 'sasi'], ['A.TR', 'atr', 'sasi']];
    var degerler = topla(girdi, kaynaklar);
    if (!degerler.length) return sonuc('SASI_BICIM', 'Şasi biçimi (ISO 3779)', 'DOGRULANAMADI', '', 'Hiçbir kaynakta şasi okunamadı', []);
    var sorunlar = [], oneriler = [];
    degerler.forEach(function (d) {
      var r = sasiIncele(d.deger, ayar);
      if (r.hatalar.length) sorunlar.push(d.kaynak + ': ' + r.hatalar.join('; '));
      r.oneriler.forEach(function (o) { oneriler.push({ kaynak: d.kaynak, sasi: o.sasi, neden: o.neden, guclu: o.guclu }); });
    });
    return sonuc('SASI_BICIM', 'Şasi biçimi (ISO 3779)', sorunlar.length ? 'KALDI' : 'GECTI', 'KRITIK',
      sorunlar.length ? sorunlar.join(' · ') : '17 hane, I/O/Q yok', degerler, oneriler.length ? { oneriler: oneriler } : null);
  }

  function R_kontrolHanesi(girdi, ayar) {
    var ref = topla(girdi, [['Kart', 'arac', 'sasi'], ['CoC 0.10', 'coc', 'sasi'], ['Fatura', 'fatura', 'sasi']])[0];
    if (!ref) return sonuc('KONTROL_HANESI', '9. hane kontrol basamağı', 'DOGRULANAMADI', '', 'Şasi yok', []);
    var r = sasiIncele(ref.deger, ayar);
    if (!r.kontrol) return sonuc('KONTROL_HANESI', '9. hane kontrol basamağı', 'UYGULANMAZ', '', 'Şasi biçimi geçersiz (bkz. şasi biçimi kuralı)', [ref]);
    if (r.kontrol.eslesme) return sonuc('KONTROL_HANESI', '9. hane kontrol basamağı', 'GECTI', '', 'Kontrol hanesi doğru (' + r.kontrol.hesap + ')', [ref]);
    var seviye = r.kontrol.zorunlu ? 'KRITIK' : (ayar.kontrolHanesiDigerSeviye || 'BILGI');
    var mesaj = '9. hane "' + r.kontrol.mevcut + '", hesaplanan "' + r.kontrol.hesap + '". ' + (r.kontrol.zorunlu
      ? 'Bu menşede (şasi "' + r.sasi[0] + '") kontrol hanesi zorunlu — şasi hatalı okunmuş ya da sahte olabilir.'
      : 'Bu üretici kontrol hanesi kullanmak zorunda değil; bilgi amaçlı.');
    return sonuc('KONTROL_HANESI', '9. hane kontrol basamağı', 'KALDI', seviye, mesaj, [ref], r.oneriler.length ? { oneriler: r.oneriler } : null);
  }

  function R_montajHanesi(girdi, ayar) {
    var kaynaklar = [['Kart', 'arac', 'sasi'], ['Fatura', 'fatura', 'sasi'], ['A.TR', 'atr', 'sasi', 'ops'], ['CoC 0.10', 'coc', 'sasi'], ['ULM', 'ulm', 'sasi']];
    var sanal = {};
    kaynaklar.forEach(function (k) {
      var b = girdi[k[1]];
      var v = b ? kanonik(deger(b[k[2]]), 'sasi') : '';
      if (v.length === 17) { sanal[k[1]] = { h11: { deger: v[10], kaynak: kaynakBilgi(b[k[2]]) } }; }
    });
    var liste = kaynaklar.map(function (k) { return [k[0], k[1], 'h11', k[3]]; });
    var r = kimlikKurali('MONTAJ_HANESI', 'Şasi 11. hane (montaj fabrikası)', sanal, liste, 'sasi', ayar);
    if (r.durum === 'KALDI') r.mesaj = 'Montaj fabrikası kodu kaynaklar arasında farklı — menşe değişebilir. ' + r.mesaj;
    return r;
  }

  function R_mense(girdi, ayar, bag) {
    var arac = girdi.arac || {};
    var sasi = kanonik(deger(arac.sasi), 'sasi');
    var beyan = ulkeNormalize(deger(arac.mensei));
    var cocUlke = girdi.coc ? ulkeNormalize(deger(girdi.coc.montajUlkesi)) : '';
    var fab = (bag && typeof bag.menseCoz === 'function' && sasi) ? bag.menseCoz(sasi, deger(arac.model)) : null;
    var fabUlke = fab && fab.ulke ? ulkeNormalize(fab.ulke) : '';
    var wmi = wmiUlke(sasi);
    var degerler = [{ kaynak: 'Kart menşe', deger: beyan }, { kaynak: 'CoC 0.8 montaj ülkesi', deger: cocUlke },
      { kaynak: 'Şasi 11. hane fabrika matrisi', deger: fabUlke || (fab && fab.belirsiz ? 'belirsiz' : '') }];
    var ipucu = function (dogru) {
      return (wmi && beyan === wmi && dogru !== wmi) ? ' Şasi WMI\'sı ' + wmi + ' gösterdiği için menşe otomatik ' + wmi + ' seçilmiş olabilir; WMI üreticiyi, 11. hane montaj fabrikasını gösterir.' : '';
    };
    if (!beyan) return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'DOGRULANAMADI', '', 'Kartta menşe yok', degerler);
    if (cocUlke) {
      if (cocUlke !== beyan) {
        return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'KALDI', ayar.menseUyusmazlikSeviye || 'KRITIK',
          'Kart menşei ' + beyan + ', CoC montaj fabrikası ' + cocUlke + '.' + ipucu(cocUlke), degerler);
      }
      if (fabUlke && fabUlke !== cocUlke) {
        return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'KALDI', 'UYARI',
          'Menşe CoC ile uyumlu (' + cocUlke + ') ama fabrika matrisi ' + fabUlke + ' diyor — matristeki kod güncel mi?', degerler);
      }
      return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'GECTI', '', 'Menşe CoC montaj ülkesiyle aynı (' + beyan + ')', degerler);
    }
    if (fabUlke && fabUlke !== beyan) {
      return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'KALDI', 'UYARI',
        'CoC montaj ülkesi okunamadı; şasi fabrika kodu ' + fabUlke + ' gösteriyor, kartta ' + beyan + '.' + ipucu(fabUlke), degerler);
    }
    if (fab && fab.belirsiz && wmi && beyan === wmi) {
      return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'KALDI', 'UYARI',
        'CoC montaj ülkesi okunamadı ve fabrika kodu belirsiz (' + fab.neden + '); menşe yalnız WMI\'dan (' + wmi + ') gelmiş olabilir.', degerler);
    }
    return sonuc('MENSE', 'Menşe ↔ CoC montaj ülkesi', 'DOGRULANAMADI', '',
      fabUlke ? 'CoC montaj ülkesi okunamadı; fabrika matrisi kartla uyumlu (' + fabUlke + ')' : 'CoC montaj ülkesi okunamadı', degerler);
  }

  // Belge birden çok aracı kapsıyorsa (ordino "2-ADET", CMR "3x PKW") araç bazında eşitlik aranmaz
  function cokAracli(girdi, belge) {
    var b = girdi[belge];
    var n = b ? kapAyristir(deger(b.aracSayisi)) : null;
    return n !== null && n > 1 ? n : 0;
  }
  function R_kapAdedi(girdi) {
    var B = 'Kap adedi (A.TR = CMR = Özet beyan/MRN)';
    var liste = [['A.TR kutu 8', 'atr', 'kap'], ['CMR kutu 6-9', 'cmr', 'kap'], ['Özet beyan / MRN', 'ozet', 'kap'], ['Ordino', 'ordino', 'kap', 'ops']];
    var degerler = topla(girdi, liste).map(function (d) { return { kaynak: d.kaynak, deger: kapAyristir(d.deger), dosya: d.dosya, dusukGuven: d.dusukGuven }; })
      .filter(function (d) { return d.deger !== null; });
    var eksik = liste.filter(function (x) { return x[3] !== 'ops'; }).map(function (x) { return x[0]; })
      .filter(function (k) { return !degerler.some(function (d) { return d.kaynak === k; }); });
    // Yalnız tahmini (düşük güvenli) değer farklıysa kilit yok: elle teyit
    var kesin = degerler.filter(function (d) { return !d.dusukGuven; });
    if (kesin.length && degerler.some(function (d) { return d.dusukGuven && d.deger !== kesin[0].deger; }) &&
        !kesin.some(function (d) { return d.deger !== kesin[0].deger; }))
      return sonuc('KAP_ADEDI', B, 'DOGRULANAMADI', '', 'Tahmini değer farklı (belgede açık kap adedi yok): ' +
        degerler.map(function (d) { return d.kaynak + ' ' + d.deger + (d.dusukGuven ? ' (tahmini)' : ''); }).join(', '), degerler);
    if (degerler.length < 2) return sonuc('KAP_ADEDI', B, degerler.length ? 'DOGRULANAMADI' : 'UYGULANMAZ', '',
      'Okunamayan: ' + eksik.join(', '), degerler);
    var farkli = degerler.some(function (d) { return d.deger !== degerler[0].deger; });
    var coklu = ['atr', 'cmr', 'ozet', 'ordino'].filter(function (b) { return cokAracli(girdi, b); });
    if (farkli && coklu.length) return sonuc('KAP_ADEDI', B, 'DOGRULANAMADI', '',
      'Çok araçlı belge (' + coklu.join(', ') + ' ' + cokAracli(girdi, coklu[0]) + ' araç) — kap adedi sefer bazında karşılaştırılmalı: ' +
      degerler.map(function (d) { return d.kaynak + ' ' + d.deger; }).join(', '), degerler);
    if (farkli) return sonuc('KAP_ADEDI', B, 'KALDI', 'KRITIK',
      'Kap adetleri farklı: ' + degerler.map(function (d) { return d.kaynak + ' ' + d.deger; }).join(', '), degerler);
    return sonuc('KAP_ADEDI', B, eksik.length ? 'DOGRULANAMADI' : 'GECTI', '',
      eksik.length ? 'Okunanlar eşit; okunamayan: ' + eksik.join(', ') : 'Belgelerde de ' + degerler[0].deger, degerler);
  }

  function R_brut(girdi, ayar) {
    var liste = [['A.TR kutu 9', 'atr', 'brut'], ['CMR kutu 11', 'cmr', 'brut'], ['Özet beyan / MRN brüt', 'ozet', 'brut'], ['Ordino', 'ordino', 'brut', 'ops']];
    var BELGE = { 'A.TR kutu 9': 'atr', 'CMR kutu 11': 'cmr', 'Özet beyan / MRN brüt': 'ozet', 'Ordino': 'ordino' };
    var tum = topla(girdi, liste).map(function (d) { return { kaynak: d.kaynak, deger: kgAyristir(d.deger), dosya: d.dosya }; })
      .filter(function (d) { return d.deger !== null; });
    // Çok araçlı belgenin brütü tek aracın brütüyle karşılaştırılmaz
    var ayrilan = tum.filter(function (d) { return cokAracli(girdi, BELGE[d.kaynak]); });
    var degerler = tum.filter(function (d) { return !cokAracli(girdi, BELGE[d.kaynak]); });
    var eksik = liste.filter(function (x) { return x[3] !== 'ops'; }).map(function (x) { return x[0]; })
      .filter(function (k) { return !degerler.some(function (d) { return d.kaynak === k; }); });
    var not = ayrilan.length ? ' (çok araçlı belge karşılaştırma dışı: ' + ayrilan.map(function (d) { return d.kaynak; }).join(', ') + ')' : '';
    var B = 'Brüt kilo (A.TR / CMR / Özet beyan, ±' + ayar.brutToleransKg + ' kg)';
    if (degerler.length < 2) return sonuc('BRUT_KILO', B, degerler.length ? 'DOGRULANAMADI' : 'UYGULANMAZ', '', 'Okunamayan: ' + eksik.join(', ') + not, tum);
    var sayilar = degerler.map(function (d) { return d.deger; });
    var fark = Math.round((Math.max.apply(null, sayilar) - Math.min.apply(null, sayilar)) * 100) / 100;
    if (fark > ayar.brutToleransKg) return sonuc('BRUT_KILO', B, 'KALDI', 'KRITIK',
      'En büyük fark ' + fark + ' kg (izin verilen ' + ayar.brutToleransKg + ' kg): ' +
      degerler.map(function (d) { return d.kaynak + ' ' + d.deger; }).join(', ') + not, degerler, { farkKg: fark });
    return sonuc('BRUT_KILO', B, eksik.length ? 'DOGRULANAMADI' : 'GECTI', '',
      'En büyük fark ' + fark + ' kg' + (eksik.length ? '; okunamayan: ' + eksik.join(', ') : '') + not, degerler, { farkKg: fark });
  }

  // Portal kaydı (arac + arac.evrakAlanlari) → denetle() girdisi. Özet beyan yoksa MRN belgesi (EX/T1/T2) kullanılır.
  function girdiOlustur(arac, evrakAlanlari, mensei) {
    arac = arac || {};
    var ea = evrakAlanlari || arac.evrakAlanlari || {};
    // Alan bazında: Özet beyanda (okunan ya da elle) olan alan önce, yoksa MRN belgesindeki
    var ozet = {};
    [ea.mrn || {}, ea.ozet || {}].forEach(function (b) { Object.keys(b).forEach(function (k) { if (!bos(deger(b[k]))) ozet[k] = b[k]; }); });
    var cmr = {};
    Object.keys(ea.cmr || {}).forEach(function (k) { cmr[k] = ea.cmr[k]; });
    return {
      arac: { sasi: arac.sasi || '', mensei: mensei !== undefined ? mensei : (arac.mensei || ''), model: arac.model || '', marka: arac.marka || '' },
      fatura: ea.fatura || {}, atr: ea.atr || {}, cmr: cmr, ozet: ozet, ordino: ea.ordino || {},
      coc: ea.coc || {}, ulm: ea.ulm || {}
    };
  }

  function R_cmrCoc(girdi, ayar) {
    var B = 'CMR brüt ≥ CoC kütlesi (13.2 / 13)';
    var cmr = girdi.cmr || {}, coc = girdi.coc || {};
    var cmrBrut = kgAyristir(deger(cmr.brut));
    var k132 = kgAyristir(deger(coc.kutle132)), k13 = kgAyristir(deger(coc.kutle13));
    var aracSayisi = kapAyristir(deger(cmr.aracSayisi)) || 1;
    var toplam = kgAyristir(deger(cmr.cocKutleToplami));
    var tabanAd = k132 !== null ? 'CoC 13.2 (gerçek kütle)' : 'CoC 13 (kullanıma hazır kütle)';
    var taban = aracSayisi > 1 ? toplam : (k132 !== null ? k132 : k13);
    if (aracSayisi > 1) tabanAd = aracSayisi + ' aracın CoC kütle toplamı';
    var degerler = [{ kaynak: 'CMR kutu 11', deger: cmrBrut === null ? '' : cmrBrut }, { kaynak: tabanAd, deger: taban === null ? '' : taban }];
    if (cmrBrut === null || taban === null) {
      return sonuc('CMR_COC_KUTLE', B, (cmrBrut === null && taban === null) ? 'UYGULANMAZ' : 'DOGRULANAMADI', '',
        aracSayisi > 1 && toplam === null ? 'Çok araçlı CMR: araçların CoC kütle toplamı gerekli' : 'CMR brüt ya da CoC kütlesi okunamadı', degerler);
    }
    var esik = taban - ayar.cocKutlePayiKg * aracSayisi;
    if (cmrBrut < esik) return sonuc('CMR_COC_KUTLE', B, 'KALDI', 'KRITIK',
      'CMR brüt ' + cmrBrut + ' kg, ' + tabanAd + ' ' + taban + ' kg − ' + (ayar.cocKutlePayiKg * aracSayisi) + ' kg payın da altında', degerler);
    if (cmrBrut < taban) return sonuc('CMR_COC_KUTLE', B, 'KALDI', 'UYARI',
      'CMR brüt ' + cmrBrut + ' kg, ' + tabanAd + ' ' + taban + ' kg\'dan ' + (taban - cmrBrut) + ' kg az (sürücü/yakıt payı içinde, kontrol edin)', degerler);
    return sonuc('CMR_COC_KUTLE', B, 'GECTI', '', 'CMR brüt CoC kütlesinden az değil', degerler);
  }

  // ── Ana giriş ─────────────────────────────────────────────────────────
  // İthalat faturalarında motor no çoğunlukla yazmaz: faturada yoksa kural uygulanmaz (kilit/uyarı yok)
  function R_motorNo(girdi, ayar) {
    var f = girdi.fatura && deger(girdi.fatura.motorNo);
    if (bos(f)) {
      var u = girdi.ulm && deger(girdi.ulm.motorNo);
      return sonuc('MOTOR_NO', 'Motor seri no: Fatura = ULM', 'UYGULANMAZ', '',
        'Faturada motor no yok (ithalat faturalarında olağan); motor kontrolü CoC 21 ↔ ULM üzerinden yapılır',
        bos(u) ? [] : [{ kaynak: 'ULM', deger: u }]);
    }
    return kimlikKurali('MOTOR_NO', 'Motor seri no: Fatura = ULM', girdi, [['Fatura', 'fatura', 'motorNo'], ['ULM', 'ulm', 'motorNo']], 'metin', ayar);
  }
  // CoC 21 motor tip kodu ULM motor seri numarasının başında yer alır (Mercedes M176 → 176…, VW DKZ → DKZ…).
  // Üreticiye göre değiştiğinden tutmazsa yalnız UYARI.
  function R_motorKodNo(girdi) {
    var B = 'Motor kodu (CoC 21) ↔ ULM motor no';
    var kod = girdi.coc && deger(girdi.coc.motorKodu), no = girdi.ulm && deger(girdi.ulm.motorNo);
    var degerler = topla(girdi, [['CoC 21', 'coc', 'motorKodu'], ['ULM motor no', 'ulm', 'motorNo']]);
    if (bos(kod) || bos(no)) return sonuc('MOTOR_KOD_NO', B, degerler.length ? 'DOGRULANAMADI' : 'UYGULANMAZ', '',
      'Okunamayan: ' + [bos(kod) ? 'CoC 21' : '', bos(no) ? 'ULM motor no' : ''].filter(Boolean).join(', '), degerler);
    var K = kanonik(kod, 'metin').replace(/[^A-Z0-9]/g, ''), N = kanonik(no, 'metin').replace(/[^A-Z0-9]/g, '');
    var adaylar = [K, K.replace(/^[A-Z]+/, '')].filter(function (x) { return x.length >= 2; });
    var tutar = adaylar.some(function (a) { return N.slice(0, a.length + 3).indexOf(a) > -1; });
    return sonuc('MOTOR_KOD_NO', B, tutar ? 'GECTI' : 'KALDI', 'UYARI',
      tutar ? 'Motor no, motor koduyla başlıyor' : 'ULM motor no "' + no + '" CoC 21 motor kodu "' + kod + '" ile başlamıyor — motor etiketini kontrol edin', degerler);
  }

  function denetle(girdi, ayarlar, bag) {
    girdi = girdi || {};
    var ayar = birlestirAyar(ayarlar);
    var sonuclar = [
      R_sasiBicim(girdi, ayar),
      R_kontrolHanesi(girdi, ayar),
      kimlikKurali('SASI_ESLESME', 'Şasi: Kart = Fatura = CoC 0.10 = ULM = A.TR', girdi,
        [['Kart', 'arac', 'sasi'], ['Fatura', 'fatura', 'sasi'], ['CoC 0.10', 'coc', 'sasi'], ['ULM', 'ulm', 'sasi'], ['A.TR', 'atr', 'sasi', 'ops']], 'sasi', ayar),
      R_montajHanesi(girdi, ayar),
      kimlikKurali('TVV', 'Tip/Varyant/Versiyon: CoC 0.2 = ULM', girdi, [['CoC 0.2', 'coc', 'tvv'], ['ULM', 'ulm', 'tvv']], 'metin', ayar),
      R_motorNo(girdi, ayar),
      kimlikKurali('MOTOR_KODU', 'Motor tip kodu: CoC 21 = ULM', girdi, [['CoC 21', 'coc', 'motorKodu'], ['ULM', 'ulm', 'motorKodu']], 'metin', ayar),
      R_motorKodNo(girdi),
      R_mense(girdi, ayar, bag),
      R_kapAdedi(girdi),
      R_brut(girdi, ayar),
      R_cmrCoc(girdi, ayar)
    ];
    var say = { KRITIK: 0, UYARI: 0, BILGI: 0, DOGRULANAMADI: 0, GECTI: 0 };
    sonuclar.forEach(function (s) {
      if (s.durum === 'KALDI') say[s.seviye] = (say[s.seviye] || 0) + 1;
      else if (s.durum === 'DOGRULANAMADI') say.DOGRULANAMADI++;
      else if (s.durum === 'GECTI') say.GECTI++;
    });
    return { surum: SURUM, sonuclar: sonuclar, ozet: say };
  }

  // ── Aşama 2.2: panel katmanı ──────────────────────────────────────────
  // ISO 3779'da olmayan I/O/Q (ve küçük l) → 1/0. Yalnız şasi için: başka alanda (TVV I1I1TB) asla.
  function ocrDuzelt(vin) {
    var k = kanonik(vin, 'sasi');
    if (k.length !== 17 || !/[IOQℓ]/.test(k)) return '';
    return k.replace(/[Iℓ]/g, '1').replace(/[OQ]/g, '0');
  }
  var BELGE_AD = { fatura: 'Fatura', atr: 'A.TR', coc: 'CoC', ulm: 'ULM', cmr: 'CMR', ozet: 'Özet beyan / MRN' };
  // Satır içi elle giriş yapılabilecek alanlar (kural → [belge, alan, etiket, tip])
  var ELLE_ALANLAR = {
    SASI_ESLESME: [['coc', 'sasi', 'CoC 0.10 şasi', 'sasi'], ['ulm', 'sasi', 'ULM şasi', 'sasi']],
    MONTAJ_HANESI: [['coc', 'sasi', 'CoC 0.10 şasi', 'sasi'], ['ulm', 'sasi', 'ULM şasi', 'sasi']],
    TVV: [['coc', 'tvv', 'CoC 0.2 Tip/Varyant/Versiyon', 'metin'], ['ulm', 'tvv', 'ULM Tip/Varyant/Versiyon', 'metin']],
    MOTOR_KODU: [['coc', 'motorKodu', 'CoC 21 motor kodu', 'metin'], ['ulm', 'motorKodu', 'ULM motor kodu', 'metin']],
    MOTOR_KOD_NO: [['coc', 'motorKodu', 'CoC 21 motor kodu', 'metin'], ['ulm', 'motorNo', 'ULM motor no', 'metin']],
    MENSE: [['coc', 'montajUlkesi', 'CoC 0.8 montaj ülkesi', 'ulke']],
    KAP_ADEDI: [['atr', 'kap', 'A.TR kap adedi', 'adet'], ['cmr', 'kap', 'CMR kap adedi', 'adet'], ['ozet', 'kap', 'Özet beyan / MRN kap adedi', 'adet']],
    BRUT_KILO: [['atr', 'brut', 'A.TR brüt kg', 'kg'], ['cmr', 'brut', 'CMR brüt kg', 'kg'], ['ozet', 'brut', 'Özet beyan / MRN brüt kg', 'kg']],
    CMR_COC_KUTLE: [['coc', 'kutle13', 'CoC 13 kütle kg', 'kg'], ['coc', 'kutle132', 'CoC 13.2 gerçek kütle kg', 'kg'], ['cmr', 'brut', 'CMR brüt kg', 'kg']]
  };
  // Elle girilen metni alan tipine göre doğrula; geçersizse null
  function elleDegerAyristir(metin, tip) {
    var s = String(metin == null ? '' : metin).trim();
    if (!s) return null;
    if (tip === 'kg') { var k = kgAyristir(s); return k !== null && k > 0 && k < 100000 ? k : null; }
    if (tip === 'adet') { var a = kapAyristir(s); return a !== null && a > 0 && a < 1000 ? a : null; }
    if (tip === 'sasi') { var v = kanonik(s, 'sasi').replace(/ℓ/g, 'L'); return v.length === 17 ? v : null; }
    if (tip === 'ulke') return ulkeNormalize(s) || s.toLocaleUpperCase('tr');
    return s.slice(0, 80);
  }
  var KIMLIK_KURALLARI = { SASI_BICIM: 1, KONTROL_HANESI: 1 };
  var KISMI_UYGUN = { SASI_ESLESME: 1, MONTAJ_HANESI: 1, KAP_ADEDI: 1, BRUT_KILO: 1 };

  // Panel: ham rapor + I/O/Q düzeltilmiş rapor. Ham'da kalıp düzeltilmişte geçen kural = OCR şüphesi (sarı, tek tık);
  // ikisinde de kalan KRİTİK = EVRAK KIYAS ÇELİŞKİSİ (kırmızı; mesaj düzeltilmiş rapordan → kalan gerçek fark).
  function panelHazirla(girdi, ayarlar, bag) {
    var ham = denetle(girdi, ayarlar, bag);
    var oneriler = [];
    var duz = JSON.parse(JSON.stringify(girdi || {}));
    var ayar = birlestirAyar(ayarlar);
    var kart = kanonik(deger((girdi && girdi.arac || {}).sasi), 'sasi');
    var kartGecerli = kart.length === 17 && !/[IOQℓ]/.test(kart);
    ['fatura', 'atr', 'coc', 'ulm'].forEach(function (b) {
      var x = duz[b] && duz[b].sasi, v = deger(x);
      if (bos(v)) return;
      var k = kanonik(v, 'sasi'), yeni = '', neden = '';
      // 1) Kart şasisinden yalnız OCR'ın karıştırdığı karakterlerle (belgeye özel sınıflar dahil) ayrılıyorsa → kart şasisi
      if (kartGecerli && k.length === 17 && k !== kart &&
          karsilastir(kart, k, { tip: 'sasi', ayarlar: belgeAyari(ayar, [b]) }).sonuc === 'BENZER') {
        yeni = kart;
        neden = 'Kart şasisinden yalnız OCR\'ın karıştırdığı karakterlerle ayrılıyor' +
          (((ayar.belgeHomoglifleri || {})[b] || []).length ? ' (desenli zemin: ' + ayar.belgeHomoglifleri[b].map(function (x) { return x.join('↔'); }).join(', ') + ' dahil)' : '');
      } else {
        // 2) Kart şasisi yoksa/uymuyorsa: ISO 3779'da olmayan I/O/Q → 1/0
        yeni = ocrDuzelt(v);
        neden = 'ISO 3779\'da I/O/Q olmaz';
      }
      if (!yeni) return;
      oneriler.push({ belge: b, belgeAd: BELGE_AD[b], alan: 'sasi', eski: String(v), yeni: yeni, neden: neden });
      if (x && typeof x === 'object') x.deger = yeni; else duz[b].sasi = yeni;
    });
    var dz = oneriler.length ? denetle(duz, ayarlar, bag) : ham;
    var dzBul = {}; dz.sonuclar.forEach(function (s) { dzBul[s.id] = s; });
    var gosterilen = {}; // aynı elle giriş kutusu yalnız ilk satırda
    var satirlar = ham.sonuclar.map(function (s) {
      var d = dzBul[s.id] || s;
      var satir = { id: s.id, baslik: s.baslik, durum: s.durum, seviye: s.seviye, mesaj: s.mesaj, degerler: s.degerler, parmakIzi: s.parmakIzi };
      if (s.durum === 'KALDI' && s.seviye === 'KRITIK') {
        if (d.durum !== 'KALDI' || d.seviye !== 'KRITIK') {
          satir.renk = 'sari'; satir.kategori = 'OCR_SUPHESI'; satir.etiket = 'OCR ŞÜPHESİ';
          satir.mesaj = s.mesaj + ' — OCR önerisi kabul edilince çelişki kalmıyor';
        } else {
          satir.renk = 'kirmizi'; satir.kategori = 'KRITIK_CELISKI';
          satir.etiket = KIMLIK_KURALLARI[s.id] ? 'ŞASİ HATASI' : 'EVRAK KIYAS ÇELİŞKİSİ';
          satir.mesaj = d.mesaj; satir.degerler = d.degerler; satir.parmakIzi = d.parmakIzi;
          if (oneriler.length && d.mesaj !== s.mesaj) satir.not = 'OCR düzeltmesinden sonra kalan fark gösteriliyor';
        }
      } else if (s.durum === 'KALDI' && s.seviye === 'UYARI') { satir.renk = 'sari'; satir.kategori = 'UYARI'; satir.etiket = 'UYARI'; }
      else if (s.durum === 'KALDI') { satir.renk = 'gri'; satir.kategori = 'BILGI'; satir.etiket = 'BİLGİ'; }
      else if (s.durum === 'GECTI') { satir.renk = 'yesil'; satir.kategori = 'GECTI'; satir.etiket = 'DOĞRULANDI'; }
      else if (s.durum === 'DOGRULANAMADI' && KISMI_UYGUN[s.id] && (s.degerler || []).length >= 3 && !/çok araçlı|tahmini|farklı/i.test(s.mesaj)) {
        // Okunan en az üç kaynak birebir uyuşuyor; eksik kaynak (CoC/ULM) yalnız bilgi → yeşil, elle giriş açık kalır
        satir.renk = 'yesil'; satir.kategori = 'GECTI_KISMI'; satir.etiket = 'DOĞRULANDI (KISMİ)'; satir.kismi = true;
      }
      else if (s.durum === 'DOGRULANAMADI') { satir.renk = 'sari'; satir.kategori = 'DOGRULANAMADI'; satir.etiket = 'DOĞRULANAMADI'; }
      else { satir.renk = 'gri'; satir.kategori = 'UYGULANMAZ'; satir.etiket = 'UYGULANMAZ'; }
      if ((satir.renk !== 'yesil' || satir.kismi) && ELLE_ALANLAR[s.id]) {
        var bosAlanlar = ELLE_ALANLAR[s.id].filter(function (e) {
          var anahtar = e[0] + '.' + e[1];
          if (gosterilen[anahtar] || (girdi[e[0]] && !bos(deger(girdi[e[0]][e[1]])))) return false;
          return (gosterilen[anahtar] = true);
        }).map(function (e) { return { belge: e[0], alan: e[1], etiket: e[2], tip: e[3] }; });
        if (bosAlanlar.length) {
          satir.elleAlanlar = bosAlanlar;
          if (satir.kategori === 'DOGRULANAMADI' || satir.kategori === 'UYGULANMAZ') { satir.renk = 'sari'; satir.kategori = 'ELLE_GIRIS'; satir.etiket = 'ELLE GİRİŞ BEKLİYOR'; }
        }
      }
      if (s.id === 'SASI_BICIM' || s.id === 'SASI_ESLESME' || s.id === 'MONTAJ_HANESI') {
        var ilgili = oneriler.filter(function () { return satir.kategori === 'OCR_SUPHESI' || satir.kategori === 'KRITIK_CELISKI'; });
        if (ilgili.length) satir.ocrOnerileri = ilgili;
      }
      return satir;
    });
    var ozet = { kirmizi: 0, sari: 0, yesil: 0, gri: 0 };
    satirlar.forEach(function (s) { ozet[s.renk]++; });
    return { surum: SURUM, satirlar: satirlar, ozet: ozet, ocrOnerileri: oneriler, rapor: ham, duzeltilmisRapor: dz };
  }

  // Aşama 2.3 — panel kilidi: yalnız KIRMIZI satırlar kilitler (OCR şüphesi/doğrulanamadı/uyarı kilitlemez).
  // Onay, satırın o anki değer parmak iziyle saklanır; belgeler değişirse onay düşer ve kilit geri gelir.
  function panelKilit(panel, onaylar, mod) {
    onaylar = onaylar || {};
    var acik = [], onayli = [], dusen = [];
    (panel && panel.satirlar || []).forEach(function (s) {
      if (s.renk !== 'kirmizi') return;
      var o = onaylar[s.id];
      if (o && o.parmakIzi === s.parmakIzi) { onayli.push(s.id); s.onay = o; return; }
      if (o) dusen.push(s.id);
      acik.push(s.id);
    });
    var olurdu = acik.length > 0;
    return { kilit: mod === 'sert' ? olurdu : false, kilitOlurdu: olurdu, mod: mod === 'sert' ? 'sert' : 'golge',
      acikKritikler: acik, onaylananlar: onayli, dusenOnaylar: dusen };
  }

  // Kilit: KRİTİK + KALDI + geçerli onayı yok. Onay, kuralın değer parmak iziyle eşleşmezse (değer değişti) düşer.
  // mod 'golge': hiçbir şey kilitlenmez, yalnız "kilitOlurdu" raporlanır.
  function kilitDurumu(rapor, onaylar, mod) {
    onaylar = onaylar || {};
    var acik = [], onayli = [], dusen = [];
    (rapor && rapor.sonuclar || []).forEach(function (s) {
      if (s.durum !== 'KALDI' || s.seviye !== 'KRITIK') return;
      var o = onaylar[s.id];
      if (o && o.parmakIzi === s.parmakIzi) { onayli.push(s.id); return; }
      if (o) dusen.push(s.id);
      acik.push(s.id);
    });
    var olurdu = acik.length > 0;
    return { kilit: mod === 'sert' ? olurdu : false, kilitOlurdu: olurdu, mod: mod === 'sert' ? 'sert' : 'golge',
      acikKritikler: acik, onaylananlar: onayli, dusenOnaylar: dusen };
  }

  return {
    SURUM: SURUM,
    VARSAYILAN_AYARLAR: VARSAYILAN_AYARLAR,
    denetle: denetle,
    girdiOlustur: girdiOlustur,
    panelHazirla: panelHazirla,
    panelKilit: panelKilit,
    ocrDuzelt: ocrDuzelt,
    elleDegerAyristir: elleDegerAyristir,
    ELLE_ALANLAR: ELLE_ALANLAR,
    BELGE_AD: BELGE_AD,
    kilitDurumu: kilitDurumu,
    karsilastir: karsilastir,
    sasiIncele: sasiIncele,
    kontrolHanesiHesapla: kontrolHanesiHesapla,
    kgAyristir: kgAyristir,
    kapAyristir: kapAyristir,
    ulkeNormalize: ulkeNormalize,
    ulkeAdresten: ulkeAdresten,
    wmiUlke: wmiUlke,
    parmakIzi: parmakIzi
  };
});
