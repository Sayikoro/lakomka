"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/* mounted-флаг без setState в эффекте (Task 154).
   Классический паттерн useEffect(() => setMounted(true), []) триггерит
   правило react-hooks/set-state-in-effect (каскадные рендеры).
   useSyncExternalStore решает ту же задачу: на сервере и во время
   гидратации возвращается false (разметка совпадает с SSR), сразу после
   гидратации React перекатывается на клиентский снимок (true) и рисует
   живой контент — тот же визуальный результат, лишнего состояния нет.
   Нужно для gate'ов zustand/persist-корзины: до монтирования рисуем
   заглушку, чтобы SSR-HTML совпал с восстановленной корзиной. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
