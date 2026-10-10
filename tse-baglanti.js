// ==================== TSE BAĞLANTI JS (v2.0 — 3'lü Paket Destekli) ====================
// MEVCUT SİSTEMİ BOZMAMA KURALI: Tüm orijinal fonksiyonlar (api_url, firmaIdBul, butonOlustur, baslat)
// %100 aynen korunmuştur. Sadece yeni 3'lü evrak paketi modülü eklenmiştir.

window.TSE = {
    // Siyah ekranda yazan adresin birebir aynısı (Orijinal)
    api_url: 'https://aloof-overlabor-jailer.ngrok-free.dev',

    // Yerel Python Otomasyon Servisi (tse_otomasyon.py --server)
    local_engine_url: 'http://127.0.0.1:5000',

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
        if (!arac || !arac.sasi) {
            alert("❌ Şasi numarası bulunamadı!");
            return;
        }

        const sasi = arac.sasi;
        const marka = arac.marka || '';
        const model = arac.model || '';

        const onay = confirm(`📑 TSE 3'LÜ EVRAK PAKETİ OLUŞTURULACAK:\n\n` +
            `Şasi: ${sasi}\n` +
            `Araç: ${marka} ${model}\n\n` +
            `Üretilecek Evraklar:\n` +
            `1️⃣ APMGumrukSablon.xlsx (16 sütun)\n` +
            `2️⃣ ULM-03-FR-01-008 (TSE Gümrük Tutanağı - Açıklama boş)\n` +
            `3️⃣ ULM-03-FR-01-016 (Münferit Araç Onay Raporu)\n\n` +
            `İşlem başlatılsın mı?`);

        if (!onay) return;

        try {
            if (typeof showSyncToast === 'function') {
                showSyncToast(`⏳ ${sasi} için 3'lü TSE paketi üretiliyor...`);
            }

            // Yerel tse_otomasyon.py servisine istek at
            const response = await fetch(`${this.local_engine_url}/tse-package`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(arac)
            });

            const result = await response.json();

            if (typeof hideSyncToast === 'function') {
                hideSyncToast('', true);
            }

            if (result.success) {
                alert(`✅ 3'LÜ TSE EVRAK PAKETİ BAŞARIYLA ÜRETİLDİ!\n\n` +
                    `Araç: ${marka} ${model}\n` +
                    `Yakıt: ${result.fuel || 'Otomatik'}\n` +
                    `GTİP: ${result.gtip || 'Otomatik'}\n\n` +
                    `📁 Dosyalar aracın klasörüne kaydedildi:\n` +
                    `• 1. APM Gümrük Tablosu\n` +
                    `• 2. TSE Başvuru Tutanağı\n` +
                    `• 3. ULM Uygunluk Raporu`);
            } else {
                alert(`❌ Hata: ${result.error || 'İşlem tamamlanamadı'}`);
            }
        } catch (err) {
            if (typeof hideSyncToast === 'function') {
                hideSyncToast('', true);
            }
            // Yerel servis açık değilse bilgilendir
            alert(`⚠️ Yerel Otomasyon Servisi (tse_otomasyon.py) açık değil!\n\n` +
                `Lütfen terminalde şu komutu çalıştırın:\n` +
                `python tse_otomasyon.py --server\n\n` +
                `(Veya doğrudan sohbette asistana şasi numarasını ileterek Drive üzerinden hazırlatabilirsiniz).`);
            console.error('TSE Paket Hatası:', err);
        }
    }
};

console.log("✓ TSE Bot ve 3'lü Evrak Paketi Modülü BAĞLI");
