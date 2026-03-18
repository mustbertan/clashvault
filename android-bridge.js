/**
 * android-bridge.js
 * ClashVault index.html'inin </head> tagından hemen önce ekle:
 *   <script src="android-bridge.js"></script>
 *
 * Bu dosya Android dışında (tarayıcı/PWA) hiçbir şey yapmaz.
 *
 * Yaptıkları:
 *   1. Ekran geçişlerini sayar → 5'te 1 interstitial
 *   2. Upload ekranına "reklam izle & yükle" kilit banner'ı enjekte eder
 *   3. Community ekranına kilit overlay'i enjekte eder (1 kez, kalıcı)
 *   4. Unlock sonuçlarını Android'den alıp UI'a yansıtır
 */

(function () {
    "use strict";

    /* ── Android kontrolü ─────────────────────────────────────────────────── */
    const IS_ANDROID = !!(window.AndroidApp
                          && typeof window.AndroidApp.isAndroid === "function"
                          && window.AndroidApp.isAndroid());

    if (!IS_ANDROID) {
        console.log("[Bridge] Not Android — skipping.");
        return;
    }
    console.log("[Bridge] Android mode active.");

    /* ════════════════════════════════════════════════════════════════════════
       1. EKRAN GEÇİŞ SAYACI — 5 geçişte 1 interstitial
    ════════════════════════════════════════════════════════════════════════ */
    const _origGoScreen = window.goScreen;
    window.goScreen = function (screenId) {
        try { window.AndroidApp.tickTransition(); } catch (e) {}

        if (_origGoScreen) _origGoScreen.apply(this, arguments);

        // Ekrana geçince ilgili kilit UI'ını güncelle
        if (screenId === "screen-upload")    setTimeout(refreshUploadLockUI, 80);
        if (screenId === "screen-community") setTimeout(refreshCommunityLockUI, 80);
    };

    /* ════════════════════════════════════════════════════════════════════════
       2. UPLOAD — her yüklemede reklam (kalıcı değil)
    ════════════════════════════════════════════════════════════════════════ */

    window.requestUploadAccess = function (onGranted) {
        window._pendingUploadCallback = onGranted;
        window.AndroidApp.requestUpload();
    };

    /**
     * Upload ekranına kilit bildirim banner'ı enjekte eder.
     * Sitenin mevcut .btn-upload-submit butonunun üstüne gelir.
     * Zaten eklenmişse tekrar eklemez.
     */
    function refreshUploadLockUI() {
        const screen = document.getElementById("screen-upload");
        if (!screen) return;
        if (screen.querySelector("#android-upload-lock-banner")) return;

        const submitBtn = screen.querySelector(".btn-upload-submit");
        if (!submitBtn) return;

        // ── Bilgilendirme banner'ı ──
        const banner = document.createElement("div");
        banner.id = "android-upload-lock-banner";
        banner.style.cssText = [
            "margin:0 0 .5rem 0",
            "padding:.55rem .6rem .5rem",
            "background:linear-gradient(135deg,rgba(245,166,35,.12),rgba(245,166,35,.05))",
            "border:1.5px solid rgba(245,166,35,.4)",
            "border-radius:.5rem",
            "display:flex",
            "align-items:flex-start",
            "gap:.4rem"
        ].join(";");
        banner.innerHTML =
            '<span style="font-size:1.1rem;flex-shrink:0;margin-top:.05rem;">🎬</span>' +
            '<div>' +
                '<div style="font-size:.42rem;font-weight:900;color:#F5A623;margin-bottom:.14rem;letter-spacing:.3px;">' +
                    'Base yüklemek için kısa bir reklam izle' +
                '</div>' +
                '<div style="font-size:.36rem;color:#B8926A;line-height:1.55;">' +
                    'Her yükleme öncesinde yaklaşık <strong style="color:#FFF3DC;">~30 saniyelik</strong> ' +
                    'ödüllü reklam izlemen gerekiyor. ' +
                    'Reklam bittikten sonra yükleme formu otomatik olarak gönderilir.' +
                '</div>' +
            '</div>';

        // ── "Reklam İzle ve Yükle" butonu ──
        const watchBtn = document.createElement("button");
        watchBtn.id = "android-upload-watch-btn";
        watchBtn.innerHTML = "🎬&nbsp; Reklam İzle ve Yükle";
        watchBtn.style.cssText = [
            "width:100%",
            "padding:.55rem",
            "border-radius:.44rem",
            "background:linear-gradient(135deg,#C47F0A,#F5A623)",
            "color:#1A0F00",
            "font-weight:900",
            "font-size:.53rem",
            "font-family:'Nunito',sans-serif",
            "border:none",
            "cursor:pointer",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "gap:.28rem",
            "box-shadow:0 4px 15px rgba(245,166,35,.4)",
            "margin-top:.22rem"
        ].join(";");

        watchBtn.addEventListener("click", function () {
            watchBtn.disabled = true;
            watchBtn.innerHTML = "⏳&nbsp; Reklam yükleniyor...";

            window.requestUploadAccess(function () {
                // Reklam izlendi → asıl submit butonunu tıkla
                watchBtn.disabled = false;
                watchBtn.innerHTML = "🎬&nbsp; Reklam İzle ve Yükle";
                submitBtn.click();
            });
        });

        // Orijinal submit'i gizle, banner + butonumuzu önüne ekle
        submitBtn.style.display = "none";
        submitBtn.parentNode.insertBefore(banner, submitBtn);
        submitBtn.parentNode.insertBefore(watchBtn, submitBtn);
    }

    /* ════════════════════════════════════════════════════════════════════════
       3. COMMUNITY — ilk girişte reklam, sonrası kalıcı açık
    ════════════════════════════════════════════════════════════════════════ */

    window.requestCommunityAccess = function (onGranted) {
        if (window.AndroidApp.isCommunityUnlocked()) {
            onGranted && onGranted();
            return;
        }
        window._pendingCommunityCallback = onGranted;
        window.AndroidApp.unlockCommunity();
    };

    /**
     * Community ekranına kilit overlay'i enjekte eder.
     * Zaten unlock edilmişse overlay gösterilmez / mevcutsa kaldırılır.
     */
    function refreshCommunityLockUI() {
        const screen = document.getElementById("screen-community");
        if (!screen) return;

        const alreadyUnlocked = window.AndroidApp.isCommunityUnlocked();

        if (alreadyUnlocked) {
            var ex = document.getElementById("android-community-lock-overlay");
            if (ex) ex.remove();
            return;
        }

        if (document.getElementById("android-community-lock-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "android-community-lock-overlay";
        overlay.style.cssText = [
            "position:absolute",
            "inset:0",
            "z-index:50",
            "background:rgba(26,15,0,.93)",
            "backdrop-filter:blur(6px)",
            "-webkit-backdrop-filter:blur(6px)",
            "display:flex",
            "flex-direction:column",
            "align-items:center",
            "justify-content:center",
            "padding:1.2rem .8rem",
            "text-align:center",
            "gap:.55rem"
        ].join(";");

        overlay.innerHTML =
            // Kilit ikonu
            '<div style="font-size:2.4rem;filter:drop-shadow(0 0 18px rgba(245,166,35,.4));">🔒</div>' +

            // Başlık
            '<div style="font-family:\'Cinzel Decorative\',serif;font-size:.62rem;color:#F5A623;' +
                'text-shadow:0 0 20px rgba(245,166,35,.4);line-height:1.3;">' +
                'Community Kilitli' +
            '</div>' +

            // Açıklama
            '<div style="font-size:.42rem;color:#B8926A;line-height:1.65;max-width:18rem;">' +
                'Topluluk içeriklerini görmek ve kendi base\'ini paylaşmak için ' +
                '<span style="color:#FFF3DC;font-weight:700;">kısa bir ödüllü reklam</span> izlemen gerekiyor.' +
                '<br><br>' +
                'Reklamı bir kez izledikten sonra ' +
                '<span style="color:#F5A623;font-weight:700;">Community kalıcı olarak açılır</span>' +
                ' — bir daha reklam sorulmaz.' +
            '</div>' +

            // Süre bilgisi kutusu
            '<div style="' +
                'background:rgba(245,166,35,.08);' +
                'border:1px solid rgba(245,166,35,.25);' +
                'border-radius:.44rem;' +
                'padding:.38rem .6rem;' +
                'display:flex;align-items:center;gap:.33rem;' +
            '">' +
                '<span style="font-size:.7rem;">🎬</span>' +
                '<span style="font-size:.38rem;color:#B8926A;line-height:1.4;">' +
                    'Yaklaşık <strong style="color:#FFF3DC;">~30 saniye</strong> sürecek<br>' +
                    'bir video reklam izleyeceksin.' +
                '</span>' +
            '</div>' +

            // Kilit açma butonu
            '<button id="android-community-unlock-btn" style="' +
                'margin-top:.22rem;' +
                'padding:.55rem 1.2rem;' +
                'background:linear-gradient(135deg,#C47F0A,#F5A623);' +
                'color:#1A0F00;font-weight:900;font-size:.53rem;' +
                'font-family:\'Nunito\',sans-serif;' +
                'border:none;border-radius:.44rem;cursor:pointer;' +
                'box-shadow:0 4px 20px rgba(245,166,35,.45);' +
                'display:flex;align-items:center;gap:.28rem;' +
            '">' +
                '🎬&nbsp; Reklam İzle ve Aç' +
            '</button>' +

            // Alt not
            // Geri butonu
            '<button onclick="window.goScreen(\'screen-home\')" style="' +
                'margin-top:.1rem;' +
                'padding:.38rem .9rem;' +
                'background:transparent;' +
                'color:#B8926A;font-weight:700;font-size:.42rem;' +
                'font-family:\'Nunito\',sans-serif;' +
                'border:1.5px solid rgba(107,63,18,.5);border-radius:.44rem;cursor:pointer;' +
            '">' +
                '← Geri Dön' +
            '</button>' +

            // Alt not
            '<div style="font-size:.33rem;color:#6B3F12;margin-top:.1rem;">' +
                'Reklamı izlemeden bu sekmeye erişilemez.' +
            '</div>';

        // Overlay screen içine eklenir — position:relative gerekli
        screen.style.position = "relative";
        screen.appendChild(overlay);

        // Butona olay dinleyici
        document.getElementById("android-community-unlock-btn").addEventListener("click", function () {
            var btn = document.getElementById("android-community-unlock-btn");
            btn.disabled = true;
            btn.innerHTML = "⏳&nbsp; Reklam yükleniyor...";

            window.requestCommunityAccess(function () {
                overlay.remove();
            });
        });
    }

    /* ════════════════════════════════════════════════════════════════════════
       4. UNLOCK SONUÇ HANDLER
       Android (AndroidBridge.java) → window.onAndroidUnlockResult(type, success)
    ════════════════════════════════════════════════════════════════════════ */
    window.onAndroidUnlockResult = function (type, success) {
        console.log("[Bridge] Unlock result:", type, success);

        if (type === "upload") {
            var watchBtn = document.getElementById("android-upload-watch-btn");
            if (success) {
                if (window._pendingUploadCallback) window._pendingUploadCallback();
            } else {
                if (watchBtn) {
                    watchBtn.disabled = false;
                    watchBtn.innerHTML = "🎬&nbsp; Reklam İzle ve Yükle";
                }
                showToast("⚠️ Reklam yüklenemedi, lütfen tekrar dene.");
            }
            window._pendingUploadCallback = null;
        }

        if (type === "community") {
            var unlockBtn = document.getElementById("android-community-unlock-btn");
            if (success) {
                if (window._pendingCommunityCallback) window._pendingCommunityCallback();
            } else {
                if (unlockBtn) {
                    unlockBtn.disabled = false;
                    unlockBtn.innerHTML = "🎬&nbsp; Reklam İzle ve Aç";
                }
                showToast("⚠️ Reklam yüklenemedi, lütfen tekrar dene.");
            }
            window._pendingCommunityCallback = null;
        }
    };

    /* ════════════════════════════════════════════════════════════════════════
       5. ANDROID READY — MainActivity sayfa yüklenince çağırır
    ════════════════════════════════════════════════════════════════════════ */
    window.onAndroidReady = function () {
        console.log("[Bridge] Android ready.");
        document.documentElement.style.setProperty("--android-banner-height", "50px");
    };

    /* ════════════════════════════════════════════════════════════════════════
       6. NAVBAR HOOK
       Upload → ekrana geç, kilit banner orada görünür
       Community → ekrana geç, kilit overlay orada görünür
    ════════════════════════════════════════════════════════════════════════ */
    function hookNavItems() {
        document.querySelectorAll('[onclick*="screen-upload"]').forEach(function (el) {
            var orig = el.getAttribute("onclick");
            el.removeAttribute("onclick");
            el.addEventListener("click", function (e) {
                e.stopPropagation();
                try { eval(orig); } catch (_) {}
                setTimeout(refreshUploadLockUI, 80);
            });
        });

        document.querySelectorAll('[onclick*="screen-community"]').forEach(function (el) {
            var orig = el.getAttribute("onclick");
            el.removeAttribute("onclick");
            el.addEventListener("click", function (e) {
                e.stopPropagation();
                try { eval(orig); } catch (_) {}
                setTimeout(refreshCommunityLockUI, 80);
            });
        });

        console.log("[Bridge] Nav hooks installed.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", hookNavItems);
    } else {
        hookNavItems();
    }

    /* ════════════════════════════════════════════════════════════════════════
       HELPER: Toast bildirimi
    ════════════════════════════════════════════════════════════════════════ */
    function showToast(msg) {
        if (window.showToast) { window.showToast(msg); return; }
        var t = document.createElement("div");
        t.textContent = msg;
        t.style.cssText = [
            "position:fixed","bottom:5rem","left:50%",
            "transform:translateX(-50%)",
            "background:#4A2D0D","color:#FFF3DC",
            "padding:.33rem .7rem","border-radius:.44rem",
            "font-size:.38rem","z-index:9999",
            "pointer-events:none",
            "border:1px solid rgba(245,166,35,.35)"
        ].join(";");
        document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 3500);
    }

})();
