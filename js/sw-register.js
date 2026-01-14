        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(registration => {
                    console.log('ServiceWorker registrado:', registration.scope);
                }).catch(err => {
                    console.log('ServiceWorker error:', err);
                });
            });
        }
