// Onboarding PAI: permite instalar la página como app.
// No guarda datos ni páginas en el celular: todo se lee siempre de internet, así nadie ve información vieja.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
