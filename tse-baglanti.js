/**
 * ════════════════════════════════════════════════════════════════
 *  TSE BAŞVURUSU YAP — GümrükPortal Entegrasyonu
 * ════════════════════════════════════════════════════════════════
 *
 *  Bu dosyayı GümrükPortal projenize ekleyin:
 *  1) Bu dosyayı `tse-baglanti.js` olarak proje kök dizinine kaydedin
 *  2) index.html'in </body> etiketinden HEMEN ÖNCE ekleyin:
 *     <script src="tse-baglanti.js"></script>
 *
 *  Bot servisi açıkken (http://localhost:8765),
 *  her araç kartının yanına "TSE Başvurusu Yap" butonu otomatik eklenecek.
 * ════════════════════════════════════════════════════════════════
 */

const TSE_API_URL = "http://localhost:8765";

// ─── 1) Bot servisi açık mı kontrol et ───────────────────────────
async function botServisiAcikMi() {
    try {
        const r = await fetch(`${TSE_API_URL}/`, { method: "GET" });
        return r.ok;
    } catch (e) {
        return false;
    }
}

// ─── 2) Başvuruyu API'ye gönder ───────────────────────────────────
async function tseBasvuruGonder(aracVerisi) {
    // aracVerisi = { firma_id, sasi_no, gelis_tarihi, ozet_beyan, atr }
    
    const buton = document.activeElement;
    const eskiMetin = buton ? buton.innerText : "";
    
    try {
        if (buton) {
            buton.disabled = true;
            buton.innerText = "⏳ Gönderiliyor...";
        }
        
        const r = await fetch(`${TSE_API_URL}/basvuru`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(aracVerisi),
        });
        
        const data = await r.json();
        
        if (r.status === 202) {
            alert(
                "✅ TSE başvurusu başlatıldı!\n\n" +
                `Firma:    ${data.ozet.firma}\n` +
                `Şasi No:  ${data.ozet.sasi_no}\n` +
                `Geliş:    ${data.ozet.gelis_tarihi}\n` +
                `Beyan No: ${data.ozet.ozet_beyan}\n\n` +
                "Bot bilgisayarınızda Playwright tarayıcısını açacak.\n" +
                "Lütfen TSE giriş ekranında manuel onay verin."
            );
        } else if (r.status === 409) {
            alert("⚠️ Şu an başka bir başvuru çalışıyor.\n" + data.detail);
        } else if (r.status === 404) {
            alert("❌ Drive klasörü bulunamadı:\n" + data.detail);
        } else {
            alert(`❌ Hata (${r.status}):\n${data.detail || JSON.stringify(data)}`);
        }
    } catch (err) {
        alert(
            "❌ Bot servisine bağlanılamadı!\n\n" +
            "Kontrol listesi:\n" +
            "1) tse_bot.py çalışıyor mu? (cmd penceresi açık olmalı)\n" +
            "2) Adres doğru mu? " + TSE_API_URL + "\n\n" +
            "Hata: " + err.message
        );
    } finally {
        if (buton) {
            buton.disabled = false;
            buton.innerText = eskiMetin;
        }
    }
}

// ─── 3) Buton oluşturucu ──────────────────────────────────────────
function tseButonuOlustur(aracVerisi) {
    const btn = document.createElement("button");
    btn.innerText = "🚗 TSE Başvurusu Yap";
    btn.className = "tse-basvuru-btn";
    btn.style.cssText = `
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin: 4px;
        font-size: 13px;
        transition: transform 0.1s;
    `;
    btn.onmouseover = () => btn.style.transform = "scale(1.05)";
    btn.onmouseout  = () => btn.style.transform = "scale(1)";
    btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        tseBasvuruGonder(aracVerisi);
    };
    return btn;
}

// ─── 4) HER ARAÇ KARTI/SATIRINA BUTON EKLE ───────────────────────
/**
 * Bu fonksiyonu kendi portalınızdaki araç render fonksiyonunda çağırın.
 * 
 * ÖRNEK KULLANIM (kendi kodunuzda):
 * 
 *   const aracKarti = document.createElement('div');
 *   ... // aracın bilgileri render edilir ...
 *   
 *   const tseBtn = tseButonuOlustur({
 *       firma_id:     "1",                          // 1-4 arası
 *       sasi_no:      arac.sasiNo,
 *       gelis_tarihi: arac.gelisTarihi,             // "12.05.2026" veya "2026-05-12"
 *       ozet_beyan:   arac.ozetBeyanNo,
 *       atr:          arac.atrBelgesi ? "VAR" : "YOK"
 *   });
 *   aracKarti.appendChild(tseBtn);
 */

// ─── 5) FİRMA EŞLEŞTİRMESİ (kendi firma yapınıza göre uyarlayın) ─
const FIRMA_ESLESMESI = {
    "ŞAMNU GT":    "1",
    "SAMNU GT":    "1",
    "FF OTOMOTİV": "2",
    "FF OTOMOTIV": "2",
    "SANDIKÇI":    "3",
    "SANDIKCI":    "3",
    "MASKAR":      "4",
};

function firmaIdBul(firmaAdi) {
    if (!firmaAdi) return null;
    const ust = firmaAdi.toUpperCase().trim();
    for (const [k, v] of Object.entries(FIRMA_ESLESMESI)) {
        if (ust.includes(k.toUpperCase())) return v;
    }
    return null;
}

// ─── 6) ARAÇ DETAY PENCERESİNE BUTON EKLEME (örnek) ──────────────
/**
 * Bu fonksiyon araç detay modal'ı açıldığında çağrılır.
 * Modal'a "TSE Başvurusu Yap" butonu ekler.
 */
function tseBasvuruButonunuModalEkle(modalElement, arac) {
    // Önceden eklenmiş butonu temizle
    const eski = modalElement.querySelector(".tse-basvuru-btn");
    if (eski) eski.remove();
    
    const firmaId = firmaIdBul(arac.firma);
    if (!firmaId) {
        console.warn("TSE: Bilinmeyen firma:", arac.firma);
        return;
    }
    
    const btn = tseButonuOlustur({
        firma_id:     firmaId,
        sasi_no:      arac.sasiNo  || arac.sasi_no  || "",
        gelis_tarihi: arac.gelisTarihi || arac.gelis_tarihi || "",
        ozet_beyan:   arac.ozetBeyanNo || arac.ozet_beyan || "",
        atr:          (arac.atr === "VAR" || arac.atrBelgesi) ? "VAR" : "YOK",
    });
    
    // Modal başlığının yanına ekle
    const baslik = modalElement.querySelector("h2, .modal-title, .modal-header");
    if (baslik) {
        baslik.appendChild(btn);
    } else {
        modalElement.appendChild(btn);
    }
}

// ─── 7) GLOBAL ERİŞİM ─────────────────────────────────────────────
window.TSE = {
    api_url: TSE_API_URL,
    servisAcikMi: botServisiAcikMi,
    basvuruGonder: tseBasvuruGonder,
    butonOlustur: tseButonuOlustur,
    firmaIdBul: firmaIdBul,
    modalEkle: tseBasvuruButonunuModalEkle,
};

// ─── 8) BAŞLANGIÇ KONTROLÜ ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
    const acik = await botServisiAcikMi();
    if (acik) {
        console.log("%c✓ TSE Bot servisi BAĞLI", "color: green; font-weight: bold");
    } else {
        console.warn(
            "%c⚠ TSE Bot servisi KAPALI",
            "color: orange; font-weight: bold",
            "\nÇalıştırmak için: tse_bot.py'yi başlatın"
        );
    }
});
