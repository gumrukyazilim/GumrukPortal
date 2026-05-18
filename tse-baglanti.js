// ==================== TSE BAĞLANTI JS (GümrükPortal İçin) ====================
window.TSE = {
    api_url: 'http://localhost:8765',

    firmaIdBul: function(firmaAdi) {
        if (!firmaAdi) return "1";
        const f = firmaAdi.toUpperCase();
        if (f.includes("ŞAMNU")) return "1";
        if (f.includes("FF OTOMOTİV")) return "2";
        if (f.includes("SANDIKÇI")) return "3";
        if (f.includes("MASKAR")) return "4";
        return "1";
    },

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

    baslat: async function(sasi, firmaId, gelisTarihi, ozetBeyan, atr = 'YOK') {
        if (!sasi) {
            alert("Şasi numarası bulunamadı!");
            return;
        }

        const onay = confirm(`TSE Başvurusu başlatılsın mı?\n\nŞasi: ${sasi}\nFirma ID: ${firmaId}`);
        if (!onay) return;

        try {
            const response = await fetch('http://localhost:8765/basvuru', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                alert("✅ TSE başvurusu başlatıldı!\n\nTarayıcıda otomatik işlem başlayacak.");
            } else {
                alert("❌ Hata: " + (result.error || "Bilinmeyen hata"));
            }
        } catch (err) {
            alert("❌ Bot servisine bağlanılamadı!\n\nAPI_BASLAT.bat dosyasının açık olduğundan emin olun.");
            console.error(err);
        }
    }
};

console.log("✓ TSE Bot servisi BAĞLI");
