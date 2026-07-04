import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

/**
 * Cada cuánto le pedimos al navegador que revise si hay un service worker
 * nuevo mientras la app está abierta. El ruteo es client-side, así que sin
 * esto una PWA que queda abierta días (típico en días de partidos) nunca
 * detecta un deploy nuevo. 30 min es suficiente sin machacar la red.
 */
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

/**
 * Muestra un toast "Hay una versión nueva · Actualizar" cuando se detecta un
 * deploy nuevo, en vez de recargar la página sola. No agrega ningún elemento
 * fijo a la UI: es un toast transitorio (sonner, el mismo que ya usa la app) y
 * el usuario decide cuándo aplicar la actualización — evita perder un marcador
 * a medio tipear.
 *
 * Existe porque el service worker se quedaba pegado en versiones viejas: como
 * el ruteo es client-side, index.html no se vuelve a pedir y el usuario seguía
 * con chunks viejos (ej.: octavos que el build nuevo ya desbloqueaba seguían
 * mostrando "Pronóstico no disponible").
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Chequeo periódico mientras la app está abierta. registration.update()
      // busca un sw.js nuevo; si lo hay, el flujo 'prompt' deja el SW en
      // waiting y needRefresh pasa a true (dispara el toast de abajo).
      setInterval(() => {
        registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast('⚡ Hay una versión nueva', {
      description: 'Actualizá para tener los últimos arreglos.',
      // Persistente: que no se escape antes de que el usuario lo vea. Se cierra
      // al tocar Actualizar (que recarga) o al descartarlo a mano.
      duration: Infinity,
      action: {
        label: 'Actualizar',
        // updateServiceWorker(true) hace skip waiting + recarga la página.
        onClick: () => updateServiceWorker(true),
      },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, updateServiceWorker]);
}
