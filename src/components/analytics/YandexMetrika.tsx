"use client";

import Script from "next/script";

/* ============================================================
   Яндекс.Метрика (Task 107): официальный сниппет счётчика.
   Монтируется в layout витрины только когда в админке задан
   номер счётчика (ym_id) — без него ничего не рендерится.
   afterInteractive: не тормозит первый рендер страницы.
   ============================================================ */

interface Props {
  counterId: string;
}

export function YandexMetrika({ counterId }: Props) {
  /* Запоминаем id в window — ymReachGoal() из lib/metrika шлёт цели
     именно в этот счётчик. */
  const snippet = `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
window.__ymCounterId = ${JSON.stringify(counterId)};
ym(${JSON.stringify(counterId)}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true });`;

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: snippet }}
      />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${encodeURIComponent(counterId)}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
