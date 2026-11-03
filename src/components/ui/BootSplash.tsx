import { FUNNY_PHRASES } from "@/lib/funny-phrases";

/**
 * БУТ-СПЛЭШ — прелоадер со смешными фразами при ПОЛНОЙ загрузке страницы
 * (первый заход, F5, переход по ссылке из мессенджера, жёсткий фолбэк
 * навигации).
 *
 * Зачем он, если уже есть RoutePreloader: тот показывает оверлей только
 * при КЛИЕНТСКОЙ навигации (клик по внутренней ссылке) и только когда
 * переход длится дольше 150 мс. После разгрузки страниц (Task 135)
 * переходы почти всегда укладываются в этот порог, а ПЕРВАЯ загрузка
 * сайта им вообще не покрывалась — посетитель, особенно с телефона,
 * смотрел на белый экран, пока едут HTML, CSS и JS-чанки. Отсюда репорт
 * владельца: «прелоадера на стороне пользователя не появилось».
 *
 * Как работает: разметка сплэша — обычные элементы корневого layout,
 * они запекаются в статический HTML КАЖДОЙ страницы и отрисовываются
 * браузером сразу при парсинге. Все стили, от которых зависит первая
 * отрисовка, — инлайн (внешние CSS-файлы не ждём); следом идёт крошечный
 * инлайн-скрипт, которому не нужен JS-бандл:
 *   - ставит случайную фразу и ротирует их раз в 1.5 с;
 *   - прячет сплэш, когда страница распарсена (DOMContentLoaded),
 *     но не раньше 900 мс — короткая брендовая пауза, фразу успевают
 *     прочитать; страховочный потолок — 4 с;
 *   - на /admin* сплэш не показывается (админку перезагружают часто,
 *     заставка там только мешает);
 *   - при возврате по bfcache (pageshow.persisted) прячет остатки.
 *
 * Почему НЕ React-состояние: до гидратации React не работает, а на
 * медленной сети гидратация приходит последней — заставка обязана
 * показываться и прятаться БЕЗ JS-бандла. Поэтому скрытие делается
 * атрибутом data-boot на <html> + правилами CSS с !important (инлайновый
 * display:flex самого сплэша сильнее обычного правила — поймано на e2e:
 * после done заставка возвращалась), а не удалением узла:
 * узел остаётся в дереве React (гидратационных мисматчей нет — фраза
 * под suppressHydrationWarning, атрибуты <html> тоже), а @keyframes-страховка
 * boot-vanish прячет сплэш через 8 с даже с полностью выключенным JS.
 */

const BOOT_CSS = `
#boot-loader{transition:opacity .25s ease;animation:boot-vanish 0s 8s forwards}
html[data-boot="hidden"] #boot-loader{opacity:0!important;pointer-events:none!important}
html[data-boot="done"] #boot-loader{display:none!important}
@keyframes boot-spin{to{transform:rotate(360deg)}}
@keyframes boot-vanish{to{visibility:hidden;pointer-events:none}}
.boot-spin{animation:boot-spin 1s linear infinite}
`;

const PHRASES_JSON = JSON.stringify(FUNNY_PHRASES).replace(/</g, "\\u003c");

const BOOT_SCRIPT = `(function(){
try{
var h=document.documentElement;
if(h.getAttribute("data-boot")==="done")return;
var p=location.pathname||"";
if(p.indexOf("/admin")===0){h.setAttribute("data-boot","done");return;}
var b=document.getElementById("boot-loader");
if(!b)return;
window.__bootArmed=true;
var P=${PHRASES_JSON};
var el=document.getElementById("boot-phrase"),iv=0,i=0;
if(P&&P.length){
i=Math.floor(Math.random()*P.length);
if(el)el.textContent=P[i];
iv=setInterval(function(){i=(i+1)%P.length;if(el)el.textContent=P[i];},1500);
}
var done=false;
function hide(){
if(done)return;
done=true;
if(iv)clearInterval(iv);
h.setAttribute("data-boot","hidden");
setTimeout(function(){h.setAttribute("data-boot","done");},350);
}
var t0=Date.now();
function ready(){
var left=900-(Date.now()-t0);
setTimeout(hide,left>0?left:0);
}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",ready);}
else{ready();}
setTimeout(hide,4000);
window.addEventListener("pageshow",function(e){if(e.persisted)hide();});
}catch(e){
try{document.documentElement.setAttribute("data-boot","done");}catch(_){}
}
})();`;

export function BootSplash() {
  return (
    <>
      {/* Стили идут ПЕРЕД блоком сплэша: парсер применяет их к моменту
         первой отрисовки (скрытие по data-boot, вращение кольца,
         страховка boot-vanish). Всё, от чего зависит первый кадр,
         продублировано инлайн-стилями на самих элементах. */}
      <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
      <div
        id="boot-loader"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            position: "relative",
            width: 96,
            height: 96,
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="boot-spin"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderRadius: "50%",
              border: "4px solid rgba(2,116,190,0.2)",
              borderTopColor: "#0274BE",
            }}
          />
          <span style={{ fontSize: 36, lineHeight: 1 }}>🎁</span>
        </div>
        <p
          id="boot-phrase"
          suppressHydrationWarning
          style={{
            maxWidth: 448,
            padding: "0 24px",
            margin: 0,
            textAlign: "center",
            fontSize: 17,
            fontWeight: 500,
            color: "#3A3A3A",
            fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
          }}
        >
          {FUNNY_PHRASES[0]}
        </p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
    </>
  );
}
